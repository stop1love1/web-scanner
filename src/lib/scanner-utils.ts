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
  
  // Extract from anchor tags - check all possible attributes
  $('a').each((_: number, el: cheerio.Element) => {
    // Check href first (most common)
    const href = $(el).attr('href')
    if (href) links.push(href)
    
    // Check other attributes that might contain URLs
    const dataHref = $(el).attr('data-href')
    if (dataHref) links.push(dataHref)
    
    const dataUrl = $(el).attr('data-url')
    if (dataUrl) links.push(dataUrl)
    
    // Check onclick for URLs
    const onclick = $(el).attr('onclick') || ''
    if (onclick) {
      // More comprehensive regex for URLs in onclick
      const urlPatterns = [
        /(?:href|url|link|location|window\.location|window\.open|location\.href)\s*[=:\.]\s*['"]([^'"]+)['"]/gi,
        /['"](https?:\/\/[^'"]+)['"]/gi,
        /['"](\/[^'"]+)['"]/gi,
      ]
      urlPatterns.forEach(pattern => {
        let match
        while ((match = pattern.exec(onclick)) !== null) {
          if (match[1] && !match[1].startsWith('javascript:')) {
            links.push(match[1])
          }
        }
      })
    }
    
    // Check text content for URLs (plain text URLs)
    const text = $(el).text().trim()
    const urlInText = text.match(/https?:\/\/[^\s<>"']+/gi)
    if (urlInText) {
      urlInText.forEach(url => links.push(url))
    }
  })
  
  // Extract from data attributes - comprehensive search
  if (config.linkExtraction.includeDataAttributes) {
    // Find all elements with data attributes that might contain URLs
    $('[data-href], [data-url], [data-link], [data-href-url], [data-action], [data-path], [data-route], [data-navigate]').each((_: number, el: cheerio.Element) => {
      const attrs = el.attribs || {}
      Object.keys(attrs).forEach(attr => {
        if (attr.startsWith('data-') && (attr.includes('href') || attr.includes('url') || attr.includes('link') || attr.includes('action') || attr.includes('path') || attr.includes('route'))) {
          const value = attrs[attr]
          if (value && !value.startsWith('javascript:') && !value.startsWith('#')) {
            links.push(value)
          }
        }
      })
    })
  }
  
  // Extract from form actions
  if (config.linkExtraction.includeForms) {
    $('form[action]').each((_: number, el: cheerio.Element) => {
      const action = $(el).attr('action')
      if (action) links.push(action)
    })
  }
  
  // Extract from onclick handlers - more comprehensive
  if (config.linkExtraction.includeOnClick) {
    $('[onclick]').each((_: number, el: cheerio.Element) => {
      const onclick = $(el).attr('onclick') || ''
      if (onclick) {
        // Multiple patterns to catch different URL formats
        const urlPatterns = [
          /(?:href|url|link|location|window\.location|window\.open|location\.href|document\.location)\s*[=:\.]\s*['"]([^'"]+)['"]/gi,
          /['"](https?:\/\/[^'"]+)['"]/gi,
          /['"](\/[^'"]+)['"]/gi,
          /(?:fetch|axios|ajax|XMLHttpRequest)\(['"]([^'"]+)['"]/gi,
          /\.(get|post|put|delete)\(['"]([^'"]+)['"]/gi,
        ]
        urlPatterns.forEach(pattern => {
          let match
          while ((match = pattern.exec(onclick)) !== null) {
            const url = match[1] || match[2]
            if (url && !url.startsWith('javascript:') && !url.startsWith('void(')) {
              links.push(url)
            }
          }
        })
      }
    })
  }
  
  // Extract from inline JavaScript in script tags
  $('script:not([src])').each((_: number, el: cheerio.Element) => {
    const scriptContent = $(el).html() || ''
    if (scriptContent) {
      // Find URLs in JavaScript code - enhanced patterns
      const urlPatterns = [
        /['"](https?:\/\/[^'"]+)['"]/gi,
        /['"](\/[^'"]+)['"]/gi,
        /(?:fetch|axios|ajax|XMLHttpRequest|\.get|\.post|\.put|\.delete|\.patch)\(['"]([^'"]+)['"]/gi,
        /(?:href|url|link|location|window\.location|window\.open|document\.location)\s*[=:\.]\s*['"]([^'"]+)['"]/gi,
        /router\.(?:push|replace|go|navigate)\(['"]([^'"]+)['"]/gi,
        /navigate\(['"]([^'"]+)['"]/gi,
        /history\.(?:push|replace)\(['"]([^'"]+)['"]/gi,
        // API endpoints
        /(?:api|endpoint|url|baseUrl|baseURL)\s*[:=]\s*['"]([^'"]+)['"]/gi,
        /(?:\.get|\.post|\.put|\.delete|\.patch)\(['"]([^'"]+)['"]/gi,
        // GraphQL endpoints
        /graphql\s*[:=]\s*['"]([^'"]+)['"]/gi,
        // WebSocket connections
        /(?:ws|wss):\/\/[^'"]+/gi,
        // Service worker registration
        /serviceWorker\.register\(['"]([^'"]+)['"]/gi,
        // Import statements
        /import\s+.*from\s+['"]([^'"]+)['"]/gi,
        /require\(['"]([^'"]+)['"]\)/gi,
        // Dynamic imports
        /import\(['"]([^'"]+)['"]\)/gi,
        // JSON data
        /['"]url['"]\s*:\s*['"]([^'"]+)['"]/gi,
        /['"]href['"]\s*:\s*['"]([^'"]+)['"]/gi,
        /['"]path['"]\s*:\s*['"]([^'"]+)['"]/gi,
        /['"]link['"]\s*:\s*['"]([^'"]+)['"]/gi,
      ]
      urlPatterns.forEach(pattern => {
        let match
        while ((match = pattern.exec(scriptContent)) !== null) {
          const url = match[1] || match[2]
          if (url && 
              !url.startsWith('javascript:') && 
              !url.startsWith('void(') && 
              !url.includes('console.') &&
              !url.startsWith('data:') &&
              !url.startsWith('blob:') &&
              !url.startsWith('mailto:') &&
              !url.startsWith('tel:')) {
            links.push(url)
          }
        }
      })
    }
  })
  
  // Extract from inline styles (background-image, etc.)
  $('[style]').each((_: number, el: cheerio.Element) => {
    const style = $(el).attr('style') || ''
    if (style) {
      const urlMatches = style.match(/url\(['"]?([^'")]+)['"]?\)/gi)
      if (urlMatches) {
        urlMatches.forEach(match => {
          const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '')
          if (url && !url.startsWith('data:') && !url.startsWith('javascript:')) {
            links.push(url)
          }
        })
      }
    }
  })
  
  // Extract from CSS in style tags
  $('style').each((_: number, el: cheerio.Element) => {
    const cssContent = $(el).html() || ''
    if (cssContent) {
      const urlMatches = cssContent.match(/url\(['"]?([^'")]+)['"]?\)/gi)
      if (urlMatches) {
        urlMatches.forEach(match => {
          const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '')
          if (url && !url.startsWith('data:') && !url.startsWith('javascript:')) {
            links.push(url)
          }
        })
      }
      // Also check @import
      const importMatches = cssContent.match(/@import\s+['"]([^'"]+)['"]/gi)
      if (importMatches) {
        importMatches.forEach(match => {
          const url = match.replace(/@import\s+['"]/, '').replace(/['"]/, '')
          if (url && !url.startsWith('data:')) {
            links.push(url)
          }
        })
      }
    }
  })
  
  // Extract from img srcset
  $('img[srcset]').each((_: number, el: cheerio.Element) => {
    const srcset = $(el).attr('srcset') || ''
    if (srcset) {
      const urls = srcset.split(',').map(item => item.trim().split(/\s+/)[0])
      urls.forEach(url => {
        if (url && !url.startsWith('data:')) {
          links.push(url)
        }
      })
    }
  })
  
  // Extract from source tags (picture, video, audio)
  $('source[src], source[srcset]').each((_: number, el: cheerio.Element) => {
    const src = $(el).attr('src')
    if (src) links.push(src)
    
    const srcset = $(el).attr('srcset')
    if (srcset) {
      const urls = srcset.split(',').map(item => item.trim().split(/\s+/)[0])
      urls.forEach(url => {
        if (url && !url.startsWith('data:')) {
          links.push(url)
        }
      })
    }
  })
  
  // Extract from video poster
  $('video[poster]').each((_: number, el: cheerio.Element) => {
    const poster = $(el).attr('poster')
    if (poster) links.push(poster)
  })
  
  // Extract from object/embed tags
  $('object[data], embed[src]').each((_: number, el: cheerio.Element) => {
    const data = $(el).attr('data')
    if (data) links.push(data)
    
    const src = $(el).attr('src')
    if (src) links.push(src)
  })
  
  // Extract from JSON-LD and other script types
  $('script[type="application/ld+json"], script[type="application/json"]').each((_: number, el: cheerio.Element) => {
    const jsonContent = $(el).html() || ''
    if (jsonContent) {
      try {
        const json = JSON.parse(jsonContent)
        // Recursively find URLs in JSON
        const findUrlsInObject = (obj: any): void => {
          if (typeof obj === 'string') {
            if (obj.match(/^https?:\/\//) || obj.match(/^\/[^\/]/)) {
              links.push(obj)
            }
          } else if (Array.isArray(obj)) {
            obj.forEach(item => findUrlsInObject(item))
          } else if (obj && typeof obj === 'object') {
            Object.values(obj).forEach(value => findUrlsInObject(value))
          }
        }
        findUrlsInObject(json)
      } catch {
        // Not valid JSON, try regex
        const urlMatches = jsonContent.match(/['"](https?:\/\/[^'"]+)['"]/gi)
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.replace(/['"]/g, '')
            links.push(url)
          })
        }
      }
    }
  })
  
  // Extract URLs from text content (plain text URLs)
  $('body').each((_: number, el: cheerio.Element) => {
    const text = $(el).text()
    const urlMatches = text.match(/https?:\/\/[^\s<>"']+/gi)
    if (urlMatches) {
      urlMatches.forEach(url => {
        if (!url.includes('://localhost') && !url.includes('://127.0.0.1')) {
          links.push(url)
        }
      })
    }
  })
  
  // Extract from HTML comments
  const htmlContent = $.html() || ''
  const commentPattern = /<!--[\s\S]*?-->/g
  const comments = htmlContent.match(commentPattern) || []
  comments.forEach(comment => {
    const urlMatches = comment.match(/https?:\/\/[^\s<>"']+/gi)
    if (urlMatches) {
      urlMatches.forEach(url => {
        if (!url.includes('://localhost') && !url.includes('://127.0.0.1')) {
          links.push(url)
        }
      })
    }
  })
  
  // Extract from meta tags (og:url, twitter:url, etc.)
  $('meta[property="og:url"], meta[name="twitter:url"], meta[property="og:image"], meta[name="twitter:image"]').each((_: number, el: cheerio.Element) => {
    const content = $(el).attr('content')
    if (content) links.push(content)
  })
  
  // Extract from manifest links
  $('link[rel="manifest"]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href')
    if (href) links.push(href)
  })
  
  // Extract from OpenSearch description
  $('link[type="application/opensearchdescription+xml"]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href')
    if (href) links.push(href)
  })
  
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
  
  // Skip iframe src - do not scan links inside iframes
  // $('iframe[src]').each((_: number, el: cheerio.Element) => {
  //   const src = $(el).attr('src')
  //   if (src && !src.startsWith('javascript:') && !src.startsWith('data:')) {
  //     links.push(src)
  //   }
  // })
  
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
      // Scroll page to load lazy content - enhanced scrolling
      await page.evaluate(async () => {
        const scrollHeight = document.documentElement.scrollHeight
        const viewportHeight = window.innerHeight
        const scrollSteps = Math.ceil(scrollHeight / viewportHeight)
        
        // Scroll down slowly to trigger lazy loading
        for (let i = 0; i < scrollSteps; i++) {
          window.scrollTo({
            top: i * viewportHeight,
            behavior: 'smooth'
          })
          await new Promise(resolve => setTimeout(resolve, 300))
        }
        
        // Scroll to middle
        window.scrollTo({
          top: scrollHeight / 2,
          behavior: 'smooth'
        })
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // Scroll back to top
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        })
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // Also try scrolling horizontally (for responsive layouts)
        const scrollWidth = document.documentElement.scrollWidth
        if (scrollWidth > window.innerWidth) {
          window.scrollTo({
            left: scrollWidth / 2,
            behavior: 'smooth'
          })
          await new Promise(resolve => setTimeout(resolve, 200))
          window.scrollTo({
            left: 0,
            behavior: 'smooth'
          })
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      })
      
      // Click on dropdowns, tabs, and collapsible elements - enhanced interaction
      await page.evaluate(async () => {
        // Click on dropdown toggles
        const dropdownToggles = document.querySelectorAll('[data-toggle="dropdown"], [data-bs-toggle="dropdown"], .dropdown-toggle, [aria-haspopup="true"], button[aria-expanded="false"]')
        for (const el of Array.from(dropdownToggles).slice(0, 10)) { // Limit to first 10
          try {
            (el as HTMLElement).click()
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch {}
        }
        
        // Click on tab buttons
        const tabButtons = document.querySelectorAll('[data-toggle="tab"], [data-bs-toggle="tab"], .nav-link[data-toggle], [role="tab"][aria-selected="false"]')
        for (const el of Array.from(tabButtons).slice(0, 10)) {
          try {
            (el as HTMLElement).click()
            await new Promise(resolve => setTimeout(resolve, 150))
          } catch {}
        }
        
        // Click on accordion/collapse toggles
        const collapseToggles = document.querySelectorAll('[data-toggle="collapse"], [data-bs-toggle="collapse"], [aria-expanded="false"]')
        for (const el of Array.from(collapseToggles).slice(0, 10)) {
          try {
            (el as HTMLElement).click()
            await new Promise(resolve => setTimeout(resolve, 150))
          } catch {}
        }
        
        // Click on "Load more" or "Show more" buttons
        const loadMoreButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
          const text = el.textContent?.toLowerCase() || ''
          return text.includes('load more') || text.includes('show more') || text.includes('xem thêm') || text.includes('tải thêm')
        })
        for (const el of loadMoreButtons.slice(0, 5)) {
          try {
            (el as HTMLElement).click()
            await new Promise(resolve => setTimeout(resolve, 200))
          } catch {}
        }
        
        // Hover over elements to reveal tooltips or hidden content
        const hoverableElements = document.querySelectorAll('[data-tooltip], [title], [data-hover], .tooltip-trigger')
        for (const el of Array.from(hoverableElements).slice(0, 5)) {
          try {
            const event = new MouseEvent('mouseenter', { bubbles: true, cancelable: true })
            el.dispatchEvent(event)
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch {}
        }
      })
      
      // Wait for network requests to complete
      try {
        await page.waitForLoadState?.('networkidle') || 
        await new Promise(resolve => setTimeout(resolve, 1500))
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    } catch (error) {
      // Ignore errors from interactions
    }
  }
  
  return await page.evaluate((linkExtractionConfig: typeof config.linkExtraction) => {
    const links: string[] = []
    
    // Extract from anchor tags - comprehensive
    document.querySelectorAll('a').forEach((el) => {
      // Check href first
      const href = el.getAttribute('href')
      if (href) links.push(href)
      
      // Check data attributes
      const dataHref = el.getAttribute('data-href')
      if (dataHref) links.push(dataHref)
      
      const dataUrl = el.getAttribute('data-url')
      if (dataUrl) links.push(dataUrl)
      
      // Check onclick for URLs
      const onclick = el.getAttribute('onclick') || ''
      if (onclick) {
        const urlPatterns = [
          /(?:href|url|link|location|window\.location|window\.open|location\.href)\s*[=:\.]\s*['"]([^'"]+)['"]/gi,
          /['"](https?:\/\/[^'"]+)['"]/gi,
          /['"](\/[^'"]+)['"]/gi,
        ]
        urlPatterns.forEach(pattern => {
          let match
          while ((match = pattern.exec(onclick)) !== null) {
            if (match[1] && !match[1].startsWith('javascript:')) {
              links.push(match[1])
            }
          }
        })
      }
      
      // Check text content for URLs
      const text = el.textContent?.trim() || ''
      const urlInText = text.match(/https?:\/\/[^\s<>"']+/gi)
      if (urlInText) {
        urlInText.forEach(url => links.push(url))
      }
    })
    
    // Extract from data attributes - comprehensive
    if (linkExtractionConfig.includeDataAttributes) {
      document.querySelectorAll('[data-href], [data-url], [data-link], [data-href-url], [data-action], [data-path], [data-route], [data-navigate]').forEach((el) => {
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith('data-') && (attr.name.includes('href') || attr.name.includes('url') || attr.name.includes('link') || attr.name.includes('action') || attr.name.includes('path') || attr.name.includes('route'))) {
            const value = attr.value
            if (value && !value.startsWith('javascript:') && !value.startsWith('#')) {
              links.push(value)
            }
          }
        })
      })
    }
    
    // Extract from form actions
    if (linkExtractionConfig.includeForms) {
      document.querySelectorAll('form[action]').forEach((el) => {
        const action = el.getAttribute('action')
        if (action) links.push(action)
      })
    }
    
    // Extract from onclick handlers - more comprehensive
    if (linkExtractionConfig.includeOnClick) {
      document.querySelectorAll('[onclick]').forEach((el) => {
        const onclick = el.getAttribute('onclick') || ''
        if (onclick) {
          const urlPatterns = [
            /(?:href|url|link|location|window\.location|window\.open|location\.href|document\.location)\s*[=:\.]\s*['"]([^'"]+)['"]/gi,
            /['"](https?:\/\/[^'"]+)['"]/gi,
            /['"](\/[^'"]+)['"]/gi,
            /(?:fetch|axios|ajax|XMLHttpRequest)\(['"]([^'"]+)['"]/gi,
            /\.(get|post|put|delete)\(['"]([^'"]+)['"]/gi,
          ]
          urlPatterns.forEach(pattern => {
            let match
            while ((match = pattern.exec(onclick)) !== null) {
              const url = match[1] || match[2]
              if (url && !url.startsWith('javascript:') && !url.startsWith('void(')) {
                links.push(url)
              }
            }
          })
        }
      })
    }
    
    // Extract from inline JavaScript in script tags
    document.querySelectorAll('script:not([src])').forEach((script) => {
      const scriptContent = script.textContent || ''
      if (scriptContent) {
        const urlPatterns = [
          /['"](https?:\/\/[^'"]+)['"]/gi,
          /['"](\/[^'"]+)['"]/gi,
          /(?:fetch|axios|ajax|XMLHttpRequest|\.get|\.post|\.put|\.delete|\.patch)\(['"]([^'"]+)['"]/gi,
          /(?:href|url|link|location|window\.location|window\.open|document\.location)\s*[=:\.]\s*['"]([^'"]+)['"]/gi,
          /router\.(?:push|replace|go|navigate)\(['"]([^'"]+)['"]/gi,
          /navigate\(['"]([^'"]+)['"]/gi,
          /history\.(?:push|replace)\(['"]([^'"]+)['"]/gi,
          // API endpoints
          /(?:api|endpoint|url|baseUrl|baseURL)\s*[:=]\s*['"]([^'"]+)['"]/gi,
          /(?:\.get|\.post|\.put|\.delete|\.patch)\(['"]([^'"]+)['"]/gi,
          // GraphQL endpoints
          /graphql\s*[:=]\s*['"]([^'"]+)['"]/gi,
          // WebSocket connections
          /(?:ws|wss):\/\/[^'"]+/gi,
          // Service worker registration
          /serviceWorker\.register\(['"]([^'"]+)['"]/gi,
          // Import statements
          /import\s+.*from\s+['"]([^'"]+)['"]/gi,
          /require\(['"]([^'"]+)['"]\)/gi,
          // Dynamic imports
          /import\(['"]([^'"]+)['"]\)/gi,
          // JSON data
          /['"]url['"]\s*:\s*['"]([^'"]+)['"]/gi,
          /['"]href['"]\s*:\s*['"]([^'"]+)['"]/gi,
          /['"]path['"]\s*:\s*['"]([^'"]+)['"]/gi,
          /['"]link['"]\s*:\s*['"]([^'"]+)['"]/gi,
        ]
        urlPatterns.forEach(pattern => {
          let match
          while ((match = pattern.exec(scriptContent)) !== null) {
            const url = match[1] || match[2]
            if (url && 
                !url.startsWith('javascript:') && 
                !url.startsWith('void(') && 
                !url.includes('console.') &&
                !url.startsWith('data:') &&
                !url.startsWith('blob:') &&
                !url.startsWith('mailto:') &&
                !url.startsWith('tel:')) {
              links.push(url)
            }
          }
        })
      }
    })
    
    // Extract from inline styles
    document.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style') || ''
      if (style) {
        const urlMatches = style.match(/url\(['"]?([^'")]+)['"]?\)/gi)
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '')
            if (url && !url.startsWith('data:') && !url.startsWith('javascript:')) {
              links.push(url)
            }
          })
        }
      }
    })
    
    // Extract from CSS in style tags
    document.querySelectorAll('style').forEach((style) => {
      const cssContent = style.textContent || ''
      if (cssContent) {
        const urlMatches = cssContent.match(/url\(['"]?([^'")]+)['"]?\)/gi)
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '')
            if (url && !url.startsWith('data:') && !url.startsWith('javascript:')) {
              links.push(url)
            }
          })
        }
        // Check @import
        const importMatches = cssContent.match(/@import\s+['"]([^'"]+)['"]/gi)
        if (importMatches) {
          importMatches.forEach(match => {
            const url = match.replace(/@import\s+['"]/, '').replace(/['"]/, '')
            if (url && !url.startsWith('data:')) {
              links.push(url)
            }
          })
        }
      }
    })
    
    // Extract from img srcset
    document.querySelectorAll('img[srcset]').forEach((img) => {
      const srcset = img.getAttribute('srcset') || ''
      if (srcset) {
        const urls = srcset.split(',').map(item => item.trim().split(/\s+/)[0])
        urls.forEach(url => {
          if (url && !url.startsWith('data:')) {
            links.push(url)
          }
        })
      }
    })
    
    // Extract from source tags
    document.querySelectorAll('source[src], source[srcset]').forEach((source) => {
      const src = source.getAttribute('src')
      if (src) links.push(src)
      
      const srcset = source.getAttribute('srcset')
      if (srcset) {
        const urls = srcset.split(',').map(item => item.trim().split(/\s+/)[0])
        urls.forEach(url => {
          if (url && !url.startsWith('data:')) {
            links.push(url)
          }
        })
      }
    })
    
    // Extract from video poster
    document.querySelectorAll('video[poster]').forEach((video) => {
      const poster = video.getAttribute('poster')
      if (poster) links.push(poster)
    })
    
    // Extract from object/embed tags
    document.querySelectorAll('object[data], embed[src]').forEach((el) => {
      const data = el.getAttribute('data')
      if (data) links.push(data)
      
      const src = el.getAttribute('src')
      if (src) links.push(src)
    })
    
    // Extract from JSON-LD and other script types
    document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]').forEach((script) => {
      const jsonContent = script.textContent || ''
      if (jsonContent) {
        try {
          const json = JSON.parse(jsonContent)
          const findUrlsInObject = (obj: any): void => {
            if (typeof obj === 'string') {
              if (obj.match(/^https?:\/\//) || obj.match(/^\/[^\/]/)) {
                links.push(obj)
              }
            } else if (Array.isArray(obj)) {
              obj.forEach(item => findUrlsInObject(item))
            } else if (obj && typeof obj === 'object') {
              Object.values(obj).forEach(value => findUrlsInObject(value))
            }
          }
          findUrlsInObject(json)
        } catch {
          const urlMatches = jsonContent.match(/['"](https?:\/\/[^'"]+)['"]/gi)
          if (urlMatches) {
            urlMatches.forEach(match => {
              const url = match.replace(/['"]/g, '')
              links.push(url)
            })
          }
        }
      }
    })
    
    // Extract URLs from text content (plain text URLs)
    const bodyText = document.body?.textContent || ''
    const urlMatches = bodyText.match(/https?:\/\/[^\s<>"']+/gi)
    if (urlMatches) {
      urlMatches.forEach(url => {
        if (!url.includes('://localhost') && !url.includes('://127.0.0.1')) {
          links.push(url)
        }
      })
    }
    
    // Extract from HTML comments
    const walker = document.createTreeWalker(
      document,
      NodeFilter.SHOW_COMMENT,
      null
    )
    let node
    while ((node = walker.nextNode())) {
      const commentText = node.textContent || ''
      const commentUrlMatches = commentText.match(/https?:\/\/[^\s<>"']+/gi)
      if (commentUrlMatches) {
        commentUrlMatches.forEach(url => {
          if (!url.includes('://localhost') && !url.includes('://127.0.0.1')) {
            links.push(url)
          }
        })
      }
    }
    
    // Extract from meta tags (og:url, twitter:url, etc.)
    document.querySelectorAll('meta[property="og:url"], meta[name="twitter:url"], meta[property="og:image"], meta[name="twitter:image"]').forEach((meta) => {
      const content = meta.getAttribute('content')
      if (content) links.push(content)
    })
    
    // Extract from manifest links
    document.querySelectorAll('link[rel="manifest"]').forEach((link) => {
      const href = link.getAttribute('href')
      if (href) links.push(href)
    })
    
    // Extract from OpenSearch description
    document.querySelectorAll('link[type="application/opensearchdescription+xml"]').forEach((link) => {
      const href = link.getAttribute('href')
      if (href) links.push(href)
    })
    
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
    
    // Skip iframe src - do not scan links inside iframes
    // document.querySelectorAll('iframe[src]').forEach((el) => {
    //   const src = el.getAttribute('src')
    //   if (src && !src.startsWith('javascript:') && !src.startsWith('data:')) {
    //     links.push(src)
    //   }
    // })
    
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

