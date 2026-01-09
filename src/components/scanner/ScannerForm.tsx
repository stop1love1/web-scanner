import { HelpCircle, Lock, Pause, Play, Settings, Square, Zap } from 'lucide-react'
import { useId, useState } from 'react'

interface ScannerFormProps {
  url: string
  loginUrl: string
  username: string
  password: string
  usernameField: string
  passwordField: string
  timeout: number
  maxConcurrentRequests: number
  customHeaders: string
  pathRegexFilter: string
  showLogin: boolean
  showAdvanced: boolean
  isScanning: boolean
  isPaused?: boolean
  onUrlChange: (value: string) => void
  onLoginUrlChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onUsernameFieldChange: (value: string) => void
  onPasswordFieldChange: (value: string) => void
  onTimeoutChange: (value: number) => void
  onMaxConcurrentChange: (value: number) => void
  onCustomHeadersChange: (value: string) => void
  onPathRegexFilterChange: (value: string) => void
  onToggleLogin: () => void
  onToggleAdvanced: () => void
  onScan: () => void
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
}

export function ScannerForm({
  url,
  loginUrl,
  username,
  password,
  usernameField,
  passwordField,
  timeout,
  maxConcurrentRequests,
  customHeaders,
  pathRegexFilter,
  showLogin,
  showAdvanced,
  isScanning,
  onUrlChange,
  onLoginUrlChange,
  onUsernameChange,
  onPasswordChange,
  onUsernameFieldChange,
  onPasswordFieldChange,
  onTimeoutChange,
  onMaxConcurrentChange,
  onCustomHeadersChange,
  onPathRegexFilterChange,
  onToggleLogin,
  onToggleAdvanced,
  onScan,
  isPaused,
  onPause,
  onResume,
  onStop,
}: ScannerFormProps) {
  const urlId = useId()
  const timeoutId = useId()
  const maxConcurrentId = useId()
  const loginUrlId = useId()
  const usernameId = useId()
  const passwordId = useId()
  const usernameFieldId = useId()
  const passwordFieldId = useId()
  const customHeadersId = useId()
  const pathRegexFilterId = useId()
  const [headersError, setHeadersError] = useState<string | null>(null)
  const [pathRegexError, setPathRegexError] = useState<string | null>(null)
  
  const defaultHeadersExample = `{
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
}`
  
  const handleHeadersChange = (value: string) => {
    onCustomHeadersChange(value)
    if (!value.trim()) {
      setHeadersError(null)
      return
    }
    try {
      JSON.parse(value)
      setHeadersError(null)
    } catch {
      setHeadersError('Invalid JSON format')
    }
  }
  
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main URL */}
        <div className="lg:col-span-2">
          <label htmlFor={urlId} className="flex items-center gap-2 text-white mb-2 font-medium text-sm">
            <span>🌐</span>
            <span>Website URL</span>
            <span className="text-red-400">*</span>
          </label>
          <input
            id={urlId}
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm transition-all"
            disabled={isScanning}
          />
        </div>

        {/* Timeout */}
        <div>
          <label htmlFor={timeoutId} className="flex items-center gap-2 text-white mb-2 font-medium text-sm">
            <span>⏱️</span>
            <span>Timeout (ms)</span>
          </label>
          <input
            id={timeoutId}
            type="number"
            value={timeout}
            onChange={(e) => onTimeoutChange(Number.parseInt(e.target.value, 10) || 30000)}
            min="5000"
            max="120000"
            step="1000"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm transition-all"
            disabled={isScanning}
          />
        </div>

        {/* Max Concurrent Requests */}
        <div>
          <label htmlFor={maxConcurrentId} className="flex items-center gap-2 text-white mb-2 font-medium text-sm">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span>Parallel</span>
            <div className="group relative">
              <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-300 cursor-help" />
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl border border-slate-600 whitespace-nowrap">
                  Number of URLs to scan simultaneously
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                    <div className="border-4 border-transparent border-t-slate-800"></div>
                  </div>
                </div>
              </div>
            </div>
          </label>
          <input
            id={maxConcurrentId}
            type="number"
            value={maxConcurrentRequests}
            onChange={(e) => onMaxConcurrentChange(Math.max(1, Math.min(20, Number.parseInt(e.target.value, 10) || 5)))}
            min="1"
            max="20"
            step="1"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm transition-all"
            disabled={isScanning}
          />
          <div className="text-xs text-gray-400 mt-1">
            Recommended: 3-10
          </div>
        </div>
      </div>

      {/* Login section - collapsible */}
      <div className="mt-4">
        <button
          type="button"
          onClick={onToggleLogin}
          className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-all bg-slate-700/30 hover:bg-slate-700/50 rounded-lg border border-slate-600/50 hover:border-slate-600"
        >
          <Lock className="w-4 h-4" />
          <span>{showLogin ? 'Hide' : 'Show'} login information</span>
          <span className="ml-auto text-xs text-gray-500">({showLogin ? 'Click to collapse' : 'Click to expand'})</span>
        </button>

        {showLogin && (
          <div className="mt-3 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor={loginUrlId} className="block text-white mb-1.5 font-medium text-sm">
                  Login URL
                </label>
                <input
                  id={loginUrlId}
                  type="url"
                  value={loginUrl}
                  onChange={(e) => onLoginUrlChange(e.target.value)}
                  placeholder="https://example.com/login"
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
                  disabled={isScanning}
                />
              </div>
              <div>
                <label htmlFor={usernameId} className="block text-white mb-1.5 font-medium text-sm">
                  Username
                </label>
                <input
                  id={usernameId}
                  type="text"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
                  disabled={isScanning}
                />
              </div>
              <div>
                <label htmlFor={passwordId} className="block text-white mb-1.5 font-medium text-sm">
                  Password
                </label>
                <input
                  id={passwordId}
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
                  disabled={isScanning}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={onToggleAdvanced}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  {showAdvanced ? 'Hide' : 'Show'} advanced
                </button>
              </div>
            </div>

            {showAdvanced && (
              <div className="mt-3 pt-3 border-t border-slate-600 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={usernameFieldId} className="block text-white mb-1.5 text-xs font-medium">
                      Username Field Name
                    </label>
                    <input
                      id={usernameFieldId}
                      type="text"
                      value={usernameField}
                      onChange={(e) => onUsernameFieldChange(e.target.value)}
                      placeholder="Auto-detect"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-xs"
                      disabled={isScanning}
                    />
                  </div>
                  <div>
                    <label htmlFor={passwordFieldId} className="block text-white mb-1.5 text-xs font-medium">
                      Password Field Name
                    </label>
                    <input
                      id={passwordFieldId}
                      type="text"
                      value={passwordField}
                      onChange={(e) => onPasswordFieldChange(e.target.value)}
                      placeholder="Auto-detect"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-xs"
                      disabled={isScanning}
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor={customHeadersId} className="flex items-center gap-2 text-white mb-1.5 text-xs font-medium">
                    <span>📋</span>
                    <span>Custom Headers (JSON)</span>
                    <div className="group relative ml-auto">
                      <HelpCircle className="w-3 h-3 text-gray-400 hover:text-gray-300 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10">
                        <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl border border-slate-600 max-w-xs">
                          Enter custom HTTP headers as JSON object. Example: {"{"}"User-Agent": "..."{"}"}
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                  <textarea
                    id={customHeadersId}
                    value={customHeaders}
                    onChange={(e) => handleHeadersChange(e.target.value)}
                    placeholder={defaultHeadersExample}
                    rows={4}
                    className={`w-full px-3 py-2 rounded-lg border bg-slate-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent text-xs font-mono ${
                      headersError 
                        ? 'border-red-500 focus:ring-red-500' 
                        : 'border-slate-600 focus:ring-cyan-500'
                    }`}
                    disabled={isScanning}
                  />
                  {headersError && (
                    <div className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>{headersError}</span>
                    </div>
                  )}
                  {!headersError && customHeaders.trim() && (
                    <div className="mt-1 text-xs text-green-400 flex items-center gap-1">
                      <span>✓</span>
                      <span>Valid JSON</span>
                    </div>
                  )}
                </div>
                
                {/* Path Regex Filter */}
                <div>
                  <label htmlFor={pathRegexFilterId} className="flex items-center gap-2 text-white mb-1.5 text-xs font-medium">
                    <span>🔍</span>
                    <span>Path Regex Filter</span>
                    <div className="group relative ml-auto">
                      <HelpCircle className="w-3 h-3 text-gray-400 hover:text-gray-300 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10">
                        <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl border border-slate-600 max-w-xs">
                          Filter URLs by path using regex. Only URLs matching the pattern will be scanned.
                          <br />
                          Example: <code className="text-cyan-400">/admin|/api</code> to scan only admin or API paths
                          <div className="absolute top-full right-4 -mt-1">
                            <div className="border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                  <input
                    id={pathRegexFilterId}
                    type="text"
                    value={pathRegexFilter}
                    onChange={(e) => {
                      const value = e.target.value
                      onPathRegexFilterChange(value)
                      if (value.trim()) {
                        try {
                          new RegExp(value, 'i')
                          setPathRegexError(null)
                        } catch (error) {
                          setPathRegexError(error instanceof Error ? error.message : 'Invalid regex pattern')
                        }
                      } else {
                        setPathRegexError(null)
                      }
                    }}
                    placeholder="/admin|/api|/user"
                    className={`w-full px-3 py-2 rounded-lg border bg-slate-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent text-xs font-mono ${
                      pathRegexError 
                        ? 'border-red-500 focus:ring-red-500' 
                        : 'border-slate-600 focus:ring-cyan-500'
                    }`}
                    disabled={isScanning}
                  />
                  {pathRegexError && (
                    <div className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>{pathRegexError}</span>
                    </div>
                  )}
                  {!pathRegexError && pathRegexFilter.trim() && (
                    <div className="mt-1 text-xs text-green-400 flex items-center gap-1">
                      <span>✓</span>
                      <span>Valid regex - Only URLs matching this path pattern will be scanned</span>
                    </div>
                  )}
                  {!pathRegexFilter.trim() && (
                    <div className="mt-1 text-xs text-gray-500">
                      Leave empty to scan all URLs
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

            {/* Scan control buttons */}
            <div className="mt-6 flex gap-3">
              {!isScanning ? (
                <button
                  type="button"
                  onClick={onScan}
                  disabled={!url.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-linear-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-cyan-500/50 disabled:to-blue-500/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-lg shadow-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/60 transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none disabled:shadow-none"
                >
                  <span className="text-lg">🔍</span>
                  <span>Start Scan</span>
                </button>
              ) : (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      onClick={onResume}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-lg transition-all shadow-md shadow-green-600/30 hover:shadow-lg hover:shadow-green-600/40 transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Play className="w-5 h-5" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onPause}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white font-semibold rounded-lg transition-all shadow-md shadow-yellow-600/30 hover:shadow-lg hover:shadow-yellow-600/40 transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Pause className="w-5 h-5" />
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onStop}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold rounded-lg transition-all shadow-md shadow-red-600/30 hover:shadow-lg hover:shadow-red-600/40 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Square className="w-5 h-5" />
                    <span>Stop</span>
                  </button>
                </>
              )}
            </div>
    </div>
  )
}
