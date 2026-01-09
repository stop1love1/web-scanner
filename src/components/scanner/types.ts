export interface ScanResult {
  url: string
  status: 'success' | 'error'
  statusCode?: number
  error?: string
  errorType?: 'timeout' | 'network' | 'server' | 'client' | 'unknown'
  errorSeverity?: 'critical' | 'high' | 'medium' | 'low'
  errorDetails?: {
    code?: string
    message: string
    stack?: string
    retryable?: boolean
    suggestedAction?: string
  }
  responseBody?: string // Response body for errors (400, 500, etc.)
  links?: string[]
  timestamp?: string
  depth?: number
  retryCount?: number
}

export interface ScanLog {
  type: 'info' | 'success' | 'error' | 'warning' | 'critical'
  message: string
  timestamp: string
  url?: string
  details?: string
  errorSeverity?: 'critical' | 'high' | 'medium' | 'low'
  errorCategory?: 'timeout' | 'network' | 'server' | 'client' | 'security' | 'system'
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
    criticalErrors?: number
    highErrors?: number
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

export interface ErrorSummary {
  total: number
  byType: {
    timeout: number
    network: number
    server: number
    client: number
    unknown: number
  }
  bySeverity: {
    critical: number
    high: number
    medium: number
    low: number
  }
  byStatusCode: Record<number, number>
  recentErrors: Array<{
    url: string
    error: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    timestamp: string
  }>
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

