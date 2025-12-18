import { createServerFn } from '@tanstack/react-start'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'
import type { ScanConfig, ScanLog, ScanResult } from '@/components/scanner/types'
import { getConfig } from './scanner-config'
import { 
  calculateProgress,
  extractLinksFromHtml, 
  extractLinksFromPage,
  formatElapsedTime,
  generateScanId, 
  isSameDomain, 
  normalizeUrl 
} from './scanner-utils'
import { 
  getScanControl, 
  setScanPaused, 
  setScanStopped, 
  initializeScanControl, 
  cleanupScanControl 
} from './scanner-control'

// Global store for streaming logs (in-memory, will be cleared on server restart)
const scanLogsStore = new Map<string, ScanLog[]>()

// Global store for scan results (for real-time access)
const scanResultsStore = new Map<string, ScanResult[]>()

// Server function to get logs for a scan session
export const getScanLogs = createServerFn({ method: 'POST' })
  .inputValidator((data: { scanId: string }) => data)
  .handler(async ({ data }) => {
    const { scanId } = data
    return scanLogsStore.get(scanId) || []
  })

// Server function to get results for a scan session
export const getScanResults = createServerFn({ method: 'POST' })
  .inputValidator((data: { scanId: string }) => data)
  .handler(async ({ data }) => {
    const { scanId } = data
    return scanResultsStore.get(scanId) || []
  })

// Server function to pause/resume scan
export const pauseScan = createServerFn({ method: 'POST' })
  .inputValidator((data: { scanId: string }) => data)
  .handler(async ({ data }) => {
    const { scanId } = data
    setScanPaused(scanId, true)
    return { success: true, message: 'Scan paused' }
  })

export const resumeScan = createServerFn({ method: 'POST' })
  .inputValidator((data: { scanId: string }) => data)
  .handler(async ({ data }) => {
    const { scanId } = data
    setScanPaused(scanId, false)
    return { success: true, message: 'Scan resumed' }
  })

export const stopScan = createServerFn({ method: 'POST' })
  .inputValidator((data: { scanId: string }) => data)
  .handler(async ({ data }) => {
    const { scanId } = data
    setScanStopped(scanId, true)
    return { success: true, message: 'Scan stopped' }
  })

