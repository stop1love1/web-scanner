import { Loader2 } from 'lucide-react'

interface ScannerProgressProps {
  status: string
  currentUrl?: string
  current?: number
  total?: number
}

export function ScannerProgress({ status, currentUrl, current, total }: ScannerProgressProps) {
  const progressPercent = total && total > 0 ? ((current || 0) / total) * 100 : 0
  
  return (
    <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-cyan-500/30 shadow-lg">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        <span className="text-sm text-cyan-400 font-medium flex-1">{status}</span>
        {current !== undefined && total !== undefined && (
          <span className="text-xs text-gray-400">
            {current} / {total}
          </span>
        )}
      </div>
      
      {current !== undefined && total !== undefined && total > 0 && (
        <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      
      {currentUrl && (
        <div className="mt-2">
          <p className="text-xs text-gray-400 mb-1">Scanning:</p>
          <p className="text-sm text-gray-300 break-all bg-slate-800/50 p-2 rounded border border-slate-700">
            {currentUrl}
          </p>
        </div>
      )}
    </div>
  )
}
