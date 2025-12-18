import { Lock, Pause, Play, Settings, Square } from 'lucide-react'
import { useId } from 'react'

interface ScannerFormProps {
  url: string
  loginUrl: string
  username: string
  password: string
  usernameField: string
  passwordField: string
  timeout: number
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
  const loginUrlId = useId()
  const usernameId = useId()
  const passwordId = useId()
  const usernameFieldId = useId()
  const passwordFieldId = useId()
  
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main URL */}
        <div className="lg:col-span-2">
          <label htmlFor={urlId} className="block text-white mb-2 font-medium text-sm">
            URL Website <span className="text-red-400">*</span>
          </label>
          <input
            id={urlId}
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            disabled={isScanning}
          />
        </div>

        {/* Timeout */}
        <div>
          <label htmlFor={timeoutId} className="block text-white mb-2 font-medium text-sm">
            Timeout (ms)
          </label>
          <input
            id={timeoutId}
            type="number"
            value={timeout}
            onChange={(e) => onTimeoutChange(Number.parseInt(e.target.value, 10) || 30000)}
            min="5000"
            max="120000"
            step="1000"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            disabled={isScanning}
          />
        </div>
      </div>

      {/* Login section - collapsible */}
      <div className="mt-4">
        <button
          type="button"
          onClick={onToggleLogin}
          className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors bg-slate-700/30 rounded-lg"
        >
          <Lock className="w-4 h-4" />
          {showLogin ? 'Hide' : 'Show'} login information
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
              <div className="mt-3 pt-3 border-t border-slate-600 grid grid-cols-1 md:grid-cols-2 gap-3">
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
            )}
          </div>
        )}
      </div>

            {/* Scan control buttons */}
            <div className="mt-4 flex gap-2">
              {!isScanning ? (
                <button
                  type="button"
                  onClick={onScan}
                  disabled={!url.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-cyan-500/50 disabled:to-blue-500/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-lg shadow-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/60 transform hover:scale-[1.02] disabled:transform-none"
                >
                  <span>🔍</span>
                  <span>Start Scan</span>
                </button>
              ) : (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      onClick={onResume}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all"
                    >
                      <Play className="w-5 h-5" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onPause}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-all"
                    >
                      <Pause className="w-5 h-5" />
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onStop}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
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
