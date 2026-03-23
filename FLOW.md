# Web URL Scanner - Flow Documentation

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React 19)                         │
│                                                                  │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │ ScannerForm  │  │ScannerLogs  │  │   ScannerResults       │  │
│  │ (user input) │  │(real-time)  │  │ ┌──────┐ ┌───────────┐│  │
│  └──────┬───────┘  └──────▲──────┘  │ │Table │ │Security   ││  │
│         │                 │         │ │      │ │Report     ││  │
│         │                 │         │ └──────┘ └───────────┘│  │
│         │                 │         └────────────▲───────────┘  │
│         │                 │                      │              │
│  ┌──────▼─────────────────┴──────────────────────┴──────────┐   │
│  │              ScannerPage (routes/index.tsx)               │   │
│  │  State: url, credentials, results[], logs[], scanId      │   │
│  │  Polling: getScanLogs + getScanResults every 500ms        │   │
│  └──────────────────────────┬────────────────────────────────┘   │
└─────────────────────────────┼────────────────────────────────────┘
                              │ createServerFn (RPC)
┌─────────────────────────────▼────────────────────────────────────┐
│                       SERVER (Nitro)                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  scanWebsite() handler                     │  │
│  │                                                            │  │
│  │  ┌─────────┐  ┌───────────┐  ┌─────────────────────────┐  │  │
│  │  │  Login  │→ │ Discovery │→ │   Parallel Scan Loop    │  │  │
│  │  │  Phase  │  │   Phase   │  │  (BFS queue + workers)  │  │  │
│  │  └─────────┘  └───────────┘  └─────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Global Stores:                                                  │
│  ├── scanLogsStore    Map<scanId, ScanLog[]>                     │
│  ├── scanResultsStore Map<scanId, ScanResult[]>                  │
│  └── scanControlStore Map<scanId, {isPaused, isStopped}>         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Complete Scan Flow

### Phase 0: User Input → Trigger Scan

```
User fills ScannerForm
    │
    ▼
ScannerPage.handleScan()
    │
    ├── Validate URL (non-empty)
    ├── Parse custom headers (JSON validation)
    ├── Generate client-side scanId = "scan-{timestamp}-{random}"
    ├── Set state: isScanning=true, results=[], logs=[]
    ├── Set currentScanId → triggers useEffect polling
    │
    ▼
Call scanWebsite() server function with ScanConfig:
{url, loginUrl, username, password, usernameField, passwordField,
 timeout, maxConcurrentRequests, customHeaders, pathRegexFilter, scanId}
```

### Phase 1: Initialization (scanner-server.ts)

```
scanWebsite() handler receives ScanConfig
    │
    ├── Load config from getConfig()
    ├── Set defaults: REQUEST_TIMEOUT, MAX_DEPTH(10), MAX_PAGES(500), MAX_CONCURRENT(5)
    ├── Parse customHeaders
    │
    ├── Initialize data structures:
    │   ├── results: ScanResult[] = []
    │   ├── visited: Set<string> = new Set()        ← tracks scanned URLs
    │   ├── queuedUrls: Set<string> = new Set()     ← tracks queued URLs (dedup)
    │   ├── queue: Array<{url, depth}> = []          ← BFS queue
    │   └── enqueue(url, depth) helper               ← atomic add with dedup
    │
    ├── Initialize stores:
    │   ├── scanLogsStore.set(scanId, [])
    │   ├── scanResultsStore.set(scanId, [])
    │   └── initializeScanControl(scanId)
    │
    ├── Setup metrics:
    │   ├── scanStartTime = Date.now()
    │   ├── responseTimes: number[] = []
    │   ├── totalErrors = 0
    │   ├── totalLinksFound = 0
    │   └── errorSummary = {total, byType, bySeverity, byStatusCode, recentErrors}
    │
    ├── Define helper functions:
    │   ├── classifyError(error, statusCode) → {type, severity, message, retryable, suggestedAction}
    │   ├── recordError(url, error, statusCode) → updates errorSummary
    │   ├── log(type, message, details, url, responseTime) → writes to logs[] + scanLogsStore
    │   ├── updateResultsStore() → copies results to scanResultsStore
    │   ├── waitIfPaused() → checks scanControl, waits if paused
    │   └── fetchWithTimeout(url, options, timeoutMs) → fetch with AbortController
    │
    ▼
    [Phase 2: Login]
```

### Phase 2: Login (Optional)

