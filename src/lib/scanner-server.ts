import { createServerFn } from '@tanstack/react-start'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'
import type { ScanConfig, ScanLog, ScanResult } from '@/components/scanner/types'
import { getConfig } from './scanner-config'
import { 
  cleanupScanControl, 
  getScanControl, 
  initializeScanControl, 
  setScanPaused, 
  setScanStopped 
} from './scanner-control'
import { 
  calculateProgress,
  extractLinksFromHtml,
  extractLinksFromPage,
  formatElapsedTime,
  generateScanId,
  isSameDomain,
  normalizeUrl 
} from './scanner-utils'
import { isStaticFile, shouldIncludeUrl } from './url-analyzer'

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
      customHeaders: customHeadersConfig,
      pathRegexFilter: pathRegexFilterConfig,
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
    
    // Parse custom headers
    const customHeaders: Record<string, string> = customHeadersConfig || {}
    
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
    scanResultsStore.set(scanId, [])
    initializeScanControl(scanId)
    
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
          
          const loginPageHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...customHeaders,
          }
          const loginPageResponse = await fetchWithTimeout(loginUrl, {
            method: 'GET',
            headers: loginPageHeaders,
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
            ...customHeaders,
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
              
              const retryLoginHeaders: Record<string, string> = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': loginUrl,
                'Origin': new URL(loginUrl).origin,
                'Cookie': retryCookies,
                'X-XSRF-TOKEN': freshCsrfToken,
                'X-CSRF-TOKEN': freshCsrfToken,
                ...customHeaders,
              }
              const retryLoginResponse = await fetchWithTimeout(formAction, {
                method: formMethod,
                headers: retryLoginHeaders,
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
        const verifyHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': sessionCookies,
          ...customHeaders,
        }
        const verifyResponse = await fetchWithTimeout(startUrl, {
          method: 'GET',
          headers: verifyHeaders,
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

    // Add starting URL to queue (don't mark as visited yet - will be marked when scanning starts)
    queue.push({ url: startUrl, depth: 0 })

    // Helper function to scan a single URL
    const scanSingleUrl = async (currentUrl: string, depth: number): Promise<void> => {
      log('info', `scanSingleUrl called`, `URL: ${currentUrl}, Depth: ${depth}`, '')
      
      if (depth > MAX_DEPTH) {
        log('info', `Skipping URL (max depth reached)`, `Depth: ${depth}, Max: ${MAX_DEPTH}`, currentUrl)
        return
      }
      
      // Mark as visited BEFORE scanning to prevent duplicate scans
      if (visited.has(currentUrl)) {
        // Already being scanned or scanned, skip
        log('info', `Skipping already visited URL`, `Visited: ${visited.size}`, currentUrl)
        return
      }
      
      // Check if URL is a static file before scanning
      if (isStaticFile(currentUrl)) {
        log('warning', `Skipping static file URL (should have been filtered earlier)`, currentUrl, '')
        // Mark as visited to prevent retry
        visited.add(currentUrl)
        return
      }
      
      visited.add(currentUrl)
      
      log('info', `Scanning URL (Depth: ${depth})`, `Queue: ${queue.length}, Visited: ${visited.size}, Total Results: ${results.length}`, currentUrl)
      
      let statusCode = 0
      let html = ''
      const startTime = Date.now()
      
      try {
        if (usePuppeteer && browser) {
          // Create a new page for parallel scanning
          const scanPage = await browser.newPage()
          try {
            // Set custom headers if provided
            if (Object.keys(customHeaders).length > 0) {
              await scanPage.setExtraHTTPHeaders(customHeaders)
            }
            
            log('info', 'Using Puppeteer to scan page', '', currentUrl)
            
            // Set up response listener to capture the final status code
            let finalStatusCode = 0
            const responseHandler = (response: Parameters<Parameters<typeof scanPage.on<'response'>>[1]>[0]) => {
              try {
                const status = response.status()
                const responseUrl = response.url()
                // Only update if this is the main document response (not sub-resources)
                if (responseUrl === currentUrl || response.request().isNavigationRequest()) {
                  finalStatusCode = status
                  log('info', `Response received`, `Status: ${status}, URL: ${responseUrl}`, currentUrl)
                }
              } catch {
                // Ignore errors in response handler
              }
            }
            scanPage.on('response', responseHandler)
            
            const response = await scanPage.goto(currentUrl, { 
              waitUntil: config.puppeteer.waitForNavigation.waitUntil, 
              timeout: REQUEST_TIMEOUT 
            })
            
            // Get status code from response
            if (response) {
              statusCode = response.status()
              log('info', `Puppeteer response status`, `Status: ${statusCode}`, currentUrl)
              
              // Use the final status code from response handler if it's different
              // This handles cases where redirects change the status
              if (finalStatusCode > 0 && finalStatusCode !== statusCode) {
                log('info', `Status code changed after redirect`, `${statusCode} -> ${finalStatusCode}`, currentUrl)
                statusCode = finalStatusCode
              }
            } else if (finalStatusCode > 0) {
              statusCode = finalStatusCode
              log('info', `Using status code from response handler`, `Status: ${statusCode}`, currentUrl)
            } else {
              // If no response, try to get from page
              statusCode = 200 // Default, will be checked later
              log('warning', `No response object, using default status 200`, '', currentUrl)
            }
            
            // Remove response handler
            scanPage.off('response', responseHandler)
            // Wait for dynamic content to load
            await new Promise(resolve => setTimeout(resolve, config.puppeteer.dynamicContentWait))
            html = await scanPage.content()
            
            // Additional check: if status is 200 but content suggests error (404, 500, etc.)
            // Some servers return 200 with error page content (custom error pages)
            if (statusCode === 200) {
              const lowerHtml = html.toLowerCase()
              
              // Detect 404 - Not Found
              const notFoundPatterns = [
                /404/i,
                /not found/i,
                /page not found/i,
                /không tìm thấy/i, // Vietnamese
                /trang không tồn tại/i, // Vietnamese
                /file not found/i,
                /document not found/i,
                /resource not found/i,
                /url not found/i,
              ]
              const is404 = notFoundPatterns.some(pattern => pattern.test(lowerHtml)) && 
                           (lowerHtml.includes('404') || lowerHtml.includes('not found') || lowerHtml.includes('không tìm thấy'))
              
              // Detect 403 - Forbidden
              const forbiddenPatterns = [
                /403/i,
                /forbidden/i,
                /access denied/i,
                /permission denied/i,
                /không có quyền/i, // Vietnamese
                /bị cấm/i, // Vietnamese
              ]
              const is403 = forbiddenPatterns.some(pattern => pattern.test(lowerHtml))
              
              // Detect 500 - Internal Server Error
              const serverErrorPatterns = [
                /500/i,
                /internal server error/i,
                /server error/i,
                /lỗi máy chủ/i, // Vietnamese
              ]
              const is500 = serverErrorPatterns.some(pattern => pattern.test(lowerHtml))
              
              // Detect 401 - Unauthorized
              const unauthorizedPatterns = [
                /401/i,
                /unauthorized/i,
                /authentication required/i,
                /chưa đăng nhập/i, // Vietnamese
              ]
              const is401 = unauthorizedPatterns.some(pattern => pattern.test(lowerHtml))
              
              // Update status code based on content detection
              if (is404) {
                statusCode = 404
                log('warning', `Detected 404 from content (status was 200)`, `Corrected to 404`, currentUrl)
              } else if (is403) {
                statusCode = 403
                log('warning', `Detected 403 from content (status was 200)`, `Corrected to 403`, currentUrl)
              } else if (is500) {
                statusCode = 500
                log('warning', `Detected 500 from content (status was 200)`, `Corrected to 500`, currentUrl)
              } else if (is401) {
                statusCode = 401
                log('warning', `Detected 401 from content (status was 200)`, `Corrected to 401`, currentUrl)
              }
            }
            
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
            let filteredCount = 0
            const newUrlsToScan: string[] = []
            for (const href of pageLinks) {
              const normalizedUrl = normalizeUrl(href, currentUrl)
              if (normalizedUrl && isSameDomain(normalizedUrl, url) && !visited.has(normalizedUrl)) {
                // Skip static files (JS, CSS, images, etc.)
                if (isStaticFile(normalizedUrl)) {
                  filteredCount++
                  continue
                }
                // Apply path regex filter if configured
                if (pathRegexFilterConfig && !shouldIncludeUrl(normalizedUrl, pathRegexFilterConfig)) {
                  filteredCount++
                  continue // Skip URLs that don't match the path regex
                }
                linkCount++
                if (depth < MAX_DEPTH) {
                  // Don't mark as visited yet - will be marked when scanning starts
                  // This prevents URLs from being skipped before they're actually scanned
                  queue.push({ url: normalizedUrl, depth: depth + 1 })
                  newUrlsToScan.push(normalizedUrl)
                }
              }
            }
            if (filteredCount > 0) {
              log('info', `Filtered ${filteredCount} URLs (static files + path regex)`, `Added: ${linkCount}`, currentUrl)
            }
            totalLinksFound += linkCount
            if (newUrlsToScan.length > 0) {
              log('info', `Found ${linkCount} new links with Puppeteer (${newUrlsToScan.length} will be scanned)`, `Total: ${totalLinksFound}, Queue: ${queue.length}`, currentUrl, responseTime)
            } else {
              log('info', `Found ${linkCount} new links with Puppeteer`, `Total: ${totalLinksFound}`, currentUrl, responseTime)
            }
            
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
          const defaultHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': sessionCookies,
          }
          // Merge custom headers (custom headers override defaults)
          const mergedHeaders = { ...defaultHeaders, ...customHeaders }
          
          const response = await fetchWithTimeout(currentUrl, {
            method: 'GET',
            headers: mergedHeaders,
            redirect: 'follow', // Follow redirects to get final status code
          }, REQUEST_TIMEOUT)
          
          // Get the final status code after redirects
          statusCode = response.status
          
          // Log status code for debugging
          log('info', `Fetch response received`, `Status: ${statusCode}, URL: ${response.url}`, currentUrl)
          
          // Verify status code is captured correctly
          if (!statusCode || statusCode === 0) {
            // Fallback: try to detect from response
            statusCode = response.status || 200
            log('warning', `Status code was 0, using fallback`, `Status: ${statusCode}`, currentUrl)
          }
          html = await response.text()
          
          // Additional check: if status is 200 but content suggests error (404, 500, etc.)
          // Some servers return 200 with error page content (custom error pages)
          if (statusCode === 200) {
            const lowerHtml = html.toLowerCase()
            
            // Detect 404 - Not Found
            const notFoundPatterns = [
              /404/i,
              /not found/i,
              /page not found/i,
              /không tìm thấy/i, // Vietnamese
              /trang không tồn tại/i, // Vietnamese
              /file not found/i,
              /document not found/i,
              /resource not found/i,
              /url not found/i,
            ]
            const is404 = notFoundPatterns.some(pattern => pattern.test(lowerHtml)) && 
                         (lowerHtml.includes('404') || lowerHtml.includes('not found') || lowerHtml.includes('không tìm thấy'))
            
            // Detect 403 - Forbidden
            const forbiddenPatterns = [
              /403/i,
              /forbidden/i,
              /access denied/i,
              /permission denied/i,
              /không có quyền/i, // Vietnamese
              /bị cấm/i, // Vietnamese
            ]
            const is403 = forbiddenPatterns.some(pattern => pattern.test(lowerHtml))
            
            // Detect 500 - Internal Server Error
            const serverErrorPatterns = [
              /500/i,
              /internal server error/i,
              /server error/i,
              /lỗi máy chủ/i, // Vietnamese
            ]
            const is500 = serverErrorPatterns.some(pattern => pattern.test(lowerHtml))
            
            // Detect 401 - Unauthorized
            const unauthorizedPatterns = [
              /401/i,
              /unauthorized/i,
              /authentication required/i,
              /chưa đăng nhập/i, // Vietnamese
            ]
            const is401 = unauthorizedPatterns.some(pattern => pattern.test(lowerHtml))
            
            // Update status code based on content detection
            if (is404) {
              statusCode = 404
              log('warning', `Detected 404 from content (status was 200)`, `Corrected to 404`, currentUrl)
            } else if (is403) {
              statusCode = 403
              log('warning', `Detected 403 from content (status was 200)`, `Corrected to 403`, currentUrl)
            } else if (is500) {
              statusCode = 500
              log('warning', `Detected 500 from content (status was 200)`, `Corrected to 500`, currentUrl)
            } else if (is401) {
              statusCode = 401
              log('warning', `Detected 401 from content (status was 200)`, `Corrected to 401`, currentUrl)
            }
          }
          
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
          let filteredCount = 0
          const normalizedLinks: string[] = []
          const newUrlsToScan: string[] = []
          
          for (const href of links) {
            const normalizedUrl = normalizeUrl(href, currentUrl)
            if (normalizedUrl && isSameDomain(normalizedUrl, url) && !visited.has(normalizedUrl)) {
              // Skip static files (JS, CSS, images, etc.)
              if (isStaticFile(normalizedUrl)) {
                filteredCount++
                continue
              }
              // Apply path regex filter if configured
              if (pathRegexFilterConfig && !shouldIncludeUrl(normalizedUrl, pathRegexFilterConfig)) {
                filteredCount++
                continue // Skip URLs that don't match the path regex
              }
              normalizedLinks.push(normalizedUrl)
              linkCount++
              if (depth < MAX_DEPTH) {
                // Don't mark as visited yet - will be marked when scanning starts
                // This prevents URLs from being skipped before they're actually scanned
                queue.push({ url: normalizedUrl, depth: depth + 1 })
                newUrlsToScan.push(normalizedUrl)
              }
            }
          }
          if (filteredCount > 0) {
            log('info', `Filtered ${filteredCount} static files/path regex`, `Added: ${linkCount} URLs to queue`, currentUrl)
          }
          
          totalLinksFound += linkCount
          if (newUrlsToScan.length > 0) {
            log('info', `Found ${linkCount} new links (${newUrlsToScan.length} will be scanned)`, `Total: ${totalLinksFound}, Queue: ${queue.length}`, currentUrl, responseTime)
          } else {
            log('info', `Found ${linkCount} new links`, `Total: ${totalLinksFound}`, currentUrl, responseTime)
          }
          
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
      let lastQueueSize = queue.length
      let noProgressCount = 0
      
      log('info', `Starting parallel scan`, `Queue: ${queue.length}, Max Concurrent: ${maxConcurrent}`, '')
      
      // Continue scanning until queue is empty AND all active promises are done
      while ((queue.length > 0 || activePromises.length > 0) && results.length < MAX_PAGES) {
        // Check if paused or stopped
        await waitIfPaused()
        
        // Check if queue is stuck (not making progress)
        if (queue.length === lastQueueSize && activePromises.length === 0) {
          noProgressCount++
          if (noProgressCount > 10) {
            log('warning', 'Queue appears stuck, forcing continuation', `Queue: ${queue.length}`, '')
            noProgressCount = 0
          }
        } else {
          noProgressCount = 0
        }
        lastQueueSize = queue.length
        
        // Start new scans up to concurrency limit
        while (activePromises.length < maxConcurrent && queue.length > 0 && results.length < MAX_PAGES) {
          const queueItem = queue.shift()
          if (!queueItem) break
          
          const { url: currentUrl, depth } = queueItem
          
          // Log when starting to scan from queue
          log('info', `Processing queue item`, `Queue: ${queue.length}, Active: ${activePromises.length}, Scanned: ${results.length}`, currentUrl)
          
          // Create promise and add to active promises immediately
          const promise = (async () => {
            try {
              await scanSingleUrl(currentUrl, depth)
            } catch (error) {
              // Error already handled in scanSingleUrl, but log here too
              console.error('Scan error in parallel:', error)
              log('error', `Error in parallel scan`, error instanceof Error ? error.message : 'Unknown error', currentUrl)
              throw error // Re-throw to ensure promise is rejected
            }
          })()
          
          promise.finally(() => {
            // Remove from active promises when done
            const index = activePromises.indexOf(promise)
            if (index > -1) {
              activePromises.splice(index, 1)
            }
          }).catch(() => {
            // Ignore errors in finally
          })
          
          activePromises.push(promise)
        }
        
        // Wait for at least one promise to complete before starting more
        if (activePromises.length >= maxConcurrent) {
          // Wait for at least one to complete
          await Promise.race(activePromises)
        } else if (activePromises.length > 0) {
          // If we have some active but not at max, wait for one to complete or timeout
          await Promise.race([
            ...activePromises, 
            new Promise(resolve => setTimeout(resolve, 2000))
          ])
        } else {
          // No active promises - check if queue is empty or if we should continue
          if (queue.length > 0) {
            log('warning', 'No active promises but queue not empty - retrying', `Queue: ${queue.length}, Visited: ${visited.size}, Results: ${results.length}`, '')
            // Continue to next iteration to start new scans
            continue
          } else {
            // Queue is empty and no active promises - we're done
            break
          }
        }
      }
      
      // Wait for all remaining promises to complete
      if (activePromises.length > 0) {
        log('info', `Waiting for ${activePromises.length} remaining scans to complete`, '', '')
        await Promise.all(activePromises)
      }
      
      log('info', `Parallel scan completed`, `Queue: ${queue.length}, Results: ${results.length}`, '')
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

