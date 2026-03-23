/**
 * Scanner Helper Functions
 * Extracted reusable logic from scanner-server.ts to reduce duplication
 */

import type * as cheerio from 'cheerio'
import type { ScanResult } from '@/components/scanner/types'
import { getConfig } from './scanner-config'
import { isSameDomain, normalizeUrl } from './scanner-utils'
import { isStaticFile, shouldIncludeUrl } from './url-analyzer'

/**
 * Parse a cookie string into a Map of name -> value
 */
export function parseCookies(cookieString: string): Map<string, string> {
  const cookieMap = new Map<string, string>()
  if (!cookieString) return cookieMap

  cookieString.split('; ').forEach(cookie => {
    const [name, ...valueParts] = cookie.split('=')
    if (name && valueParts.length > 0) {
      cookieMap.set(name.trim(), decodeURIComponent(valueParts.join('=')))
    }
  })
  return cookieMap
}

/**
 * Merge new Set-Cookie headers into an existing cookie map
 */
export function mergeCookieHeaders(cookieMap: Map<string, string>, cookieHeaders: string[]): Map<string, string> {
  cookieHeaders.forEach(cookieHeader => {
    const cookieParts = cookieHeader.split(';')[0].split('=')
    if (cookieParts.length >= 2) {
      const cookieName = cookieParts[0].trim()
      const cookieValue = cookieParts.slice(1).join('=')
      cookieMap.set(cookieName, cookieValue)
    }
  })
  return cookieMap
}

/**
 * Build a cookie string from a Map
 */
export function buildCookieString(cookieMap: Map<string, string>): string {
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

/**
 * Extract CSRF token from HTML page using cheerio
 */
export function extractCsrfToken($page: ReturnType<typeof cheerio.load>): string {
  const csrfInputs = [
    $page('input[name="_token"]').attr('value'),
    $page('input[name="csrf_token"]').attr('value'),
    $page('input[name="authenticity_token"]').attr('value'),
    $page('meta[name="csrf-token"]').attr('content'),
    $page('meta[name="_token"]').attr('content'),
  ].filter(Boolean)

  return csrfInputs[0] || ''
}

/**
 * Try to get CSRF token from XSRF-TOKEN cookie (Laravel)
 */
export function extractCsrfFromCookies(cookieMap: Map<string, string>): string {
  if (cookieMap.has('XSRF-TOKEN')) {
    try {
      return decodeURIComponent(cookieMap.get('XSRF-TOKEN') || '')
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * Content-based status code detection patterns
 * Detects real status codes when servers return 200 with error page content
 */
const STATUS_DETECTION_PATTERNS = {
  404: {
    patterns: [
      /404/i, /not found/i, /page not found/i,
      /không tìm thấy/i, /trang không tồn tại/i,
      /file not found/i, /document not found/i,
      /resource not found/i, /url not found/i,
    ],
    confirmPatterns: ['404', 'not found', 'không tìm thấy'],
  },
  403: {
    patterns: [
      /403/i, /forbidden/i, /access denied/i,
      /permission denied/i, /không có quyền/i, /bị cấm/i,
    ],
  },
  500: {
    patterns: [
      /500/i, /internal server error/i,
      /server error/i, /lỗi máy chủ/i,
    ],
  },
  401: {
    patterns: [
      /401/i, /unauthorized/i,
      /authentication required/i, /chưa đăng nhập/i,
    ],
  },
} as const

/**
 * Detect actual status code from HTML content when server returns 200
 */
export function detectStatusFromContent(html: string): number | null {
  const lowerHtml = html.toLowerCase()

  for (const [code, config] of Object.entries(STATUS_DETECTION_PATTERNS)) {
    const matchesPattern = config.patterns.some(pattern => pattern.test(lowerHtml))
    if (!matchesPattern) continue

    // For 404, require additional confirmation patterns
    if ('confirmPatterns' in config) {
      const confirmed = config.confirmPatterns.some(p => lowerHtml.includes(p))
      if (!confirmed) continue
    }

    return Number(code)
  }

  return null
}

/**
 * Recursively extract URLs from a JSON object
 */
export function extractUrlsFromJson(
  obj: unknown,
  baseUrl: string,
  domainUrl: string,
): string[] {
  const urls: string[] = []

  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.match(/^https?:\/\//) || value.match(/^\/[^\/]/)) {
        const normalized = normalizeUrl(value, baseUrl)
        if (normalized && isSameDomain(normalized, domainUrl) && !isStaticFile(normalized)) {
          urls.push(normalized)
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk)
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk)
    }
  }

  walk(obj)
  return urls
}

/**
 * Process extracted links: normalize, filter static files, filter by regex, deduplicate
 * Returns { newLinks, filteredCount } where newLinks are URLs ready to add to queue
 */
export function processExtractedLinks(
  links: string[],
  currentUrl: string,
  domainUrl: string,
  visited: Set<string>,
  pathRegexFilter?: string,
): { newLinks: string[]; normalizedLinks: string[]; filteredCount: number } {
  const newLinks: string[] = []
  const normalizedLinks: string[] = []
  let filteredCount = 0

  for (const href of links) {
    const normalized = normalizeUrl(href, currentUrl)
    if (!normalized || !isSameDomain(normalized, domainUrl) || visited.has(normalized)) {
      continue
    }

    if (isStaticFile(normalized)) {
      filteredCount++
      continue
    }

    if (pathRegexFilter && !shouldIncludeUrl(normalized, pathRegexFilter)) {
      filteredCount++
      continue
    }

    normalizedLinks.push(normalized)
    newLinks.push(normalized)
  }

  return { newLinks, normalizedLinks, filteredCount }
}

/**
 * Build a ScanResult object from scan data
 */
export function buildScanResult(params: {
  url: string
  statusCode: number
  links: string[]
  html: string
  depth: number
  errorClassification?: {
    type: 'timeout' | 'network' | 'server' | 'client' | 'unknown'
    severity: 'critical' | 'high' | 'medium' | 'low'
    message: string
    code?: string
    retryable: boolean
    suggestedAction?: string
  }
}): ScanResult {
  const { url, statusCode, links, html, depth, errorClassification } = params
  const resultStatus = statusCode >= 200 && statusCode < 300 ? 'success' : 'error'

  return {
    url,
    status: resultStatus,
    statusCode,
    links,
    responseBody: (statusCode >= 400 && statusCode < 600) ? html.substring(0, 1000) : undefined,
    error: resultStatus === 'error' ? `HTTP ${statusCode}` : undefined,
    errorType: errorClassification?.type,
    errorSeverity: errorClassification?.severity,
    errorDetails: errorClassification ? {
      code: errorClassification.code,
      message: errorClassification.message,
      retryable: errorClassification.retryable,
      suggestedAction: errorClassification.suggestedAction,
    } : undefined,
    timestamp: new Date().toISOString(),
    depth,
  }
}

/**
 * Get default request headers
 */
export function getDefaultHeaders(customHeaders: Record<string, string> = {}, sessionCookies = ''): Record<string, string> {
  const config = getConfig()
  return {
    'User-Agent': config.puppeteer.userAgent,
    ...(sessionCookies ? { 'Cookie': sessionCookies } : {}),
    ...customHeaders,
  }
}

/**
 * Log status code with appropriate log level
 */
export function getLogTypeForStatus(statusCode: number): 'success' | 'warning' | 'error' | 'info' {
  if (statusCode >= 200 && statusCode < 300) return 'success'
  if (statusCode >= 400 && statusCode < 500) return 'warning'
  if (statusCode >= 500) return 'error'
  return 'info'
}