```
IF loginUrl && username && password:
    │
    ├── TRY Puppeteer Login (if usePuppeteer enabled):
    │   ├── Launch browser (headless, sandbox disabled)
    │   ├── Navigate to loginUrl
    │   ├── Auto-detect form fields:
    │   │   ├── Username: input[type=text|email][name*=user|login]
    │   │   └── Password: input[type=password]
    │   ├── Type credentials with 50ms delay
    │   ├── Submit form (button[type=submit] or Enter key)
    │   ├── Wait for navigation
    │   ├── Extract cookies → sessionCookies
    │   ├── Verify: check if still on login page
    │   └── ON ERROR: fallback usePuppeteer = false
    │
    ├── FALLBACK Fetch/Cheerio Login:
    │   ├── GET loginUrl → extract HTML
    │   ├── Parse cookies from response
    │   ├── Extract CSRF token:
    │   │   ├── input[name="_token"] (Laravel)
    │   │   ├── input[name="csrf_token"]
    │   │   ├── input[name="authenticity_token"] (Rails)
    │   │   ├── meta[name="csrf-token"]
    │   │   └── XSRF-TOKEN cookie (Laravel)
    │   ├── Auto-detect form fields (same as Puppeteer)
    │   ├── Build form data + CSRF tokens
    │   ├── POST to form action
    │   ├── Handle redirect (3xx → extract Location header)
    │   ├── Merge cookies from response
    │   │
    │   ├── IF 419 (CSRF mismatch):
    │   │   ├── Re-fetch login page
    │   │   ├── Extract fresh CSRF token
    │   │   └── Retry POST with new token
    │   │
    │   └── Build sessionCookies string
    │
    ├── Determine startUrl:
    │   ├── IF redirect after login → use redirectUrl
    │   ├── ELSE verify login by fetching original URL
    │   │   ├── Check if response still shows login page
    │   │   └── Fallback to original URL if login failed
    │   └── Log result
    │
    ▼
    [Phase 3: Discovery]
```

### Phase 3: URL Discovery

```
BEFORE scanning starts, discover URLs from:
    │
    ├── 1. Sitemap Discovery:
    │   ├── Try common paths: /sitemap.xml, /sitemap_index.xml,
    │   │   /sitemap1.xml, /sitemap-index.xml, /sitemaps.xml
    │   ├── Parse XML → extract <url><loc> entries
    │   ├── Handle sitemap index → recursive nested sitemaps
    │   └── Filter: same domain only
    │
    ├── 2. Robots.txt Discovery:
    │   ├── Fetch /robots.txt
    │   ├── Extract Sitemap: directives → fetch those sitemaps
    │   ├── Extract Disallow: paths → convert to URLs
    │   └── Filter: same domain, non-static
    │
    ├── 3. Merge & Deduplicate:
    │   ├── Combine sitemap + robots URLs
    │   ├── Apply pathRegexFilter
    │   └── enqueue(url, depth=0) for each unique URL
    │
    ├── 4. Add start URL:
    │   └── enqueue(startUrl, depth=0)
    │
    ▼
    [Phase 4: Parallel Scan]
```

### Phase 4: Parallel Scan Loop (Core Algorithm)

```
runParallelScan():
    │
    ▼
    WHILE (queue.length > 0 || activePromises.length > 0)
      AND (results.length < MAX_PAGES):
    │
    ├── await waitIfPaused()              ← check pause/stop
    │
    ├── CHECK stuck detection:
    │   └── IF no progress for 10 iterations → log warning
    │
    ├── FILL worker slots:
    │   WHILE activePromises.length < MAX_CONCURRENT
    │     AND queue.length > 0
    │     AND results.length < MAX_PAGES:
    │   │
    │   ├── queueItem = queue.shift()
    │   ├── Create async worker → scanSingleUrl(url, depth)
    │   ├── Wrap in safe promise (catch errors)
    │   ├── Auto-remove from activePromises on completion
    │   └── Push to activePromises[]
    │
    ├── WAIT for slot:
    │   ├── IF at max concurrency → await Promise.race(activePromises)
    │   ├── ELIF some active → await Promise.race([...active, timeout(2s)])
    │   └── ELIF queue empty & no active → break (done!)
    │
    └── [loop continues]
    │
    ▼
    await Promise.allSettled(activePromises)  ← wait for stragglers
```

### Phase 4a: scanSingleUrl(url, depth)

