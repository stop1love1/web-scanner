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
  customHeaders?: Record<string, string> | string // JSON string or parsed object
  scanId?: string
  usePuppeteer?: boolean
}

