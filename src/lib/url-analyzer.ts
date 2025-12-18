/**
 * URL Analyzer
 * Enhanced URL parsing and analysis utilities
 */

export interface ParsedUrl {
  protocol: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  queryParams: Record<string, string>
  fullPath: string // pathname + search
  baseUrl: string // protocol + hostname + port
  fullUrl: string
}

/**
 * Parse a URL into its components
 */
export function parseUrl(urlString: string): ParsedUrl | null {
  try {
    const url = new URL(urlString)
    const queryParams: Record<string, string> = {}
    
    // Parse query parameters
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value
    })
    
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : ''),
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      queryParams,
      fullPath: url.pathname + url.search,
      baseUrl: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`,
      fullUrl: url.href,
    }
  } catch {
    return null
  }
}

/**
 * Extract path from URL
 */
export function extractPath(urlString: string): string {
  try {
    const url = new URL(urlString)
    return url.pathname
  } catch {
    return ''
  }
}

/**
 * Check if URL path matches regex pattern
 */
export function matchesPathRegex(urlString: string, regexPattern: string): boolean {
  if (!regexPattern.trim()) {
    return true // No filter means match all
  }
  
  try {
    const regex = new RegExp(regexPattern, 'i')
    const path = extractPath(urlString)
    return regex.test(path)
  } catch {
    return false // Invalid regex means don't match
  }
}

/**
 * Analyze URL for common patterns and characteristics
 */
export interface UrlAnalysis {
  hasQueryParams: boolean
  hasHash: boolean
  pathDepth: number
  pathSegments: string[]
  fileExtension: string | null
  isApiEndpoint: boolean
  isStaticAsset: boolean
  queryParamCount: number
  hasAuthParams: boolean
}

export function analyzeUrl(urlString: string): UrlAnalysis | null {
  const parsed = parseUrl(urlString)
  if (!parsed) {
    return null
  }
  
  const pathSegments = parsed.pathname.split('/').filter(segment => segment.length > 0)
  const lastSegment = pathSegments[pathSegments.length - 1] || ''
  const fileExtension = lastSegment.includes('.') 
    ? lastSegment.split('.').pop()?.toLowerCase() || null
    : null
  
  const staticExtensions = ['css', 'js', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'pdf', 'zip', 'mp4', 'mp3']
  const isStaticAsset = fileExtension ? staticExtensions.includes(fileExtension) : false
  
  const apiIndicators = ['api', 'v1', 'v2', 'v3', 'rest', 'graphql', 'rpc']
  const isApiEndpoint = pathSegments.some(segment => 
    apiIndicators.some(indicator => segment.toLowerCase().includes(indicator))
  )
  
  const authParams = ['token', 'auth', 'key', 'password', 'secret', 'session', 'jwt', 'bearer']
  const hasAuthParams = Object.keys(parsed.queryParams).some(key => 
    authParams.some(auth => key.toLowerCase().includes(auth))
  )
  
  return {
    hasQueryParams: Object.keys(parsed.queryParams).length > 0,
    hasHash: parsed.hash.length > 0,
    pathDepth: pathSegments.length,
    pathSegments,
    fileExtension,
    isApiEndpoint,
    isStaticAsset,
    queryParamCount: Object.keys(parsed.queryParams).length,
    hasAuthParams,
  }
}

/**
 * Get URL path segments as array
 */
export function getPathSegments(urlString: string): string[] {
  try {
    const url = new URL(urlString)
    return url.pathname.split('/').filter(segment => segment.length > 0)
  } catch {
    return []
  }
}

/**
 * Check if URL should be excluded based on path regex
 */
export function shouldExcludeUrl(urlString: string, excludePathRegex?: string): boolean {
  if (!excludePathRegex || !excludePathRegex.trim()) {
    return false
  }
  
  return !matchesPathRegex(urlString, excludePathRegex)
}

/**
 * Check if URL should be included based on path regex
 */
export function shouldIncludeUrl(urlString: string, includePathRegex?: string): boolean {
  if (!includePathRegex || !includePathRegex.trim()) {
    return true // No filter means include all
  }
  
  return matchesPathRegex(urlString, includePathRegex)
}

/**
 * Check if URL is a static file (JS, CSS, images, etc.) that should be excluded from scanning
 */
export function isStaticFile(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    const pathname = url.pathname.toLowerCase()
    
    // List of static file extensions to exclude
    const staticExtensions = [
      // Scripts
      'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
      // Styles
      'css', 'scss', 'sass', 'less',
      // Images
      'jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'webp', 'bmp', 'tiff', 'tif',
      // Fonts
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      // Media
      'mp4', 'mp3', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ogg', 'wav',
      // Documents
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      // Archives
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
      // Other
      'xml', 'json', 'txt', 'csv', 'rtf',
      // Font files
      'woff', 'woff2', 'ttf', 'otf', 'eot',
    ]
    
    // Check if path ends with a static file extension
    // Also check if path contains the extension (for URLs with query params that were removed)
    const hasExtension = staticExtensions.some(ext => {
      return pathname.endsWith(`.${ext}`) || 
             pathname.includes(`.${ext}/`) ||
             pathname.includes(`.${ext}?`) ||
             pathname.includes(`.${ext}#`)
    })
    if (hasExtension) {
      return true
    }
    
    // Check if pathname itself is a static file (e.g., /script.js, /style.css)
    // Extract the last segment and check if it has an extension
    const pathSegments = pathname.split('/').filter(s => s.length > 0)
    const lastSegment = pathSegments[pathSegments.length - 1] || ''
    if (lastSegment.includes('.')) {
      const ext = lastSegment.split('.').pop()?.toLowerCase()
      if (ext && staticExtensions.includes(ext)) {
        return true
      }
    }
    
    // Check common static file paths
    const staticPaths = [
      '/static/', '/assets/', '/public/', '/media/', '/images/', '/img/', 
      '/css/', '/js/', '/fonts/', '/font/', '/scripts/', '/styles/',
      '/vendor/', '/lib/', '/dist/', '/build/', '/_next/static/',
    ]
    
    const isStaticPath = staticPaths.some(path => pathname.includes(path))
    if (isStaticPath) {
      return true
    }
    
    // Check if URL contains common CDN patterns
    const cdnPatterns = ['cdn.', 'static.', 'assets.', 'media.']
    const hostname = url.hostname.toLowerCase()
    if (cdnPatterns.some(pattern => hostname.includes(pattern))) {
      return true
    }
    
    return false
  } catch {
    return false
  }
}