```
scanSingleUrl(currentUrl, depth):
    │
    ├── Guard checks:
    │   ├── IF depth > MAX_DEPTH → return (skip)
    │   ├── IF visited.has(url) → return (already done)
    │   └── visited.add(url)    ← ATOMIC: mark before any async work
    │
    ├── BRANCH A: Puppeteer (if enabled & browser exists)
    │   │
    │   ├── Create new page (for parallel capability)
    │   ├── Set custom headers
    │   ├── Setup response listener → capture final status code
    │   ├── page.goto(url, {waitUntil: 'networkidle2', timeout})
    │   │   └── ON timeout: try page.content() for partial load
    │   ├── Get statusCode from response (handle redirects)
    │   ├── Check JSON response → extractUrlsFromJson()
    │   ├── Wait for dynamic content (1500ms + networkidle)
    │   ├── Get html = page.content()
    │   ├── detectStatusFromContent(html) → correct 200→404/403/500/401
    │   ├── extractLinksFromPage(page) → interactive link extraction
    │   ├── processExtractedLinks() → normalize, filter, dedup
    │   ├── enqueue() new links
    │   ├── buildScanResult() → push to results[]
    │   ├── updateResultsStore()
    │   └── page.close()
    │
    ├── BRANCH B: Fetch/Cheerio (fallback)
    │   │
    │   ├── fetch(url) with timeout, cookies, custom headers
    │   ├── Handle redirect Location header → enqueue()
    │   ├── Check JSON response → extractUrlsFromJson()
    │   ├── Get html = response.text()
    │   ├── detectStatusFromContent(html) → correct 200→404/403/500/401
    │   ├── extractLinksFromHtml(html, url) → Cheerio link extraction
    │   ├── processExtractedLinks() → normalize, filter, dedup
    │   ├── enqueue() new links
    │   ├── buildScanResult() → push to results[]
    │   └── updateResultsStore()
    │
    └── ON ERROR:
        ├── classifyError() → {type, severity, retryable, suggestedAction}
        ├── recordError() → update errorSummary
        ├── Infer statusCode from error type (timeout→408, network→503)
        ├── Log with severity level
        ├── Push error result to results[]
        └── updateResultsStore()
```

### Phase 4b: Link Extraction Pipeline

```
extractLinksFromHtml(html, currentUrl):           extractLinksFromPage(page):
    │                                                  │
    ├── <a href> (primary)                             ├── Scroll page (lazy load)
    ├── <a data-href>, <a data-url>                    ├── Click dropdowns (max 10)
    ├── <a onclick> → regex URL extraction             ├── Click tabs (max 10)
    ├── [data-href], [data-url], [data-link]...        ├── Click accordions (max 10)
    ├── <form action>                                  ├── Click "Load more" (max 5)
    ├── [onclick] handlers → regex                     ├── Hover tooltips (max 5)
    ├── Inline <script> → navigation patterns          ├── Wait for networkidle
    ├── <meta og:url>                                  │
    ├── <meta http-equiv=refresh>                      └── page.evaluate():
    ├── <link rel=canonical>                               ├── document.querySelectorAll('a')
    ├── <button data-href>                                 ├── data attributes
    ├── [role=button/link] data attrs                      ├── onclick handlers
    ├── <area href>                                        ├── form actions
    ├── <base href>                                        └── meta tags
    ├── [data-toggle] targets
    │
    └── return [...new Set(links)]   ← dedup

                    │
                    ▼
        processExtractedLinks(links, currentUrl, domainUrl, visited, regex, queuedUrls):
            │
            ├── FOR each link:
            │   ├── normalizeUrl(href, currentUrl) → resolve relative, strip hash/query
            │   ├── isSameDomain(normalized, domainUrl) → must match hostname
            │   ├── Skip if: visited.has() || queuedUrls.has() || seen.has()
            │   ├── isStaticFile(normalized) → skip JS/CSS/images/fonts/media/docs/archives
            │   ├── shouldIncludeUrl(normalized, pathRegex) → apply user filter
            │   └── Add to newLinks[] + normalizedLinks[]
            │
            └── Return {newLinks, normalizedLinks, filteredCount}
```

### Phase 5: Real-time Client Polling

```
useEffect([currentScanId]):
    │
    ├── IF no scanId → return
    │
    ├── setInterval(500ms):
    │   │
    │   ├── Promise.all([getScanLogs(), getScanResults()])
    │   │
    │   ├── Update logs:
    │   │   └── setLogs([...newLogs])
    │   │
    │   └── Update results (smart diff):
    │       ├── Compare URL sets (new vs existing)
    │       ├── Check timestamps/status changes
    │       └── setResults([...newResults]) only if changed
    │
    ├── Immediate fetch on mount
    │
    └── Cleanup: clearInterval on unmount/scanId change

ScannerProgress updates:
    ├── Extracts from latest log entry:
    │   ├── progress.current / progress.total
    │   ├── progress.percentage → progress bar
    │   └── url → "Currently scanning: ..."
    └── Shows animated spinner during scan
```

### Phase 6: Scan Completion

```
scanWebsite() completes:
    │
    ├── Close Puppeteer browser
    │
    ├── Schedule cleanup:
    │   └── setTimeout(5min) → delete logs/results/control stores
    │
    ├── Log final summary:
    │   └── "Scan completed: {total URLs}, {links}, {errors}, {time}"
    │
    ├── Return to client:
    │   └── {results, logs, scanId, errorSummary}
    │
    ▼
Client receives response:
    ├── setResults(response.results)
    ├── setLogs(response.logs)
    ├── setIsScanning(false)
    ├── setScanProgress(null)
    │
    ├── setTimeout(2s): fetch final logs
    │   └── Ensures all streaming logs are captured
    │
    └── User can now:
        ├── Browse results table (filter, search, paginate, sort)
        ├── View Security Report (vulnerabilities by severity)
        ├── Export to Excel (with filters)
        └── Start a new scan
```

