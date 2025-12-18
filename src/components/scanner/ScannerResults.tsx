import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Download, Filter, Search, Shield, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { exportToExcel } from '@/lib/export-excel'
import { getConfig } from '@/lib/scanner-config'
import { SecurityReport } from './SecurityReport'
import type { ScanResult } from './types'

interface ScannerResultsProps {
  results: ScanResult[]
  baseUrl?: string
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void
}

export function ScannerResults({ results, baseUrl = '', showToast }: ScannerResultsProps) {
  const config = getConfig()
  const [activeTab, setActiveTab] = useState<'results' | 'security'>('results')
  const [searchTerm, setSearchTerm] = useState('')
  const [regexFilter, setRegexFilter] = useState('')
  const [regexError, setRegexError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error' | '2xx' | '4xx' | '5xx'>('all')
  const [statusCodeFilter, setStatusCodeFilter] = useState<string>('all')
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  
  // Collect all unique URLs with their details
  const urlMap = useMemo(() => {
    const map = new Map<string, ScanResult>()
    
    results.forEach((result) => {
      if (!map.has(result.url)) {
        map.set(result.url, result)
      }
      result.links?.forEach((link) => {
        if (!map.has(link)) {
          map.set(link, {
            url: link,
            status: 'success',
            links: [],
            timestamp: result.timestamp,
          })
        }
      })
    })
    
    return map
  }, [results])
  
  // Get unique status codes
  const statusCodes = useMemo(() => {
    const codes = new Set<number>()
    Array.from(urlMap.values()).forEach(r => {
      if (r.statusCode) codes.add(r.statusCode)
    })
    return Array.from(codes).sort((a, b) => a - b)
  }, [urlMap])
  
  // Filter and search
  const filteredUrls = useMemo(() => {
    let filtered = Array.from(urlMap.entries())
    
    // Filter by status type
    if (statusFilter === 'success') {
      filtered = filtered.filter(([_, result]) => result.status === 'success')
    } else if (statusFilter === 'error') {
      filtered = filtered.filter(([_, result]) => result.status === 'error')
    } else if (statusFilter === '2xx') {
      filtered = filtered.filter(([_, result]) => result.statusCode && result.statusCode >= 200 && result.statusCode < 300)
    } else if (statusFilter === '4xx') {
      filtered = filtered.filter(([_, result]) => result.statusCode && result.statusCode >= 400 && result.statusCode < 500)
    } else if (statusFilter === '5xx') {
      filtered = filtered.filter(([_, result]) => result.statusCode && result.statusCode >= 500 && result.statusCode < 600)
    }
    
    // Filter by specific status code
    if (statusCodeFilter !== 'all') {
      const code = Number.parseInt(statusCodeFilter, 10)
      filtered = filtered.filter(([_, result]) => result.statusCode === code)
    }
    
    // Search (text search)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(([url, result]) => 
        url.toLowerCase().includes(term) || 
        result.error?.toLowerCase().includes(term) ||
        result.responseBody?.toLowerCase().includes(term)
      )
    }
    
    // Regex filter
    if (regexFilter.trim()) {
      try {
        const regex = new RegExp(regexFilter, 'i')
        filtered = filtered.filter(([url, result]) => 
          regex.test(url) || 
          (result.error && regex.test(result.error)) ||
          (result.responseBody && regex.test(result.responseBody))
        )
        setRegexError(null)
      } catch (error) {
        setRegexError(error instanceof Error ? error.message : 'Invalid regex pattern')
        // Don't filter if regex is invalid
      }
    }
    
    // Sort: success (2xx) first, then errors, then by status code, then by URL
    return filtered.sort((a, b) => {
      const aResult = a[1]
      const bResult = b[1]
      const aCode = aResult.statusCode || 0
      const bCode = bResult.statusCode || 0
      
      // Success (2xx) first
      const aIsSuccess = aCode >= 200 && aCode < 300
      const bIsSuccess = bCode >= 200 && bCode < 300
      
      if (aIsSuccess && !bIsSuccess) return -1
      if (!aIsSuccess && bIsSuccess) return 1
      
      // Then sort by status code
      if (aCode !== bCode) return aCode - bCode
      
      // Finally sort by URL
      return a[0].localeCompare(b[0])
    })
  }, [urlMap, statusFilter, statusCodeFilter, searchTerm, regexFilter])
  
  // Pagination
  const resultsPerPage = config.ui.resultsPerPage
  const totalPages = Math.ceil(filteredUrls.length / resultsPerPage)
  
  // Reset to page 1 when filters change
  const prevFiltersRef = useRef({ statusFilter, statusCodeFilter, searchTerm })
  useEffect(() => {
    if (
      prevFiltersRef.current.statusFilter !== statusFilter ||
      prevFiltersRef.current.statusCodeFilter !== statusCodeFilter ||
      prevFiltersRef.current.searchTerm !== searchTerm
    ) {
      setCurrentPage(1)
      prevFiltersRef.current = { statusFilter, statusCodeFilter, searchTerm }
    }
  }, [statusFilter, statusCodeFilter, searchTerm])
  
  // Reset to page 1 when current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])
  
  const startIndex = (currentPage - 1) * resultsPerPage
  const endIndex = startIndex + resultsPerPage
  const paginatedUrls = filteredUrls.slice(startIndex, endIndex)
  
  // Statistics
  const stats = useMemo(() => {
    const allUrls = Array.from(urlMap.values())
    const statusCodeStats: Record<number, number> = {}
    
    allUrls.forEach(r => {
      if (r.statusCode) {
        statusCodeStats[r.statusCode] = (statusCodeStats[r.statusCode] || 0) + 1
      }
    })
    
    return {
      total: urlMap.size,
      success: allUrls.filter(r => r.status === 'success').length,
      error: allUrls.filter(r => r.status === 'error').length,
      totalLinks: allUrls.reduce((sum, r) => sum + (r.links?.length || 0), 0),
      statusCodeStats,
      errors4xx: allUrls.filter(r => r.statusCode && r.statusCode >= 400 && r.statusCode < 500).length,
      errors5xx: allUrls.filter(r => r.statusCode && r.statusCode >= 500 && r.statusCode < 600).length,
    }
  }, [urlMap])
  
  if (results.length === 0) {
    return null
  }
  
  const getStatusBadge = (result: ScanResult) => {
    if (!result.statusCode) {
      return result.status === 'success' ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
          <CheckCircle className="w-3 h-3" />
          OK
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      )
    }
    
    const code = result.statusCode
    if (code >= 200 && code < 300) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
          <CheckCircle className="w-3 h-3" />
          {code}
        </span>
      )
    } else if (code >= 400 && code < 500) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
          <AlertCircle className="w-3 h-3" />
          {code}
        </span>
      )
    } else if (code >= 500) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
          <XCircle className="w-3 h-3" />
          {code}
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
          {code}
        </span>
      )
    }
  }
  
  const handleCopyAll = () => {
    // Create TSV (Tab-Separated Values) format for Excel paste
    const headers = ['STT', 'Status', 'Status Code', 'URL', 'Links Count', 'Depth', 'Error', 'Notes']
    const rows = paginatedUrls.map(([url, result], index) => {
      const stt = startIndex + index + 1
      const status = result.status === 'success' ? 'Success' : 'Error'
      const statusCode = result.statusCode?.toString() || ''
      const linksCount = (result.links?.length || 0).toString()
      const depth = result.depth !== undefined ? result.depth.toString() : '-'
      const error = result.error || ''
      const notes = result.responseBody ? 'Has response body' : (result.error ? result.error : 'OK')
      
      // Escape tabs and newlines in values
      const escapeValue = (val: string) => val.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '')
      
      return [
        stt.toString(),
        status,
        statusCode,
        url,
        linksCount,
        depth,
        escapeValue(error),
        escapeValue(notes)
      ].join('\t')
    })
    
    const tsvContent = [headers.join('\t'), ...rows].join('\n')
    navigator.clipboard.writeText(tsvContent)
    if (showToast) {
      showToast(`Copied ${paginatedUrls.length} rows to clipboard (TSV format - ready for Excel paste)!`, 'success', 3000)
    } else {
      alert(`Copied ${paginatedUrls.length} rows to clipboard (TSV format - ready for Excel paste)!`)
    }
  }
  
  const handleExportExcel = (filter?: typeof statusFilter) => {
    try {
      exportToExcel(results, baseUrl, filter || statusFilter)
      const filterText = filter && filter !== 'all' ? ` (Filtered: ${filter})` : ''
      if (showToast) {
        showToast(`Excel report exported successfully!${filterText}`, 'success', 3000)
      } else {
        alert(`Excel report exported successfully!${filterText}`)
      }
    } catch (error) {
      console.error('Export error:', error)
      const errorMessage = `Error exporting Excel report: ${error instanceof Error ? error.message : 'Unknown error'}`
      if (showToast) {
        showToast(errorMessage, 'error', 5000)
      } else {
        alert(errorMessage)
      }
    }
  }
  
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-700">
        <button
          type="button"
          onClick={() => setActiveTab('results')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'results'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-gray-300'
          }`}
        >
          <CheckCircle className="w-4 h-4 inline mr-2" />
          Results
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'security'
              ? 'text-yellow-400 border-yellow-400'
              : 'text-gray-400 border-transparent hover:text-gray-300'
          }`}
        >
          <Shield className="w-4 h-4 inline mr-2" />
          Security Report
        </button>
      </div>

      {/* Security Report Tab */}
      {activeTab === 'security' && (
        <SecurityReport results={results} />
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <>
          {/* Header with stats */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-green-400" />
                Scan Results
              </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportExcel('all')}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Export All
              </button>
              <button
                type="button"
                onClick={() => handleExportExcel('success')}
                className="flex items-center gap-2 px-3 py-2 bg-green-500/80 hover:bg-green-600 text-white rounded-lg transition-colors text-sm"
              >
                <Download className="w-3 h-3" />
                Export Success
              </button>
              <button
                type="button"
                onClick={() => handleExportExcel('error')}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/80 hover:bg-red-600 text-white rounded-lg transition-colors text-sm"
              >
                <Download className="w-3 h-3" />
                Export Errors
              </button>
            </div>
            <button
              type="button"
              onClick={handleCopyAll}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Copy URLs
            </button>
          </div>
        </div>
        
        {/* Statistics cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
            <div className="text-gray-400 text-xs mb-1">Total URLs</div>
            <div className="text-xl font-bold text-cyan-400">{stats.total}</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/30">
            <div className="text-gray-400 text-xs mb-1">2xx</div>
            <div className="text-xl font-bold text-green-400">{stats.success}</div>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/30">
            <div className="text-gray-400 text-xs mb-1">4xx</div>
            <div className="text-xl font-bold text-yellow-400">{stats.errors4xx}</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
            <div className="text-gray-400 text-xs mb-1">5xx</div>
            <div className="text-xl font-bold text-red-400">{stats.errors5xx}</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
            <div className="text-gray-400 text-xs mb-1">Errors</div>
            <div className="text-xl font-bold text-red-400">{stats.error}</div>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/30">
            <div className="text-gray-400 text-xs mb-1">Links</div>
            <div className="text-xl font-bold text-blue-400">{stats.totalLinks}</div>
          </div>
        </div>
        
               {/* Search and filter */}
               <div className="flex flex-col gap-3">
                 <div className="flex flex-col sm:flex-row gap-3">
                   <div className="flex-1 relative">
                     <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                     <input
                       type="text"
                       placeholder="Search URL, error, response..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
                     />
                   </div>
                   <div className="flex-1 relative">
                     <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                     <input
                       type="text"
                       placeholder="Regex filter (e.g., /admin|login/i)"
                       value={regexFilter}
                       onChange={(e) => {
                         setRegexFilter(e.target.value)
                         if (e.target.value.trim()) {
                           try {
                             new RegExp(e.target.value, 'i')
                             setRegexError(null)
                           } catch (error) {
                             setRegexError(error instanceof Error ? error.message : 'Invalid regex')
                           }
                         } else {
                           setRegexError(null)
                         }
                       }}
                       className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                         regexError ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-cyan-500'
                       } bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent text-sm font-mono`}
                     />
                     {regexError && (
                       <p className="text-red-400 text-xs mt-1">{regexError}</p>
                     )}
                     {!regexError && regexFilter.trim() && (
                       <p className="text-green-400 text-xs mt-1">Valid regex</p>
                     )}
                   </div>
                 </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="2xx">2xx (Success)</option>
              <option value="4xx">4xx (Client Error)</option>
              <option value="5xx">5xx (Server Error)</option>
            </select>
            {statusCodes.length > 0 && (
              <select
                value={statusCodeFilter}
                onChange={(e) => setStatusCodeFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
              >
                <option value="all">All codes</option>
                {statusCodes.map(code => (
                  <option key={code} value={code.toString()}>{code}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        
        <div className="mt-2 text-sm text-gray-400">
          Showing {filteredUrls.length} / {stats.total} URLs
          {totalPages > 1 && (
            <span className="ml-2">
              (Page {currentPage} / {totalPages})
            </span>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="overflow-x-auto">
        <div className="min-w-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-700/50 border-b border-slate-600">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">STT</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">URL</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Links</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Depth</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Details</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUrls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No URLs found
                  </td>
                </tr>
              ) : (
                paginatedUrls.map(([url, result], index) => {
                  const rowKey = `${url}-${result.statusCode || ''}-${result.timestamp || ''}`
                  return (
                    <tr
                      key={rowKey}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400 text-sm">{startIndex + index + 1}</td>
                    <td className="px-4 py-3">
                      {getStatusBadge(result)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 break-all text-sm"
                      >
                        {url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-sm">
                      {result.links?.length || 0}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-sm">
                      {result.depth !== undefined ? result.depth : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      <div className="max-w-xs">
                        {result.error && (
                          <div className="text-red-400 text-xs mb-1">{result.error}</div>
                        )}
                        {result.responseBody && (
                          <button
                            type="button"
                            onClick={() => setExpandedUrl(expandedUrl === url ? null : url)}
                            className="text-cyan-400 hover:text-cyan-300 text-xs underline"
                          >
                            {expandedUrl === url ? 'Hide' : 'View'} response body
                          </button>
                        )}
                        {expandedUrl === url && result.responseBody && (
                          <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs font-mono text-gray-300 max-h-40 overflow-auto">
                            {result.responseBody}
                          </div>
                        )}
                        {!result.error && !result.responseBody && <span className="text-gray-500">OK</span>}
                      </div>
                    </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Showing {startIndex + 1} - {Math.min(endIndex, filteredUrls.length)} of {filteredUrls.length} URLs
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 rounded-lg border transition-colors ${
                      currentPage === pageNum
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                        : 'border-slate-600 bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        )}
        </>
      )}
    </div>
  )
}
