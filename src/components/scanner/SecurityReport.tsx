import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { scanAllResults } from '@/lib/security-scanner'
import type { ScanResult, SecurityVulnerability } from './types'

interface SecurityReportProps {
  results: ScanResult[]
}

export function SecurityReport({ results }: SecurityReportProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low' | 'info'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Scan for vulnerabilities
  const vulnerabilities = useMemo(() => {
    return scanAllResults(results)
  }, [results])

  // Filter vulnerabilities
  const filteredVulnerabilities = useMemo(() => {
    let filtered = vulnerabilities

    if (severityFilter !== 'all') {
      filtered = filtered.filter(v => v.severity === severityFilter)
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(v => v.type === typeFilter)
    }

    return filtered
  }, [vulnerabilities, severityFilter, typeFilter])

  // Statistics
  const stats = useMemo(() => {
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    }
    const typeCounts: Record<string, number> = {}

    vulnerabilities.forEach(v => {
      severityCounts[v.severity]++
      typeCounts[v.type] = (typeCounts[v.type] || 0) + 1
    })

    return { severityCounts, typeCounts }
  }, [vulnerabilities])

  const getSeverityIcon = (severity: SecurityVulnerability['severity']) => {
    switch (severity) {
      case 'critical':
        return <ShieldAlert className="w-5 h-5 text-red-500" />
      case 'high':
        return <ShieldOff className="w-5 h-5 text-orange-500" />
      case 'medium':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'low':
        return <Shield className="w-5 h-5 text-blue-500" />
      case 'info':
        return <ShieldCheck className="w-5 h-5 text-gray-500" />
    }
  }

  const getSeverityBadge = (severity: SecurityVulnerability['severity']) => {
    const colors = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      info: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    }

    return (
      <span className={`px-2 py-1 rounded border text-xs font-medium ${colors[severity]}`}>
        {severity.toUpperCase()}
      </span>
    )
  }

  const getTypeBadge = (type: SecurityVulnerability['type']) => {
    const typeLabels: Record<string, string> = {
      'sql-injection': 'SQL Injection',
      'xss': 'XSS',
      'path-traversal': 'Path Traversal',
      'sensitive-data': 'Sensitive Data',
      'mixed-content': 'Mixed Content',
      'missing-headers': 'Missing Headers',
      'information-disclosure': 'Info Disclosure',
      'directory-listing': 'Directory Listing',
      'default-credentials': 'Default Credentials',
      'csrf': 'CSRF',
      'other': 'Other',
    }

    return (
      <span className="px-2 py-1 rounded bg-slate-700/50 text-gray-300 text-xs">
        {typeLabels[type] || type}
      </span>
    )
  }

  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(vulnerabilities.map(v => v.type))).sort()
  }, [vulnerabilities])

  if (results.length === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <div className="text-center text-gray-400">
          <Shield className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p>No scan results available. Start a scan to check for security vulnerabilities.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-yellow-400" />
            Security Report
          </h2>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
            <div className="text-gray-400 text-xs mb-1">Critical</div>
            <div className="text-xl font-bold text-red-400">{stats.severityCounts.critical}</div>
          </div>
          <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/30">
            <div className="text-gray-400 text-xs mb-1">High</div>
            <div className="text-xl font-bold text-orange-400">{stats.severityCounts.high}</div>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/30">
            <div className="text-gray-400 text-xs mb-1">Medium</div>
            <div className="text-xl font-bold text-yellow-400">{stats.severityCounts.medium}</div>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/30">
            <div className="text-gray-400 text-xs mb-1">Low</div>
            <div className="text-xl font-bold text-blue-400">{stats.severityCounts.low}</div>
          </div>
          <div className="bg-gray-500/10 rounded-lg p-3 border border-gray-500/30">
            <div className="text-gray-400 text-xs mb-1">Info</div>
            <div className="text-xl font-bold text-gray-400">{stats.severityCounts.info}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Severity:</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
              className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            >
              <option value="all">All Types</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type.replace('-', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-400 ml-auto">
            Total: {filteredVulnerabilities.length} / {vulnerabilities.length}
          </div>
        </div>
      </div>

      {/* Vulnerabilities List */}
      <div className="space-y-3">
        {filteredVulnerabilities.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {vulnerabilities.length === 0 ? (
              <div>
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-green-400" />
                <p className="text-lg font-semibold text-green-400 mb-2">No Security Vulnerabilities Detected</p>
                <p className="text-sm">Great! No obvious security issues were found in the scanned URLs.</p>
              </div>
            ) : (
              <p>No vulnerabilities match the selected filters.</p>
            )}
          </div>
        ) : (
          filteredVulnerabilities.map((vuln) => (
            <div
              key={vuln.id}
              className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {getSeverityIcon(vuln.severity)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-white">{vuln.title}</h3>
                    {getSeverityBadge(vuln.severity)}
                    {getTypeBadge(vuln.type)}
                    {vuln.statusCode && (
                      <span className="px-2 py-1 rounded bg-slate-700/50 text-gray-300 text-xs">
                        {vuln.statusCode}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{vuln.description}</p>
                  <div className="mb-2">
                    <a
                      href={vuln.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 break-all text-sm"
                    >
                      {vuln.url}
                    </a>
                  </div>
                  {vuln.evidence && (
                    <div className="mb-2 p-2 bg-slate-800/50 rounded text-xs font-mono text-gray-400 break-all">
                      <span className="text-gray-500">Evidence: </span>
                      {vuln.evidence}
                    </div>
                  )}
                  {vuln.recommendation && (
                    <div className="mt-2 p-2 bg-blue-500/10 rounded border border-blue-500/30">
                      <p className="text-blue-300 text-xs font-medium mb-1">💡 Recommendation:</p>
                      <p className="text-blue-200 text-xs">{vuln.recommendation}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

