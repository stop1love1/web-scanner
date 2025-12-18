export interface ScanResult {
  url: string
  status: 'success' | 'error'
  statusCode?: number
  error?: string
  responseBody?: string // Response body for errors (400, 500, etc.)
  links?: string[]
  timestamp?: string
  depth?: number
}

export interface ScanLog {
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  timestamp: string
  url?: string
  details?: string
  // Enhanced log information
  progress?: {
    current: number
    total: number
    percentage: number
  }
  statistics?: {
    urlsScanned: number
    linksFound: number
    errors: number
    queueSize: number
    visitedCount: number
  }
  performance?: {
    responseTime?: number
    elapsedTime?: number
    averageResponseTime?: number
  }
}

export interface ScanConfig {
  url: string
  loginUrl?: string
  username?: string
  password?: string
  usernameField?: string
  passwordField?: string
  maxDepth?: number
  maxPages?: number
  timeout?: number
  maxConcurrentRequests?: number
  customHeaders?: Record<string, string>
  pathRegexFilter?: string // Regex pattern to filter URLs by path
  scanId?: string
  usePuppeteer?: boolean
}

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

