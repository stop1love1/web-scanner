/**
 * Security Vulnerability Scanner
 * Detects common security vulnerabilities in scanned URLs and responses
 */

import type { ScanResult } from '@/components/scanner/types'

export interface SecurityVulnerability {
  id: string
  type: 'sql-injection' | 'xss' | 'path-traversal' | 'sensitive-data' | 'mixed-content' | 'missing-headers' | 'information-disclosure' | 'directory-listing' | 'default-credentials' | 'csrf' | 'other'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string
  url: string
  evidence?: string
  recommendation?: string
  statusCode?: number
  timestamp?: string
}

/**
 * SQL Injection patterns
 */
const SQL_INJECTION_PATTERNS = [
  /['"]\s*(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /union\s+select/i,
  /exec\s*\(/i,
  /;\s*(drop|delete|insert|update|alter|create)\s/i,
  /'\s*or\s*'1'\s*=\s*'1/i,
  /\/\*.*\*\//, // SQL comments
  /waitfor\s+delay/i,
  /xp_cmdshell/i,
]

/**
 * XSS patterns
 */
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/i,
  /javascript:/i,
  /on\w+\s*=\s*['"][^'"]*['"]/i, // onclick, onerror, etc.
  /<iframe[^>]*src/i,
  /<img[^>]*onerror/i,
  /<svg[^>]*onload/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
]

/**
 * Path Traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\/\.\.\//,
  /\.\.\\\.\.\\/,
  /\.\.%2f/i,
  /\.\.%5c/i,
  /\.\.%252f/i,
  /\.\.%255c/i,
]

/**
 * Sensitive data patterns
 */
const SENSITIVE_DATA_PATTERNS = [
  /password\s*[:=]\s*['"]?[^'"]{3,}/i,
  /api[_-]?key\s*[:=]\s*['"]?[^'"]{8,}/i,
  /secret\s*[:=]\s*['"]?[^'"]{8,}/i,
  /token\s*[:=]\s*['"]?[^'"]{8,}/i,
  /bearer\s+[a-zA-Z0-9_-]{20,}/i,
  /aws[_-]?access[_-]?key/i,
  /private[_-]?key/i,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
]

/**
 * Security headers that should be present
 */
const REQUIRED_SECURITY_HEADERS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'X-XSS-Protection',
  'Strict-Transport-Security',
  'Content-Security-Policy',
]

/**
 * Helper to check patterns against text and create vulnerabilities
 */
function checkPatterns(
  result: ScanResult,
  patterns: RegExp[],
  config: {
    idPrefix: string
    type: SecurityVulnerability['type']
    severity: SecurityVulnerability['severity']
    title: string
    description: string
    recommendation: string
    checkUrl?: boolean
    checkBody?: boolean
  },
): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = []
  const url = result.url
  const responseBody = result.responseBody || ''
  const checkUrl = config.checkUrl ?? true
  const checkBody = config.checkBody ?? true

  patterns.forEach((pattern, index) => {
    const urlMatch = checkUrl && pattern.test(url)
    const bodyMatch = checkBody && pattern.test(responseBody)

    if (urlMatch || bodyMatch) {
      const evidence = (checkUrl ? url.match(pattern)?.[0] : undefined) ||
                       (checkBody ? responseBody.match(pattern)?.[0]?.substring(0, 100) : undefined)
      vulnerabilities.push({
        id: `${config.idPrefix}-${result.url}-${index}`,
        type: config.type,
        severity: config.severity,
        title: config.title,
        description: config.description,
        url: result.url,
        evidence,
        recommendation: config.recommendation,
        statusCode: result.statusCode,
        timestamp: result.timestamp,
      })
    }
  })

  return vulnerabilities
}

/**
 * Scan a single result for security vulnerabilities
 */
export function scanForVulnerabilities(result: ScanResult, responseHeaders?: Headers): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = []
  const url = result.url
  const responseBody = result.responseBody || ''

  // Check for SQL Injection
  vulnerabilities.push(...checkPatterns(result, SQL_INJECTION_PATTERNS, {
    idPrefix: 'sql-injection', type: 'sql-injection', severity: 'high',
    title: 'Potential SQL Injection',
    description: 'URL or response contains SQL injection patterns',
    recommendation: 'Sanitize and validate all user inputs. Use parameterized queries or prepared statements.',
  }))

  // Check for XSS
  vulnerabilities.push(...checkPatterns(result, XSS_PATTERNS, {
    idPrefix: 'xss', type: 'xss', severity: 'high',
    title: 'Potential Cross-Site Scripting (XSS)',
    description: 'URL or response contains XSS patterns',
    recommendation: 'Sanitize and encode user inputs. Implement Content Security Policy (CSP).',
  }))

  // Check for Path Traversal (URL only)
  vulnerabilities.push(...checkPatterns(result, PATH_TRAVERSAL_PATTERNS, {
    idPrefix: 'path-traversal', type: 'path-traversal', severity: 'high',
    title: 'Potential Path Traversal',
    description: 'URL contains path traversal patterns (../)',
    recommendation: 'Validate and sanitize file paths. Use whitelist-based path validation.',
    checkBody: false,
  }))

  // Check for Sensitive Data Exposure (body only)
  vulnerabilities.push(...checkPatterns(result, SENSITIVE_DATA_PATTERNS, {
    idPrefix: 'sensitive-data', type: 'sensitive-data', severity: 'critical',
    title: 'Sensitive Data Exposure',
    description: 'Response contains potentially sensitive information (passwords, keys, tokens)',
    recommendation: 'Remove sensitive data from responses. Use secure storage and transmission.',
    checkUrl: false,
  }))

  // Check for Mixed Content (HTTP on HTTPS site)
  if (url.startsWith('https://') && responseBody.match(/http:\/\//)) {
    vulnerabilities.push({
      id: `mixed-content-${result.url}`,
      type: 'mixed-content',
      severity: 'medium',
      title: 'Mixed Content (HTTP on HTTPS)',
      description: 'HTTPS page contains HTTP resources',
      url: result.url,
      recommendation: 'Use HTTPS for all resources. Update all HTTP links to HTTPS.',
      statusCode: result.statusCode,
      timestamp: result.timestamp,
    })
  }

  // Check for Information Disclosure in Error Pages
  if (result.statusCode && result.statusCode >= 400 && result.statusCode < 600) {
    vulnerabilities.push(...checkPatterns(result, [
      /stack\s+trace/i, /database\s+error/i, /sql\s+error/i,
      /file\s+not\s+found/i, /permission\s+denied/i,
      /access\s+denied/i, /internal\s+server\s+error/i,
    ], {
      idPrefix: 'info-disclosure', type: 'information-disclosure', severity: 'medium',
      title: 'Information Disclosure in Error Page',
      description: `Error page (${result.statusCode}) reveals system information`,
      recommendation: 'Use generic error messages for users. Log detailed errors server-side only.',
      checkUrl: false,
    }))
  }

  // Check for Directory Listing
  if (responseBody.match(/<title>.*Index of.*<\/title>/i) || 
      responseBody.match(/<h1>.*Index of.*<\/h1>/i) ||
      responseBody.match(/Parent Directory/i)) {
    vulnerabilities.push({
      id: `directory-listing-${result.url}`,
      type: 'directory-listing',
      severity: 'medium',
      title: 'Directory Listing Enabled',
      description: 'Directory listing is enabled, exposing file structure',
      url: result.url,
      recommendation: 'Disable directory listing in web server configuration.',
      statusCode: result.statusCode,
      timestamp: result.timestamp,
    })
  }

  // Check for Missing Security Headers (if headers available)
  if (responseHeaders) {
    const missingHeaders: string[] = []
    REQUIRED_SECURITY_HEADERS.forEach(header => {
      if (!responseHeaders.get(header)) {
        missingHeaders.push(header)
      }
    })

    if (missingHeaders.length > 0) {
      vulnerabilities.push({
        id: `missing-headers-${result.url}`,
        type: 'missing-headers',
        severity: 'low',
        title: 'Missing Security Headers',
        description: `Missing recommended security headers: ${missingHeaders.join(', ')}`,
        url: result.url,
        recommendation: 'Implement security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, Content-Security-Policy',
        statusCode: result.statusCode,
        timestamp: result.timestamp,
      })
    }
  }

  // Check for default credentials or common paths
  const defaultPaths = [
    '/admin',
    '/administrator',
    '/wp-admin',
    '/phpmyadmin',
    '/.env',
    '/config.php',
    '/web.config',
  ]

  defaultPaths.forEach(path => {
    if (url.includes(path) && result.statusCode === 200) {
      vulnerabilities.push({
        id: `default-path-${result.url}`,
        type: 'other',
        severity: 'info',
        title: 'Default/Common Path Detected',
        description: `Found accessible default path: ${path}`,
        url: result.url,
        recommendation: 'Review and secure default paths. Change default credentials if applicable.',
        statusCode: result.statusCode,
        timestamp: result.timestamp,
      })
    }
  })

  return vulnerabilities
}

/**
 * Scan all results for vulnerabilities
 */
export function scanAllResults(results: ScanResult[]): SecurityVulnerability[] {
  const allVulnerabilities: SecurityVulnerability[] = []
  const seenIds = new Set<string>()

  results.forEach(result => {
    const vulnerabilities = scanForVulnerabilities(result)
    vulnerabilities.forEach(vuln => {
      if (!seenIds.has(vuln.id)) {
        seenIds.add(vuln.id)
        allVulnerabilities.push(vuln)
      }
    })
  })

  // Sort by severity (critical -> high -> medium -> low -> info)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  return allVulnerabilities.sort((a, b) => {
    return severityOrder[a.severity] - severityOrder[b.severity]
  })
}