/**
 * Get URL type: 'js', 'css', 'media', or 'normal'
 */
export function getUrlType(urlString: string): 'js' | 'css' | 'media' | 'normal' {
  try {
    const url = new URL(urlString)
    const pathname = url.pathname.toLowerCase()
    
    // Extract file extension
    const pathSegments = pathname.split('/').filter(s => s.length > 0)
    const lastSegment = pathSegments[pathSegments.length - 1] || ''
    const fileExtension = lastSegment.includes('.') 
      ? lastSegment.split('.').pop()?.toLowerCase() || null
      : null
    
    // JavaScript files
    const jsExtensions = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs']
    if (fileExtension && jsExtensions.includes(fileExtension)) {
      return 'js'
    }
    if (pathname.includes('/js/') || pathname.includes('/scripts/') || pathname.includes('/javascript/')) {
      return 'js'
    }
    
    // CSS files
    const cssExtensions = ['css', 'scss', 'sass', 'less']
    if (fileExtension && cssExtensions.includes(fileExtension)) {
      return 'css'
    }
    if (pathname.includes('/css/') || pathname.includes('/styles/') || pathname.includes('/style/')) {
      return 'css'
    }
    
    // Media files (images, videos, audio)
    const mediaExtensions = [
      'jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'webp', 'bmp', 'tiff', 'tif', // Images
      'mp4', 'mp3', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ogg', 'wav', // Video/Audio
      'woff', 'woff2', 'ttf', 'otf', 'eot', // Fonts
    ]
    if (fileExtension && mediaExtensions.includes(fileExtension)) {
      return 'media'
    }
    if (pathname.includes('/media/') || pathname.includes('/images/') || pathname.includes('/img/') || 
        pathname.includes('/fonts/') || pathname.includes('/font/') || pathname.includes('/video/') || 
        pathname.includes('/audio/') || pathname.includes('/assets/')) {
      return 'media'
    }
    
    // Normal page (HTML or no extension)
    return 'normal'
  } catch {
    return 'normal'
  }
}

