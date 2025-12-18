import { ChevronDown, ChevronUp, Filter } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ScanLog } from './types'

interface ScannerLogsProps {
  logs: ScanLog[]
}

export function ScannerLogs({ logs }: ScannerLogsProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'success' | 'error' | 'warning'>('all')
  
  const filteredLogs = logs.filter(log => logFilter === 'all' || log.type === logFilter)
  
  // Auto-scroll disabled per user request
  // useEffect(() => {
  //   // Auto-scroll to bottom when new logs arrive
  //   if (!isMinimized && filteredLogs.length > 0) {
  //     logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  //   }
  // }, [filteredLogs.length, isMinimized])
  
  const errorCount = logs.filter(l => l.type === 'error').length
  const warningCount = logs.filter(l => l.type === 'warning').length
  const successCount = logs.filter(l => l.type === 'success').length
  const infoCount = logs.filter(l => l.type === 'info').length
  
  return (
    <div className="mb-6 bg-slate-900/50 rounded-lg border border-slate-600 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-3 flex-1">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="text-cyan-400">📋</span>
            Logs {logs.length > 0 ? `(${logs.length})` : ''}
          </h3>
          <div className="flex items-center gap-2 text-xs">
            {successCount > 0 && (
              <span className="px-2 py-1 rounded bg-green-500/20 text-green-400">
                ✓ {successCount}
              </span>
            )}
            {infoCount > 0 && (
              <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                ℹ {infoCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
                ⚠ {warningCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="px-2 py-1 rounded bg-red-500/20 text-red-400">
                ✗ {errorCount}
              </span>
            )}
          </div>
          {logs.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                className="px-2 py-1 rounded border border-slate-600 bg-slate-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 hover:bg-slate-700 rounded transition-colors text-gray-400 hover:text-white"
          aria-label={isMinimized ? 'Expand logs' : 'Minimize logs'}
        >
          {isMinimized ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
      </div>
      
      {!isMinimized && (
        <div className="bg-black/50 px-3 py-2 max-h-[600px] overflow-y-auto font-mono text-xs leading-relaxed">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {logs.length === 0 ? (
                <p>No logs yet. Logs will appear here when scanning starts...</p>
              ) : (
                <p>No logs match the filter</p>
              )}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const bgColor = 
                log.type === 'error' ? 'bg-red-500/20 text-red-300' :
                log.type === 'success' ? 'bg-green-500/20 text-green-300' :
                log.type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                'bg-blue-500/20 text-blue-300'
              
              const logKey = `${log.timestamp}-${log.type}-${log.message.substring(0, 20)}-${log.url || ''}`
              
              return (
                <div
                  key={logKey}
                  className={`mb-1 py-1.5 px-2.5 rounded border-l-2 ${
                    log.type === 'error' ? 'border-red-500' :
                    log.type === 'success' ? 'border-green-500' :
                    log.type === 'warning' ? 'border-yellow-500' :
                    'border-blue-500'
                  } ${bgColor}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="font-semibold min-w-[65px] text-xs shrink-0">
                      [{log.type.toUpperCase()}]
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs">{log.message}</span>
                        {log.details && (
                          <span className="text-gray-400 text-[10px]">• {log.details}</span>
                        )}
                        {log.performance?.responseTime !== undefined && (
                          <span className="text-purple-400 text-[10px]">⚡ {log.performance.responseTime}ms</span>
                        )}
                        {log.progress && (
                          <span className="text-cyan-400 text-[10px]">
                            📊 {log.progress.current}/{log.progress.total} ({log.progress.percentage}%)
                          </span>
                        )}
                        <span className="text-gray-500 text-[10px] ml-auto">
                          {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {(log.statistics || log.url) && (
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                          {log.statistics && (
                            <>
                              <span>URLs: {log.statistics.urlsScanned}</span>
                              <span>Links: {log.statistics.linksFound}</span>
                              <span>Queue: {log.statistics.queueSize}</span>
                              <span>Visited: {log.statistics.visitedCount}</span>
                              {log.statistics.errors > 0 && (
                                <span className="text-red-400">Errors: {log.statistics.errors}</span>
                              )}
                            </>
                          )}
                          {log.url && (
                            <span className="text-gray-500 truncate max-w-[400px]" title={log.url}>
                              🔗 {log.url}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  )
}
