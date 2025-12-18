import * as XLSX from 'xlsx'
import type { ScanResult } from '@/components/scanner/types'

interface ExcelRow {
  'No.': number
  'Page Name': string
  URL: string
  'Status': string
  'Status Code': string
  'Links Count': number
  'Depth': number
  'Time': string
  'Notes': string
  'Response Body': string
}

export function exportToExcel(
  results: ScanResult[], 
  baseUrl: string,
  statusFilter?: 'all' | 'success' | 'error' | '2xx' | '4xx' | '5xx'
) {
  // Filter results by status if filter is provided
  let filteredResults = results
  if (statusFilter && statusFilter !== 'all') {
    filteredResults = results.filter((result) => {
      if (statusFilter === 'success') {
        return result.status === 'success'
      } else if (statusFilter === 'error') {
        return result.status === 'error'
      } else if (statusFilter === '2xx') {
        return result.statusCode && result.statusCode >= 200 && result.statusCode < 300
      } else if (statusFilter === '4xx') {
        return result.statusCode && result.statusCode >= 400 && result.statusCode < 500
      } else if (statusFilter === '5xx') {
        return result.statusCode && result.statusCode >= 500 && result.statusCode < 600
      }
      return true
    })
  }
  
  // Collect all unique URLs with their details
  const urlMap = new Map<string, ScanResult>()
  
  filteredResults.forEach((result) => {
    // Add the main URL
    if (!urlMap.has(result.url)) {
      urlMap.set(result.url, result)
    }
    
    // Add all links found on this page (only if they match filter)
    result.links?.forEach((link) => {
      if (!urlMap.has(link)) {
        // Create a result entry for links that weren't directly scanned
        urlMap.set(link, {
          url: link,
          status: 'success',
          links: [],
          timestamp: result.timestamp,
        })
      }
    })
  })
  
  // Convert to Excel rows
  const excelData: ExcelRow[] = []
  let stt = 1
  
  // Sort URLs
  const sortedUrls = Array.from(urlMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  
  sortedUrls.forEach(([url, result]) => {
    // Extract page name from URL
    const urlObj = new URL(url)
    let pageName = urlObj.pathname
    if (pageName === '/' || pageName === '') {
      pageName = 'Home'
    } else {
      // Remove leading slash and get last segment
      const segments = pageName.split('/').filter(Boolean)
      pageName = segments[segments.length - 1] || 'Trang chủ'
      // Decode URL and clean up
      try {
        pageName = decodeURIComponent(pageName)
      } catch {
        // Keep original if decode fails
      }
      // Remove file extensions
      pageName = pageName.replace(/\.[^/.]+$/, '')
      // Replace hyphens/underscores with spaces and capitalize
      pageName = pageName.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    }
    
    const statusText = result.status === 'success' ? 'Success' : 'Error'
    const statusCode = result.statusCode ? result.statusCode.toString() : '-'
    const linkCount = result.links?.length || 0
    const depth = result.depth !== undefined ? result.depth : '-'
    const timestamp = result.timestamp 
      ? new Date(result.timestamp).toLocaleString('en-US')
      : '-'
    const note = result.error || (result.status === 'success' ? 'OK' : '')
    const responseBody = result.responseBody ? result.responseBody.substring(0, 500) : '' // Truncate for Excel
    
    excelData.push({
      'No.': stt++,
      'Page Name': pageName,
      URL: url,
      'Status': statusText,
      'Status Code': statusCode,
      'Links Count': linkCount,
      'Depth': Number(depth),
      'Time': timestamp,
      'Notes': note,
      'Response Body': responseBody,
    })
  })
  
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(excelData)
  
  // Set column widths
  const colWidths = [
    { wch: 6 },   // No.
    { wch: 30 },  // Page Name
    { wch: 50 },  // URL
    { wch: 12 },  // Status
    { wch: 12 },  // Status Code
    { wch: 10 },  // Links Count
    { wch: 8 },   // Depth
    { wch: 20 },  // Time
    { wch: 40 },  // Notes
    { wch: 60 },  // Response Body
  ]
  ws['!cols'] = colWidths
  
  // Add summary sheet
  const summaryData = [
    ['WEBSITE SCAN REPORT'],
    [''],
    ['Scan Information:'],
    ['Base URL', baseUrl],
    ['Total URLs', urlMap.size],
    ['Success', results.filter(r => r.status === 'success').length],
    ['Errors', results.filter(r => r.status === 'error').length],
    ['Scan Time', new Date().toLocaleString('en-US')],
    [''],
    ['Detailed Results:'],
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  summaryWs['!cols'] = [{ wch: 20 }, { wch: 50 }]

  // Add worksheets to workbook
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')
  XLSX.utils.book_append_sheet(wb, ws, 'Details')

  // Generate filename with filter suffix if applicable
  const filterSuffix = statusFilter && statusFilter !== 'all' ? `-${statusFilter}` : ''
  const filename = `website-scan-report${filterSuffix}-${new Date().toISOString().split('T')[0]}.xlsx`
  
  // Write file
  XLSX.writeFile(wb, filename)
}

