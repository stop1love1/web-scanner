/**
 * Scanner Configuration
 * Centralized configuration for easy customization
 */

export interface ScannerConfig {
  // Scanning limits
  maxDepth: number
  maxPages: number
  
  // Parallel scanning
  maxConcurrentRequests: number // Maximum number of concurrent requests
  
  // Timeouts
  defaultTimeout: number
  minTimeout: number
  maxTimeout: number
  
  // Puppeteer settings
  puppeteer: {
    enabled: boolean
    headless: boolean
    viewport: {
      width: number
      height: number
    }
    userAgent: string
    args: string[]
    waitForNavigation: {
      waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
      timeout: number
    }
    dynamicContentWait: number // ms to wait for dynamic content
  }
  
  // Polling settings
  polling: {
    interval: number // ms between log polls
    finalLogsDelay: number // ms to wait for final logs after scan
  }
  
  // Logging settings
  logging: {
    enabled: boolean
    showTimestamp: boolean
    showProgress: boolean
    showStatistics: boolean
    showPerformance: boolean
    maxLogEntries: number // Max logs to keep in memory
    logRetentionMinutes: number // Minutes to keep logs after scan completes
  }
  
  // UI settings
  ui: {
    autoScrollLogs: boolean
    defaultShowLogin: boolean
    defaultShowAdvanced: boolean
    logMaxHeight: string
    resultsPerPage: number
  }
  
  // Link extraction settings
  linkExtraction: {
    includeDataAttributes: boolean
    includeOnClick: boolean
    includeForms: boolean
    includeMetaRefresh: boolean
    includeCanonical: boolean
    includeInteractiveElements: boolean // Click on dropdowns, tabs, modals to reveal content
    excludeProtocols: string[] // e.g., ['javascript:', 'mailto:', 'tel:']
  }
  
  // Excel export settings
  excel: {
    maxResponseBodyLength: number
    defaultFilename: string
    sheetNames: {
      summary: string
      details: string
    }
  }
}

export const defaultConfig: ScannerConfig = {
  maxDepth: 999999,
  maxPages: 999999,
  
  maxConcurrentRequests: 5, // Scan 5 URLs in parallel
  
  defaultTimeout: 30000,
  minTimeout: 5000,
  maxTimeout: 120000,
  
  puppeteer: {
    enabled: true,
    headless: true,
    viewport: {
      width: 1920,
      height: 1080,
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
    waitForNavigation: {
      waitUntil: 'networkidle2',
      timeout: 30000,
    },
    dynamicContentWait: 1500, // Increased from 1000ms to 1500ms for better dynamic content detection
  },
  
  polling: {
    interval: 500,
    finalLogsDelay: 2000,
  },
  
  logging: {
    enabled: true,
    showTimestamp: true,
    showProgress: true,
    showStatistics: true,
    showPerformance: true,
    maxLogEntries: 10000,
    logRetentionMinutes: 5,
  },
  
  ui: {
    autoScrollLogs: true,
    defaultShowLogin: true,
    defaultShowAdvanced: false,
    logMaxHeight: '500px',
    resultsPerPage: 50,
  },
  
  linkExtraction: {
    includeDataAttributes: true,
    includeOnClick: true,
    includeForms: true,
    includeMetaRefresh: true,
    includeCanonical: true,
    includeInteractiveElements: true, // Enable clicking on UI elements to reveal content
    excludeProtocols: ['javascript:', 'mailto:', 'tel:', 'data:', 'blob:'],
  },
  
  excel: {
    maxResponseBodyLength: 500,
    defaultFilename: 'website-scan-report',
    sheetNames: {
      summary: 'Summary',
      details: 'Details',
    },
  },
}

// Export config getter function for easy access
export const getConfig = (): ScannerConfig => defaultConfig

