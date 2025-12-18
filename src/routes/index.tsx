import { createFileRoute } from '@tanstack/react-router'
import { Github, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ScannerForm } from '@/components/scanner/ScannerForm'
import { ScannerLogs } from '@/components/scanner/ScannerLogs'
import { ScannerProgress } from '@/components/scanner/ScannerProgress'
import { ScannerResults } from '@/components/scanner/ScannerResults'
import { ToastContainer, type ToastType } from '@/components/scanner/Toast'
import type { ScanLog, ScanResult } from '@/components/scanner/types'
import { 
  getScanLogs, 
  getScanResults, 
  scanWebsite, 
  pauseScan, 
  resumeScan, 
  stopScan 
} from '@/lib/scanner-server'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
}

export const Route = createFileRoute('/')({
  component: ScannerPage,
})

function ScannerPage() {
  const [url, setUrl] = useState('https://he.edudigital.com.vn')
  const [loginUrl, setLoginUrl] = useState('https://he.edudigital.com.vn/dang-nhap')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('12345678')
  const [usernameField, setUsernameField] = useState('user_name')
  const [passwordField, setPasswordField] = useState('')
  const [timeoutValue, setTimeoutValue] = useState(30000)
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(5)
  const [customHeaders, setCustomHeaders] = useState('')
  const [pathRegexFilter, setPathRegexFilter] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [results, setResults] = useState<ScanResult[]>([])
  const [logs, setLogs] = useState<ScanLog[]>([])
  const [currentScanId, setCurrentScanId] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [scanProgress, setScanProgress] = useState<{
    current: number
    total: number
    currentUrl: string
    status: string
  } | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // Helper function to show toast
  const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(7)}`
    setToasts((prev) => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  // Poll for new logs and results when scanning or when scanId exists
  useEffect(() => {
    if (!currentScanId) return
    
    const pollInterval = setInterval(async () => {
      try {
        const [newLogs, newResults] = await Promise.all([
          getScanLogs({ data: { scanId: currentScanId } }),
          getScanResults({ data: { scanId: currentScanId } })
        ])
        
        // Always update logs if there are any (even if same length, content might have changed)
        if (newLogs.length > 0) {
          setLogs([...newLogs])
        }
        
        // Always update results - compare by URL to detect new results
        if (newResults.length > 0) {
          setResults((prevResults) => {
            // Create a map of existing URLs for quick lookup
            const existingUrls = new Set(prevResults.map(r => r.url))
            const newUrls = new Set(newResults.map(r => r.url))
            
            // Check if there are any new URLs
            const hasNewResults = Array.from(newUrls).some(url => !existingUrls.has(url))
            
            // If there are new results or results changed, update
            if (hasNewResults || newResults.length !== prevResults.length) {
              return [...newResults]
            }
            
            // Otherwise, check if any existing result was updated (by timestamp or status)
            const resultsChanged = newResults.some(newResult => {
              const oldResult = prevResults.find(r => r.url === newResult.url)
              if (!oldResult) return true
              return (
                oldResult.status !== newResult.status ||
                oldResult.statusCode !== newResult.statusCode ||
                oldResult.links?.length !== newResult.links?.length ||
                oldResult.timestamp !== newResult.timestamp
              )
            })
            
            return resultsChanged ? [...newResults] : prevResults
          })
        }
      } catch (error) {
        console.error('Error fetching logs/results:', error)
      }
    }, 500) // Poll every 500ms for real-time updates (configurable in scanner-config.ts)
    
    // Also fetch immediately
    const fetchData = async () => {
      try {
        const [newLogs, newResults] = await Promise.all([
          getScanLogs({ data: { scanId: currentScanId } }),
          getScanResults({ data: { scanId: currentScanId } })
        ])
        
        if (newLogs.length > 0) {
          setLogs([...newLogs])
        }
        if (newResults.length > 0) {
          setResults([...newResults])
        }
      } catch (error) {
        console.error('Error fetching logs/results:', error)
      }
    }
    fetchData()
    
    return () => clearInterval(pollInterval)
  }, [currentScanId])

  const handleScan = async () => {
    if (!url.trim()) {
      showToast('Please enter a URL', 'warning', 3000)
      return
    }

    setIsScanning(true)
    setResults([])
    setLogs([])
    
    // Generate scanId on client side for immediate polling
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substring(7)}`
    setCurrentScanId(scanId)

    try {
      setScanProgress({ current: 0, total: 0, currentUrl: url.trim(), status: 'Starting...' })
      
      // Parse custom headers if provided
      let parsedHeaders: Record<string, string> | undefined
      if (customHeaders.trim()) {
        try {
          parsedHeaders = JSON.parse(customHeaders) as Record<string, string>
        } catch (error) {
          showToast('Invalid JSON format in custom headers', 'error', 3000)
          return
        }
      }
      
      const response = await scanWebsite({
        data: {
          url: url.trim(),
          loginUrl: loginUrl.trim() || undefined,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
          usernameField: usernameField.trim() || undefined,
          passwordField: passwordField.trim() || undefined,
          maxDepth: 999999,
          maxPages: 999999,
          timeout: timeoutValue,
          maxConcurrentRequests,
          customHeaders: parsedHeaders,
          pathRegexFilter: pathRegexFilter.trim() || undefined,
          scanId, // Pass scanId to server for streaming
        },
      })
      
      setScanProgress(null)

      setResults(response.results || [])
      setLogs(response.logs || [])
      
      // Set scanId for polling (though scan is done, this ensures we get all logs)
      if (response.scanId) {
        setCurrentScanId(response.scanId)
      }
    } catch (error) {
      console.error('Scan error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Show user-friendly error message
      let friendlyMessage = 'Failed to scan website'
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('fetch')) {
        friendlyMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.'
      } else if (errorMessage.includes('timeout')) {
        friendlyMessage = 'Request timeout: The server took too long to respond. Please try again or increase the timeout value.'
      } else if (errorMessage.includes('CORS')) {
        friendlyMessage = 'CORS error: The website blocked the request. This may be a security restriction.'
      } else {
        friendlyMessage = `Error: ${errorMessage}`
      }
      showToast(friendlyMessage, 'error', 8000)
    } finally {
      setIsScanning(false)
      // Keep polling for a bit after scan completes to get final logs
      setTimeout(async () => {
        // Fetch final logs before clearing scanId
        if (currentScanId) {
          try {
            const finalLogs = await getScanLogs({ data: { scanId: currentScanId } })
            if (finalLogs.length > 0) {
              setLogs([...finalLogs])
            }
          } catch (error) {
            console.error('Error fetching final logs:', error)
          }
        }
        // Don't clear scanId immediately, keep logs visible
        // setCurrentScanId(null)
      }, 2000)
    }
  }

  const handlePause = async () => {
    if (!currentScanId) return
    try {
      await pauseScan({ data: { scanId: currentScanId } })
      setIsPaused(true)
      showToast('Scan paused', 'info', 2000)
    } catch (error) {
      console.error('Error pausing scan:', error)
      showToast('Failed to pause scan', 'error', 3000)
    }
  }

  const handleResume = async () => {
    if (!currentScanId) return
    try {
      await resumeScan({ data: { scanId: currentScanId } })
      setIsPaused(false)
      showToast('Scan resumed', 'success', 2000)
    } catch (error) {
      console.error('Error resuming scan:', error)
      showToast('Failed to resume scan', 'error', 3000)
    }
  }

  const handleStop = async () => {
    if (!currentScanId) return
    try {
      await stopScan({ data: { scanId: currentScanId } })
      setIsScanning(false)
      setIsPaused(false)
      showToast('Scan stopped', 'warning', 2000)
    } catch (error) {
      console.error('Error stopping scan:', error)
      showToast('Failed to stop scan', 'error', 3000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Globe className="w-10 h-10 text-cyan-400" />
            Web URL Scanner
          </h1>
          <p className="text-gray-400">
            Scan and find all URLs in a website
          </p>
        </div>

        <ScannerForm
          url={url}
          loginUrl={loginUrl}
          username={username}
          password={password}
          usernameField={usernameField}
          passwordField={passwordField}
          timeout={timeoutValue}
          maxConcurrentRequests={maxConcurrentRequests}
          customHeaders={customHeaders}
          pathRegexFilter={pathRegexFilter}
          showLogin={showLogin}
          showAdvanced={showAdvanced}
          isScanning={isScanning}
          isPaused={isPaused}
          onUrlChange={setUrl}
          onLoginUrlChange={setLoginUrl}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onUsernameFieldChange={setUsernameField}
          onPasswordFieldChange={setPasswordField}
          onTimeoutChange={setTimeoutValue}
          onMaxConcurrentChange={setMaxConcurrentRequests}
          onCustomHeadersChange={setCustomHeaders}
          onPathRegexFilterChange={setPathRegexFilter}
          onToggleLogin={() => setShowLogin(!showLogin)}
          onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
          onScan={handleScan}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
        />
        
        {scanProgress && (
          <ScannerProgress
            status={scanProgress.status}
            currentUrl={scanProgress.currentUrl}
            current={scanProgress.current}
            total={scanProgress.total}
          />
        )}
        
        {/* Always show logs section if there are logs or scanning */}
        {(logs.length > 0 || isScanning) && (
          <ScannerLogs logs={logs} />
        )}

        <ScannerResults results={results} baseUrl={url} showToast={showToast} />

        {/* Toast notifications */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
      
      {/* Footer */}
      <footer className="mt-12 py-6 border-t border-slate-700/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <span>Created by</span>
            <a
              href="https://github.com/stop1love1/web-scanner"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
            >
              <Github className="w-4 h-4" />
              <span>stop1love1</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