export const scanWebsite = createServerFn({ method: 'POST' })
  .inputValidator((data: ScanConfig) => data)
  .handler(async ({ data }) => {
    const { 
      url, 
      loginUrl, 
      username, 
      password, 
      usernameField, 
      passwordField, 
      maxDepth, 
      maxPages,
      timeout,
      maxConcurrentRequests: maxConcurrentRequestsConfig,
      usePuppeteer: usePuppeteerConfig,
      scanId: providedScanId
    } = data
    
    // Get config
    const config = getConfig()
    
    // Use config defaults if not provided
    const REQUEST_TIMEOUT = timeout || config.defaultTimeout
    const MAX_DEPTH = maxDepth ?? config.maxDepth
    const MAX_PAGES = maxPages ?? config.maxPages
    const MAX_CONCURRENT = maxConcurrentRequestsConfig ?? config.maxConcurrentRequests
    
    // Use a mutable variable for Puppeteer enable/disable
    let usePuppeteer = usePuppeteerConfig ?? config.puppeteer.enabled
    
    // Use provided scanId or generate unique scan ID for this session
    const scanId = providedScanId || generateScanId()
    
    // Track scan start time for elapsed time calculation
    const scanStartTime = Date.now()
    
    // Track performance metrics and statistics
    const responseTimes: number[] = []
    let totalErrors = 0
    let totalLinksFound = 0 // Track total links found across all pages
    
    // Initialize data structures
    const results: ScanResult[] = []
    const visited = new Set<string>()
    const queue: Array<{ url: string; depth: number }> = []
    
    // Initialize logs array in store
    scanLogsStore.set(scanId, [])
    
    // Array to collect logs for UI display (also stored in global store for streaming)
    const logs: ScanLog[] = []
    
    // Helper function to log with enhanced information
    const log = (
      type: 'info' | 'success' | 'error' | 'warning', 
      message: string, 
      details?: string, 
      url?: string,
      responseTime?: number
    ) => {
      const timestamp = new Date().toISOString()
      const elapsedTime = Date.now() - scanStartTime
      
      // Calculate statistics
      const urlsScanned = results.length
      const errors = totalErrors
      const queueSize = queue.length
      const visitedCount = visited.size
      
      // Calculate progress
      const progressPercentage = calculateProgress(urlsScanned, visitedCount + queueSize)
      
      // Calculate average response time
      if (responseTime !== undefined) {
        responseTimes.push(responseTime)
      }
      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : undefined
      
      // Build log message
      const logMessage = config.logging.showTimestamp
        ? `[${timestamp}] [${type.toUpperCase()}] ${message}${url ? ` | URL: ${url}` : ''}${details ? ` | ${details}` : ''}`
        : `[${type.toUpperCase()}] ${message}${url ? ` | URL: ${url}` : ''}${details ? ` | ${details}` : ''}`
      
      if (config.logging.enabled) {
        console.log(logMessage)
      }
      
      // Create log entry with enhanced information
      const logEntry: ScanLog = {
        type,
        message,
        timestamp,
        url,
        details,
      }
      
      // Add progress information if enabled
      if (config.logging.showProgress) {
        logEntry.progress = {
          current: urlsScanned,
          total: visitedCount + queueSize,
          percentage: progressPercentage,
        }
      }
      
      // Add statistics if enabled
      if (config.logging.showStatistics) {
        logEntry.statistics = {
          urlsScanned,
          linksFound: totalLinksFound,
          errors,
          queueSize,
          visitedCount,
        }
      }
      
      // Add performance metrics if enabled
      if (config.logging.showPerformance && (responseTime !== undefined || averageResponseTime !== undefined)) {
        logEntry.performance = {
          responseTime,
          elapsedTime,
          averageResponseTime,
        }
      }
      
      // Add to logs array
      logs.push(logEntry)
      
      // Also add to global store for real-time streaming
      const storeLogs = scanLogsStore.get(scanId) || []
      storeLogs.push(logEntry)
      
      // Limit log entries to prevent memory issues
      if (storeLogs.length > config.logging.maxLogEntries) {
        storeLogs.shift() // Remove oldest log
      }
      
      scanLogsStore.set(scanId, storeLogs)
    }
    
    // Helper function to update results store
    const updateResultsStore = () => {
      scanResultsStore.set(scanId, [...results])
    }
    
    // Helper function to wait if paused
    const waitIfPaused = async () => {
      while (true) {
        const control = getScanControl(scanId)
        if (control.isStopped) {
          throw new Error('Scan stopped by user')
        }
        if (!control.isPaused) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 100)) // Check every 100ms
      }
    }

    // Helper function to fetch with timeout
    const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT): Promise<Response> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return response
      } catch (error) {
        clearTimeout(timeoutId)
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeoutMs}ms`)
        }
        throw error
      }
    }

    // Helper function to get set-cookie headers (compatible with Node.js fetch)
    const getSetCookies = (headers: Headers): string[] => {
      // Try different methods to get set-cookie headers
      // Note: Node.js fetch Headers doesn't have getAll, so we use get
      const setCookie = headers.get('set-cookie')
      return setCookie ? [setCookie] : []
    }

    // Initialize Puppeteer browser if enabled
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
    let page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>> | null = null

    if (usePuppeteer) {
      try {
        log('info', 'Starting Puppeteer browser...', '', '')
        browser = await puppeteer.launch({
          headless: config.puppeteer.headless,
          args: config.puppeteer.args,
        })
        page = await browser.newPage()
        await page.setViewport({ 
          width: config.puppeteer.viewport.width, 
          height: config.puppeteer.viewport.height 
        })
        await page.setUserAgent(config.puppeteer.userAgent)
        log('success', 'Puppeteer browser started', '', '')
      } catch (error) {
        log('error', 'Failed to start Puppeteer', error instanceof Error ? error.message : 'Unknown error', '')
        log('warning', 'Will use fetch/cheerio instead', '', '')
        usePuppeteer = false
      }
    }

    let sessionCookies = ''
    let loginRedirectUrl: string | null = null

    // Use utility functions from scanner-utils.ts
    // normalizeUrl and isSameDomain are now imported

    // Login logic
    if (loginUrl && username && password) {
      log('info', 'Starting login process...', '', loginUrl)
      
      if (usePuppeteer && page) {
        try {
          log('info', 'Using Puppeteer to login', '', loginUrl)
          await page.goto(loginUrl, { 
            waitUntil: config.puppeteer.waitForNavigation.waitUntil, 
            timeout: config.puppeteer.waitForNavigation.timeout 
          })
          
          // Auto-detect or use provided field names
          const detectedFields = await page.evaluate(() => {
            const usernameInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"], input[id*="user"], input[id*="login"]'))
            const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'))
            
            return {
              usernameField: usernameInputs[0]?.getAttribute('name') || usernameInputs[0]?.getAttribute('id') || 'username',
              passwordField: passwordInputs[0]?.getAttribute('name') || passwordInputs[0]?.getAttribute('id') || 'password',
            }
          })
          
          const finalUsernameField = usernameField || detectedFields.usernameField
          const finalPasswordField = passwordField || detectedFields.passwordField
          
          log('info', `Using fields: ${finalUsernameField} / ${finalPasswordField}`, '', loginUrl)
          
          // Fill in credentials
          await page.type(`input[name="${finalUsernameField}"], input[id="${finalUsernameField}"]`, username, { delay: 50 })
          await page.type(`input[name="${finalPasswordField}"], input[id="${finalPasswordField}"]`, password, { delay: 50 })
          
          // Submit form
          await Promise.all([
            page.waitForNavigation({ 
              waitUntil: config.puppeteer.waitForNavigation.waitUntil, 
              timeout: config.puppeteer.waitForNavigation.timeout 
            }),
            page.click('button[type="submit"], input[type="submit"], form button, form input[type="submit"]').catch(() => {
              // If no submit button, try pressing Enter
              return page.keyboard.press('Enter')
            }),
          ])
          
          // Get cookies from Puppeteer
          const cookies = await page.cookies()
          sessionCookies = cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join('; ')
          
          const currentUrl = page.url()
          loginRedirectUrl = currentUrl
          
          log('success', `Login successful with Puppeteer`, `Redirected to: ${currentUrl}`, currentUrl)
          
          // Verify login success
          const pageContent = await page.content()
          const isStillLoginPage = pageContent.toLowerCase().includes('login') || 
                                  pageContent.toLowerCase().includes('đăng nhập') ||
                                  currentUrl.toLowerCase().includes('login') ||
                                  currentUrl.toLowerCase().includes('dang-nhap')
          
          if (isStillLoginPage) {
            log('warning', 'Login may have failed, still on login page', '', currentUrl)
          } else {
            log('success', 'Login confirmed successful', '', currentUrl)
          }
        } catch (error) {
          log('error', 'Error logging in with Puppeteer', error instanceof Error ? error.message : 'Unknown error', loginUrl)
          usePuppeteer = false
        }
      }
      
      if (!usePuppeteer || !page) {
        // Fallback to fetch/cheerio login
        try {
          log('info', 'Using fetch/cheerio to login', '', loginUrl)
          
          const loginPageResponse = await fetchWithTimeout(loginUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          }, REQUEST_TIMEOUT)
          
          if (!loginPageResponse.ok) {
            throw new Error(`Failed to fetch login page: ${loginPageResponse.status} ${loginPageResponse.statusText}`)
          }
          
          const loginPageHtml = await loginPageResponse.text()
          const $loginPage = cheerio.load(loginPageHtml)
          
          const initialCookieHeaders = getSetCookies(loginPageResponse.headers)
          const currentCookies = initialCookieHeaders.join('; ')
          
          // Parse cookies to extract XSRF-TOKEN
          const cookieMap = new Map<string, string>()
          if (currentCookies) {
            currentCookies.split('; ').forEach(cookie => {
              const [name, ...valueParts] = cookie.split('=')
              if (name && valueParts.length > 0) {
                cookieMap.set(name.trim(), decodeURIComponent(valueParts.join('=')))
              }
            })
          }
          
          // Extract CSRF token from various sources
          let csrfToken = ''
          
          // Try to get from hidden input fields
          const csrfInputs = [
            $loginPage('input[name="_token"]').attr('value'),
            $loginPage('input[name="csrf_token"]').attr('value'),
            $loginPage('input[name="authenticity_token"]').attr('value'),
            $loginPage('meta[name="csrf-token"]').attr('content'),
            $loginPage('meta[name="_token"]').attr('content'),
          ].filter(Boolean)
          
          if (csrfInputs.length > 0) {
            csrfToken = csrfInputs[0] || ''
          }
          
          // Also try to get XSRF-TOKEN from cookies (Laravel)
          if (!csrfToken && cookieMap.has('XSRF-TOKEN')) {
            try {
              const xsrfValue = cookieMap.get('XSRF-TOKEN') || ''
              csrfToken = decodeURIComponent(xsrfValue)
            } catch {
              // Ignore decode errors
            }
          }
          
          if (csrfToken) {
            log('info', 'CSRF token found', '', loginUrl)
          } else {
            log('warning', 'CSRF token not found, may not be required', '', loginUrl)
          }
          
          // Auto-detect username and password field names
          const detectedUsernameField = usernameField || 
            $loginPage('input[type="text"][name*="user"], input[type="email"][name*="user"], input[type="text"][name*="login"], input[type="email"][name*="login"]').attr('name') ||
            $loginPage('input[type="text"][id*="user"], input[type="email"][id*="user"], input[type="text"][id*="login"], input[type="email"][id*="login"]').attr('id') ||
            'username'
          
          const detectedPasswordField = passwordField || 
            $loginPage('input[type="password"]').attr('name') ||
            $loginPage('input[type="password"]').attr('id') ||
            'password'
          
          log('info', `Using fields: ${detectedUsernameField} / ${detectedPasswordField}`, '', loginUrl)
          
          // Prepare form data
          const formData: Record<string, string> = {
            [detectedUsernameField]: username,
            [detectedPasswordField]: password,
          }
          
          // Add CSRF token if found
          if (csrfToken) {
            formData._token = csrfToken
            formData.csrf_token = csrfToken
            formData.authenticity_token = csrfToken
          }
          
          // Determine content type and prepare body
          const formAction = $loginPage('form').attr('action') || loginUrl
          const formMethod = ($loginPage('form').attr('method') || 'POST').toUpperCase()
          const formEnctype = $loginPage('form').attr('enctype') || 'application/x-www-form-urlencoded'
          
          let requestBody: string
          let contentType: string
          
          if (formEnctype.includes('json') || formEnctype.includes('application/json')) {
            contentType = 'application/json'
            requestBody = JSON.stringify(formData)
          } else {
            contentType = 'application/x-www-form-urlencoded'
            requestBody = new URLSearchParams(formData).toString()
          }
          
          // Prepare headers
          const loginHeaders: HeadersInit = {
            'Content-Type': contentType,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': loginUrl,
            'Origin': new URL(loginUrl).origin,
          }
          
          // Add cookies
          if (currentCookies) {
            loginHeaders.Cookie = currentCookies
          }
          
          // Add CSRF token to headers if available
          if (csrfToken) {
            loginHeaders['X-XSRF-TOKEN'] = csrfToken
            loginHeaders['X-CSRF-TOKEN'] = csrfToken
          }
          
          // Submit login form
          const loginResponse = await fetchWithTimeout(formAction, {
            method: formMethod,
            headers: loginHeaders,
            body: requestBody,
            redirect: 'manual', // Handle redirects manually
          }, REQUEST_TIMEOUT)
          
          // Handle redirects
          if (loginResponse.status >= 300 && loginResponse.status < 400) {
            const location = loginResponse.headers.get('Location')
            if (location) {
              loginRedirectUrl = new URL(location, loginUrl).href
              log('info', `Login redirected to: ${loginRedirectUrl}`, '', loginRedirectUrl)
            }
          }
          
          // Get cookies from response
          const cookieHeaders = getSetCookies(loginResponse.headers)
          
          log('info', `Received ${cookieHeaders.length} cookie(s) from response`, '', loginResponse.url)
          
          // Merge cookies - keep unique cookie names
          const cookieMapAfter = new Map<string, string>()
          
          // Parse existing cookies
          if (currentCookies) {
            currentCookies.split('; ').forEach(cookie => {
              const [name, ...valueParts] = cookie.split('=')
              if (name && valueParts.length > 0) {
                cookieMapAfter.set(name.trim(), decodeURIComponent(valueParts.join('=')))
              }
            })
          }
          
          // Add new cookies from response
          cookieHeaders.forEach(cookieHeader => {
            const cookieParts = cookieHeader.split(';')[0].split('=')
            if (cookieParts.length >= 2) {
              const cookieName = cookieParts[0].trim()
              const cookieValue = cookieParts.slice(1).join('=')
              cookieMapAfter.set(cookieName, cookieValue)
            }
          })
          
          // Rebuild cookie string
          sessionCookies = Array.from(cookieMapAfter.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ')
          
          log('success', 'Received and merged cookies from login response', `Total cookies: ${cookieMapAfter.size}`, loginResponse.url)
          
          // If 419 CSRF token mismatch, retry with fresh token
          if (loginResponse.status === 419) {
            log('warning', 'CSRF token mismatch (419), retrying with new token...', '', loginUrl)
            
            // Fetch fresh login page
            const retryLoginPageResponse = await fetchWithTimeout(loginUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            }, REQUEST_TIMEOUT)
            
            const retryLoginPageHtml = await retryLoginPageResponse.text()
            const $retryLoginPage = cheerio.load(retryLoginPageHtml)
            
            const retryCookieHeaders = getSetCookies(retryLoginPageResponse.headers)
            const retryCookieMap = new Map<string, string>()
            if (currentCookies) {
              currentCookies.split('; ').forEach(cookie => {
                const [name, ...valueParts] = cookie.split('=')
                if (name && valueParts.length > 0) {
                  retryCookieMap.set(name.trim(), decodeURIComponent(valueParts.join('=')))
                }
              })
            }
            retryCookieHeaders.forEach(cookieHeader => {
              const cookieParts = cookieHeader.split(';')[0].split('=')
              if (cookieParts.length >= 2) {
                const cookieName = cookieParts[0].trim()
                const cookieValue = cookieParts.slice(1).join('=')
                retryCookieMap.set(cookieName, cookieValue)
              }
            })
            
            // Get fresh CSRF token
            const freshCsrfInputs = [
              $retryLoginPage('input[name="_token"]').attr('value'),
              $retryLoginPage('input[name="csrf_token"]').attr('value'),
              $retryLoginPage('input[name="authenticity_token"]').attr('value'),
              $retryLoginPage('meta[name="csrf-token"]').attr('content'),
              $retryLoginPage('meta[name="_token"]').attr('content'),
            ].filter(Boolean)
            
            const freshCsrfToken = freshCsrfInputs[0] || ''
            
            if (freshCsrfToken) {
              log('info', 'Retrieved new CSRF token', '', loginUrl)
              
              // Retry login with fresh token
              const retryFormData: Record<string, string> = {
                [detectedUsernameField]: username,
                [detectedPasswordField]: password,
                _token: freshCsrfToken,
                csrf_token: freshCsrfToken,
                authenticity_token: freshCsrfToken,
              }
              
              const retryRequestBody = new URLSearchParams(retryFormData).toString()
              const retryCookies = Array.from(retryCookieMap.entries())
                .map(([name, value]) => `${name}=${value}`)
                .join('; ')
              
              const retryLoginResponse = await fetchWithTimeout(formAction, {
                method: formMethod,
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': loginUrl,
                  'Origin': new URL(loginUrl).origin,
                  'Cookie': retryCookies,
                  'X-XSRF-TOKEN': freshCsrfToken,
                  'X-CSRF-TOKEN': freshCsrfToken,
                },
                body: retryRequestBody,
                redirect: 'manual',
              }, REQUEST_TIMEOUT)
              
              // Update cookies from retry response
              const retryCookieHeaders = getSetCookies(retryLoginResponse.headers)
              retryCookieHeaders.forEach(cookieHeader => {
                const cookieParts = cookieHeader.split(';')[0].split('=')
                if (cookieParts.length >= 2) {
                  const cookieName = cookieParts[0].trim()
                  const cookieValue = cookieParts.slice(1).join('=')
                  retryCookieMap.set(cookieName, cookieValue)
                }
              })
              
              sessionCookies = Array.from(retryCookieMap.entries())
                .map(([name, value]) => `${name}=${value}`)
                .join('; ')
              
              if (retryLoginResponse.status >= 300 && retryLoginResponse.status < 400) {
                const location = retryLoginResponse.headers.get('Location')
                if (location) {
                  loginRedirectUrl = new URL(location, loginUrl).href
                  log('info', `Retry login redirected to: ${loginRedirectUrl}`, '', loginRedirectUrl)
                }
              }
              
              log('success', 'Retry login successful', `Status: ${retryLoginResponse.status}`, retryLoginResponse.url)
            }
          } else {
            // Use final URL if no redirect header
            if (!loginRedirectUrl) {
              loginRedirectUrl = loginResponse.url
            }
            log('success', 'Login successful', `Status: ${loginResponse.status}`, loginResponse.url)
          }
        } catch (error) {
          log('error', 'Error during login', error instanceof Error ? error.message : 'Unknown error', loginUrl)
        }
      }
    }

    // Determine starting URL for scanning
    let startUrl = url
    if (loginRedirectUrl) {
      startUrl = loginRedirectUrl
      log('info', `Starting scan from URL after login: ${startUrl}`, '', startUrl)
    } else if (loginUrl && username && password) {
      // Verify login by fetching the start URL
      try {
        const verifyResponse = await fetchWithTimeout(startUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': sessionCookies,
          },
        }, REQUEST_TIMEOUT)
        
        const verifyHtml = await verifyResponse.text()
        const isStillLoginPage = verifyHtml.toLowerCase().includes('login') || 
                                verifyHtml.toLowerCase().includes('đăng nhập') ||
                                startUrl.toLowerCase().includes('login') ||
                                startUrl.toLowerCase().includes('dang-nhap')
        
        if (isStillLoginPage) {
          log('warning', 'Login may have failed, still on login page', '', startUrl)
          startUrl = url // Fallback to original URL
        } else {
          log('success', 'Login confirmed successful, starting scan', '', startUrl)
        }
      } catch (error) {
        log('warning', 'Unable to verify login, continuing with original URL', error instanceof Error ? error.message : 'Unknown error', startUrl)
      }
    }

    // Add starting URL to queue
    queue.push({ url: startUrl, depth: 0 })
    visited.add(startUrl)

    // Helper function to scan a single URL
    const scanSingleUrl = async (currentUrl: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH) {
        return
      }
      
      log('info', `Scanning URL (Depth: ${depth})`, `Queue: ${queue.length}, Visited: ${visited.size}`, currentUrl)
      
      let statusCode = 0
      let html = ''
      const startTime = Date.now()
      
      try {
        if (usePuppeteer && browser) {
          // Create a new page for parallel scanning
          const scanPage = await browser.newPage()
          try {
            log('info', 'Using Puppeteer to scan page', '', currentUrl)
            
            const response = await scanPage.goto(currentUrl, { 
              waitUntil: config.puppeteer.waitForNavigation.waitUntil, 
              timeout: REQUEST_TIMEOUT 
            })
            statusCode = response?.status() || 200
            // Wait for dynamic content to load
            await new Promise(resolve => setTimeout(resolve, config.puppeteer.dynamicContentWait))
            html = await scanPage.content()
            
            const responseTime = Date.now() - startTime
            
            // Log based on status code with performance metrics
            if (statusCode >= 200 && statusCode < 300) {
              log('success', `Scan successful with Puppeteer`, `Status: ${statusCode}`, currentUrl, responseTime)
            } else if (statusCode >= 400 && statusCode < 500) {
              log('warning', `Client error with Puppeteer`, `Status: ${statusCode}`, currentUrl, responseTime)
            } else if (statusCode >= 500) {
              log('error', `Server error with Puppeteer`, `Status: ${statusCode}`, currentUrl, responseTime)
              totalErrors++
            } else {
              log('info', `Scan completed with Puppeteer`, `Status: ${statusCode}`, currentUrl, responseTime)
            }
            
            // Use utility function for link extraction
            const pageLinks = await extractLinksFromPage(scanPage) as string[]
            
            let linkCount = 0
            for (const href of pageLinks) {
              const normalizedUrl = normalizeUrl(href, currentUrl)
              if (normalizedUrl && isSameDomain(normalizedUrl, url) && !visited.has(normalizedUrl)) {
                linkCount++
                if (depth < MAX_DEPTH) {
                  queue.push({ url: normalizedUrl, depth: depth + 1 })
                  visited.add(normalizedUrl)
                }
              }
            }
            totalLinksFound += linkCount
            log('info', `Found ${linkCount} new links with Puppeteer`, `Total: ${totalLinksFound}`, currentUrl, responseTime)
            
            // Determine status based on status code
            const resultStatus = statusCode >= 200 && statusCode < 300 ? 'success' : 'error'
            
            const result: ScanResult = {
              url: currentUrl,
              status: resultStatus,
              statusCode,
              links: pageLinks.filter((href: string) => {
                const normalizedUrl = normalizeUrl(href, currentUrl)
                return normalizedUrl && isSameDomain(normalizedUrl, url)
              }).map((href: string) => {
                const normalized = normalizeUrl(href, currentUrl)
                return normalized || null
              }).filter((url): url is string => Boolean(url)),
              responseBody: (statusCode >= 400 && statusCode < 600) ? html.substring(0, 1000) : undefined,
              error: resultStatus === 'error' ? `HTTP ${statusCode}` : undefined,
              timestamp: new Date().toISOString(),
              depth,
            }
            results.push(result)
            updateResultsStore()
            
            await scanPage.close()
          } catch (puppeteerError) {
            await scanPage.close().catch(() => {})
            log('error', 'Error scanning with Puppeteer', puppeteerError instanceof Error ? puppeteerError.message : 'Unknown error', currentUrl)
            throw puppeteerError
          }
        } else {
          // Fallback to fetch/cheerio method
          const response = await fetchWithTimeout(currentUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Cookie': sessionCookies,
            },
          }, REQUEST_TIMEOUT)
          
          statusCode = response.status
          html = await response.text()
          
          const responseTime = Date.now() - startTime
          
          // Log based on status code with performance metrics
          if (statusCode >= 200 && statusCode < 300) {
            log('success', `Scan successful`, `Status: ${statusCode}`, currentUrl, responseTime)
          } else if (statusCode >= 400 && statusCode < 500) {
            log('warning', `Client error`, `Status: ${statusCode}`, currentUrl, responseTime)
          } else if (statusCode >= 500) {
            log('error', `Server error`, `Status: ${statusCode}`, currentUrl, responseTime)
            totalErrors++
          } else {
            log('info', `Scan completed`, `Status: ${statusCode}`, currentUrl, responseTime)
          }
          
          // Use utility function for link extraction
          const links = extractLinksFromHtml(html, currentUrl)
          
          let linkCount = 0
          const normalizedLinks: string[] = []
          
          for (const href of links) {
            const normalizedUrl = normalizeUrl(href, currentUrl)
            if (normalizedUrl && isSameDomain(normalizedUrl, url) && !visited.has(normalizedUrl)) {
              normalizedLinks.push(normalizedUrl)
              linkCount++
              if (depth < MAX_DEPTH) {
                queue.push({ url: normalizedUrl, depth: depth + 1 })
                visited.add(normalizedUrl)
              }
            }
          }
          
          totalLinksFound += linkCount
          log('info', `Found ${linkCount} new links`, `Total: ${totalLinksFound}`, currentUrl, responseTime)
          
          // Determine status based on status code
          const resultStatus = statusCode >= 200 && statusCode < 300 ? 'success' : 'error'
          
          const result: ScanResult = {
            url: currentUrl,
            status: resultStatus,
            statusCode,
            links: normalizedLinks,
            responseBody: (statusCode >= 400 && statusCode < 600) ? html.substring(0, 1000) : undefined, // Store first 1000 chars for errors
            error: resultStatus === 'error' ? `HTTP ${statusCode}` : undefined,
            timestamp: new Date().toISOString(),
            depth,
          }
          results.push(result)
          updateResultsStore()
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        totalErrors++
        log('error', `Error scanning URL`, errorMessage, currentUrl)
        
        // Try to get status code from error if available
        let errorStatusCode: number | undefined
        let errorResponseBody: string | undefined
        
        if (error instanceof Error && 'response' in error) {
          const response = (error as { response?: { status?: number; text?: () => Promise<string> } }).response
          if (response) {
            errorStatusCode = response.status
            try {
              if (response.text) {
                errorResponseBody = (await response.text()).substring(0, 1000)
              }
            } catch {
              // Ignore text extraction errors
            }
          }
        }
        
        results.push({
          url: currentUrl,
          status: 'error',
          statusCode: errorStatusCode,
          error: errorMessage,
          responseBody: errorResponseBody,
          links: [],
          timestamp: new Date().toISOString(),
          depth,
        })
        updateResultsStore()
      }
    }

    // Helper function to run parallel scanning with concurrency limit
    const runParallelScan = async () => {
      const maxConcurrent = MAX_CONCURRENT
      const activePromises: Promise<void>[] = []
      
      while (queue.length > 0 && results.length < MAX_PAGES) {
        // Check if paused or stopped
        await waitIfPaused()
        
        // Start new scans up to concurrency limit
        while (activePromises.length < maxConcurrent && queue.length > 0 && results.length < MAX_PAGES) {
          const queueItem = queue.shift()
          if (!queueItem) break
          
          const { url: currentUrl, depth } = queueItem
          const promise = scanSingleUrl(currentUrl, depth).catch((error) => {
            // Error already handled in scanSingleUrl
            console.error('Scan error:', error)
          }).finally(() => {
            // Remove from active promises when done
            const index = activePromises.indexOf(promise)
            if (index > -1) {
              activePromises.splice(index, 1)
            }
          })
          
          activePromises.push(promise)
        }
        
        // Wait for at least one promise to complete before starting more
        if (activePromises.length >= maxConcurrent) {
          await Promise.race(activePromises)
        } else if (activePromises.length > 0) {
          // If we have some active but not at max, wait a bit
          await Promise.race([...activePromises, new Promise(resolve => setTimeout(resolve, 100))])
        } else {
          // No active promises, wait a bit before checking queue again
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      // Wait for all remaining promises to complete
      await Promise.all(activePromises)
    }

    // Run parallel scanning
    await runParallelScan()

    // Close Puppeteer browser if it was opened
    if (browser) {
      try {
        await browser.close()
        log('info', 'Closed Puppeteer browser', '', '')
      } catch (error) {
        log('warning', 'Error closing browser', error instanceof Error ? error.message : 'Unknown error', '')
      }
    }

    // Clean up old logs and results after configured retention time
    setTimeout(() => {
      scanLogsStore.delete(scanId)
      scanResultsStore.delete(scanId)
      cleanupScanControl(scanId)
    }, config.logging.logRetentionMinutes * 60 * 1000)
    
    // Log final summary
    const totalElapsedTime = Date.now() - scanStartTime
    const control = getScanControl(scanId)
    const finalMessage = control.isStopped 
      ? 'Scan stopped by user' 
      : 'Scan completed'
    
    log('info', finalMessage, 
      `Total URLs: ${results.length}, Links: ${totalLinksFound}, Errors: ${totalErrors}, Time: ${formatElapsedTime(totalElapsedTime)}`, 
      '', 
      totalElapsedTime
    )
    
    // Final update of results store
    updateResultsStore()
    
    return {
      results,
      logs,
      scanId,
    }
  })