### User Control Flow (Pause/Resume/Stop)

```
handlePause():                  handleResume():                 handleStop():
    │                               │                               │
    ▼                               ▼                               ▼
pauseScan({scanId})             resumeScan({scanId})            stopScan({scanId})
    │                               │                               │
    ▼                               ▼                               ▼
setScanPaused(id, true)         setScanPaused(id, false)        setScanStopped(id, true)
    │                               │                               │
    ▼                               ▼                               ▼
scanSingleUrl loop:             scanSingleUrl loop:             scanSingleUrl loop:
  waitIfPaused() →                waitIfPaused() →                waitIfPaused() →
  BLOCKS (polls 100ms)            CONTINUES                       throws "Scan stopped"
```

---

## Data Type Flow

```
ScanConfig (user input)
    │
    ▼
scanWebsite() processes → produces:
    │
    ├── ScanResult[] (per URL):
    │   {url, status, statusCode, error, errorType, errorSeverity,
    │    errorDetails{code, message, retryable, suggestedAction},
    │    responseBody, links[], timestamp, depth}
    │
    ├── ScanLog[] (real-time):
    │   {type, message, timestamp, url, details,
    │    errorSeverity, errorCategory,
    │    progress{current, total, percentage},
    │    statistics{urlsScanned, linksFound, errors, queueSize, visitedCount},
    │    performance{responseTime, elapsedTime, averageResponseTime}}
    │
    └── ErrorSummary:
        {total, byType{timeout,network,server,client,unknown},
         bySeverity{critical,high,medium,low},
         byStatusCode{}, recentErrors[]}

ScanResult[] → SecurityReport:
    │
    ▼
scanAllResults(results) → SecurityVulnerability[]:
    {id, type, severity, title, description, url,
     evidence, recommendation, statusCode, timestamp}

ScanResult[] → Excel Export:
    │
    ▼
exportToExcel(results, baseUrl, statusFilter) → .xlsx file
    Sheet 1: Summary (stats)
    Sheet 2: Details (URL table)
```

---

## Deduplication Strategy (3 Layers)

```
Layer 1: queuedUrls Set
    └── Prevents same URL from entering queue multiple times
        (URL found on 10 pages → queued only once)

Layer 2: visited Set
    └── Prevents re-scanning (atomic check-and-add)
        (Handles race conditions in parallel scanning)

Layer 3: Batch dedup in processExtractedLinks()
    └── Prevents duplicates within a single page's extracted links
        (Same link appears in <a href> and <meta og:url> → counted once)

Flow:
    extractLinks() → processExtractedLinks(visited, queuedUrls)
                          │
                          ├── Skip if visited.has(url)     ← Layer 2
                          ├── Skip if queuedUrls.has(url)  ← Layer 1
                          ├── Skip if seen.has(url)        ← Layer 3
                          └── Add to newLinks[]
                                  │
                                  ▼
                          enqueue(url, depth)
                              │
                              ├── Skip if visited.has(url)     ← Layer 2
                              ├── Skip if queuedUrls.has(url)  ← Layer 1
                              ├── Skip if isStaticFile(url)
                              ├── queuedUrls.add(url)
                              └── queue.push({url, depth})
```

---

## File Dependency Graph

```
scanner-config.ts ◄─── (no dependencies)
         │
         ▼
scanner-utils.ts ◄─── scanner-config.ts
         │
         ▼
url-analyzer.ts ◄─── (no dependencies)
         │
         ▼
scanner-helpers.ts ◄─── scanner-config.ts, scanner-utils.ts, url-analyzer.ts, types.ts
         │
         ▼
scanner-control.ts ◄─── (no dependencies)
         │
         ▼
scanner-server.ts ◄─── ALL above + cheerio + puppeteer
         │
         ▼
security-scanner.ts ◄─── types.ts
         │
         ▼
export-excel.ts ◄─── types.ts + xlsx

Components:
  types.ts ◄─── (no dependencies)
  ScannerForm.tsx ◄─── types.ts, lucide-react
  ScannerLogs.tsx ◄─── types.ts, lucide-react
  ScannerProgress.tsx ◄─── lucide-react
  ScannerResults.tsx ◄─── types.ts, export-excel.ts, SecurityReport.tsx, url-analyzer.ts
  SecurityReport.tsx ◄─── types.ts, security-scanner.ts
  Toast.tsx ◄─── lucide-react

Page:
  index.tsx ◄─── ALL components + scanner-server.ts
```
