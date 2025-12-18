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
  
  // Extract from button elements with data attributes or onclick
  $('button[data-href], button[data-url], button[data-link], button[onclick]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('data-href') || 
                 $(el).attr('data-url') || 
                 $(el).attr('data-link')
    if (href) {
      links.push(href)
    } else {
      const onclick = $(el).attr('onclick') || ''
      const urlMatch = onclick.match(/(?:href|url|link|location|window\.location|window\.open)\s*[=:\.]\s*['"]([^'"]+)['"]/i)
      if (urlMatch?.[1]) {
        links.push(urlMatch[1])
      }
    }
  })
  
  // Extract from elements with role="button" or role="link"
  $('[role="button"][data-href], [role="button"][data-url], [role="link"][data-href], [role="link"][data-url]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('data-href') || 
                 $(el).attr('data-url') || 
                 $(el).attr('data-link')
    if (href) links.push(href)
  })
  
  // Extract from iframe src
  $('iframe[src]').each((_: number, el: cheerio.Element) => {
    const src = $(el).attr('src')
    if (src && !src.startsWith('javascript:') && !src.startsWith('data:')) {
      links.push(src)
    }
  })
  
  // Extract from image maps (area elements)
  $('area[href]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href')
    if (href) links.push(href)
  })
  
  // Extract from base href
  $('base[href]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href')
    if (href) links.push(href)
  })
  
  // Extract from other link rel types (prefetch, preload, etc.)
  $('link[rel="prefetch"], link[rel="preload"], link[rel="dns-prefetch"], link[rel="prerender"]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href')
    if (href && !href.startsWith('javascript:') && !href.startsWith('data:')) {
      links.push(href)
    }
  })
  
  // Extract from script src (for API endpoints or data URLs)
  $('script[src]').each((_: number, el: cheerio.Element) => {
    const src = $(el).attr('src')
    if (src && !src.startsWith('javascript:') && !src.startsWith('data:') && !src.startsWith('blob:')) {
      // Only include if it looks like a URL path (not external CDN)
      try {
        const url = new URL(src, currentUrl)
        if (url.hostname === new URL(currentUrl).hostname) {
          links.push(src)
        }
      } catch {
        // Relative path, include it
        if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) {
          links.push(src)
        }
      }
    }
  })
  
  // Extract from elements with data-toggle or data-target (Bootstrap modals, tabs, etc.)
  $('[data-toggle][data-target], [data-bs-toggle][data-bs-target]').each((_: number, el: cheerio.Element) => {
    const target = $(el).attr('data-target') || 
                   $(el).attr('data-bs-target') || 
                   $(el).attr('href')
    if (target && target.startsWith('#')) {
      // This is a modal/tab trigger, might contain links in the target element
      // We'll handle this in Puppeteer by actually clicking
    } else if (target && !target.startsWith('javascript:')) {
      links.push(target)
    }
  })
  
  return [...new Set(links)] // Remove duplicates
}

/**
 * Extract links from DOM using Puppeteer page.evaluate
 * Also interacts with UI elements to reveal hidden content
 */
export async function extractLinksFromPage(page: any): Promise<string[]> {
  const config = getConfig()
  
  // First, try to interact with common UI elements to reveal hidden content
  if (config.linkExtraction.includeInteractiveElements) {
    try {
      // Click on dropdowns, tabs, and collapsible elements
      await page.evaluate(() => {
      // Click on dropdown toggles
      const dropdownToggles = document.querySelectorAll('[data-toggle="dropdown"], [data-bs-toggle="dropdown"], .dropdown-toggle, [aria-haspopup="true"]')
      dropdownToggles.forEach((el: Element) => {
        try {
          (el as HTMLElement).click()
        } catch {}
      })
      
      // Click on tab buttons
      const tabButtons = document.querySelectorAll('[data-toggle="tab"], [data-bs-toggle="tab"], .nav-link[data-toggle], [role="tab"]')
      tabButtons.forEach((el: Element) => {
        try {
          (el as HTMLElement).click()
        } catch {}
      })
      
      // Click on accordion/collapse toggles
      const collapseToggles = document.querySelectorAll('[data-toggle="collapse"], [data-bs-toggle="collapse"], [aria-expanded="false"]')
      collapseToggles.forEach((el: Element) => {
        try {
          (el as HTMLElement).click()
        } catch {}
      })
      
      // Click on modal triggers (but don't wait for modal to open)
      const modalTriggers = document.querySelectorAll('[data-toggle="modal"], [data-bs-toggle="modal"]')
      modalTriggers.forEach((el: Element) => {
        try {
          (el as HTMLElement).click()
        } catch {}
      })
    })
    
      // Wait a bit for content to appear
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      // Ignore errors from interactions
    }
  }
  
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
    
    // Extract from button elements with data attributes or onclick
    document.querySelectorAll('button[data-href], button[data-url], button[data-link], button[onclick]').forEach((el) => {
      const href = el.getAttribute('data-href') || 
                   el.getAttribute('data-url') || 
                   el.getAttribute('data-link')
      if (href) {
        links.push(href)
      } else {
        const onclick = el.getAttribute('onclick') || ''
        const urlMatch = onclick.match(/(?:href|url|link|location|window\.location|window\.open)\s*[=:\.]\s*['"]([^'"]+)['"]/i)
        if (urlMatch && urlMatch[1]) {
          links.push(urlMatch[1])
        }
      }
    })
    
    // Extract from elements with role="button" or role="link"
    document.querySelectorAll('[role="button"][data-href], [role="button"][data-url], [role="link"][data-href], [role="link"][data-url]').forEach((el) => {
      const href = el.getAttribute('data-href') || 
                   el.getAttribute('data-url') || 
                   el.getAttribute('data-link')
      if (href) links.push(href)
    })
    
    // Extract from iframe src
    document.querySelectorAll('iframe[src]').forEach((el) => {
      const src = el.getAttribute('src')
      if (src && !src.startsWith('javascript:') && !src.startsWith('data:')) {
        links.push(src)
      }
    })
    
    // Extract from image maps (area elements)
    document.querySelectorAll('area[href]').forEach((el) => {
      const href = el.getAttribute('href')
      if (href) links.push(href)
    })
    
    // Extract from base href
    const base = document.querySelector('base[href]')
    if (base) {
      const href = base.getAttribute('href')
      if (href) links.push(href)
    }
    
    // Extract from other link rel types
    document.querySelectorAll('link[rel="prefetch"], link[rel="preload"], link[rel="dns-prefetch"], link[rel="prerender"]').forEach((el) => {
      const href = el.getAttribute('href')
      if (href && !href.startsWith('javascript:') && !href.startsWith('data:')) {
        links.push(href)
      }
    })
    
    // Extract from script src (for same-domain scripts)
    document.querySelectorAll('script[src]').forEach((el) => {
      const src = el.getAttribute('src')
      if (src && !src.startsWith('javascript:') && !src.startsWith('data:') && !src.startsWith('blob:')) {
        try {
          const url = new URL(src, window.location.href)
          if (url.hostname === window.location.hostname) {
            links.push(src)
          }
        } catch {
          // Relative path
          if (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) {
            links.push(src)
          }
        }
      }
    })
    
    // Extract from elements with data-toggle or data-target (Bootstrap modals, tabs)
    document.querySelectorAll('[data-toggle][data-target], [data-bs-toggle][data-bs-target]').forEach((el) => {
      const target = el.getAttribute('data-target') || 
                     el.getAttribute('data-bs-target') || 
                     el.getAttribute('href')
      if (target && !target.startsWith('javascript:') && !target.startsWith('#')) {
        links.push(target)
      }
    })
    
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

