/**
 * Scanner Utility Functions
 * Reusable helper functions for URL normalization, validation, and link extraction
 */

import { getConfig } from './scanner-config'

/**
 * Normalize a URL relative to a base URL
 */
export function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    const config = getConfig()
    
    // Check if href should be excluded
    if (!href || href.trim() === '') {
      return null
    }
    
    // Check excluded protocols
    const lowerHref = href.toLowerCase().trim()
    if (config.linkExtraction.excludeProtocols.some(protocol => lowerHref.startsWith(protocol))) {
      return null
    }
    
    const base = new URL(baseUrl)
    const url = new URL(href, base)
    
    // Remove hash and query params for simpler crawling
    url.hash = ''
    url.search = ''
    
    return url.href
  } catch {
    return null
  }
}

/**
 * Check if URL is on the same domain as base URL
 */
export function isSameDomain(urlString: string, baseUrl: string): boolean {
  try {
    const urlObj = new URL(urlString)
    const baseUrlObj = new URL(baseUrl)
    return urlObj.hostname === baseUrlObj.hostname
  } catch {
    return false
  }
}

/**
 * Extract links from HTML using Cheerio
 */
export function extractLinksFromHtml(html: string, currentUrl: string): string[] {
  const cheerio = require('cheerio')
  const $ = cheerio.load(html)
  const config = getConfig()
  const links: string[] = []
  
  // Extract from anchor tags
  $('a[href]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href')
    if (href) links.push(href)
  })
  
  // Extract from data attributes
  if (config.linkExtraction.includeDataAttributes) {
    $('[data-href], [data-url], [data-link], [data-href-url]').each((_: number, el: cheerio.Element) => {
      const href = $(el).attr('data-href') || 
                   $(el).attr('data-url') || 
                   $(el).attr('data-link') || 
                   $(el).attr('data-href-url')
      if (href) links.push(href)
    })
  }
  
  // Extract from form actions
  if (config.linkExtraction.includeForms) {
    $('form[action]').each((_: number, el: cheerio.Element) => {
      const action = $(el).attr('action')
      if (action) links.push(action)
    })
  }
  
  // Extract from onclick handlers
  if (config.linkExtraction.includeOnClick) {
    $('[onclick]').each((_: number, el: cheerio.Element) => {
      const onclick = $(el).attr('onclick') || ''
      const urlMatch = onclick.match(/(?:href|url|link|location)\s*[=:]\s*['"]([^'"]+)['"]/i)
      if (urlMatch?.[1]) {
        links.push(urlMatch[1])
      }
    })
  }
  
  // Extract from meta refresh
  if (config.linkExtraction.includeMetaRefresh) {
    $('meta[http-equiv="refresh"]').each((_: number, el: cheerio.Element) => {
      const content = $(el).attr('content') ?? ''
      const urlMatch = content.match(/url=['"]?([^'";]+)/i)
      if (urlMatch?.[1]) {
        links.push(urlMatch[1])
      }
    })
  }
  
  // Extract from canonical links
  if (config.linkExtraction.includeCanonical) {
    $('link[rel="canonical"]').each((_: number, el: cheerio.Element) => {
      const href = $(el).attr('href')
      if (href) links.push(href)
    })
  }
  
  return [...new Set(links)] // Remove duplicates
}

/**
 * Extract links from DOM using Puppeteer page.evaluate
 */
export async function extractLinksFromPage(page: any): Promise<string[]> {
  const config = getConfig()
  
  return await page.evaluate((linkExtractionConfig: typeof config.linkExtraction) => {
    const links: string[] = []
    
    // Extract from anchor tags
    document.querySelectorAll('a[href]').forEach((el) => {
      const href = el.getAttribute('href')
      if (href) links.push(href)
    })
    
    // Extract from data attributes
    if (linkExtractionConfig.includeDataAttributes) {
      document.querySelectorAll('[data-href], [data-url], [data-link], [data-href-url]').forEach((el) => {
        const href = el.getAttribute('data-href') || 
                     el.getAttribute('data-url') || 
                     el.getAttribute('data-link') || 
                     el.getAttribute('data-href-url')
        if (href) links.push(href)
      })
    }
    
    // Extract from form actions
    if (linkExtractionConfig.includeForms) {
      document.querySelectorAll('form[action]').forEach((el) => {
        const action = el.getAttribute('action')
        if (action) links.push(action)
      })
    }
    
    // Extract from onclick handlers
    if (linkExtractionConfig.includeOnClick) {
      document.querySelectorAll('[onclick]').forEach((el) => {
        const onclick = el.getAttribute('onclick') || ''
        const urlMatch = onclick.match(/(?:href|url|link|location)\s*[=:]\s*['"]([^'"]+)['"]/i)
        if (urlMatch && urlMatch[1]) {
          links.push(urlMatch[1])
        }
      })
    }
    
    // Extract from meta refresh
    if (linkExtractionConfig.includeMetaRefresh) {
      const metaRefresh = document.querySelector('meta[http-equiv="refresh"]')
      if (metaRefresh) {
        const content = metaRefresh.getAttribute('content') || ''
        const urlMatch = content.match(/url=['"]?([^'";]+)/i)
        if (urlMatch && urlMatch[1]) {
          links.push(urlMatch[1])
        }
      }
    }
    
    // Extract from canonical links
    if (linkExtractionConfig.includeCanonical) {
      const canonical = document.querySelector('link[rel="canonical"]')
      if (canonical) {
        const href = canonical.getAttribute('href')
        if (href) links.push(href)
      }
    }
    
    return [...new Set(links)]
  }, config.linkExtraction)
}

/**
 * Format elapsed time in human-readable format
 */
export function formatElapsedTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, total: number): number {
  if (total === 0) return 0
  return Math.round((current / total) * 100)
}

/**
 * Generate unique scan ID
 */
export function generateScanId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

