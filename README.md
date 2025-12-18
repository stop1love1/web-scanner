# Web URL Scanner

A powerful, feature-rich web scanner built with TanStack Start (React) that can automatically scan all URLs of a website, including JavaScript-rendered content. Supports automatic login, parallel scanning, real-time progress tracking, and comprehensive reporting.

**Author:** [stop1love1](https://github.com/stop1love1/web-scanner)

## 🌟 Features

### Core Functionality
- **Complete Website Scanning**: Automatically discovers and scans all URLs within a website
- **JavaScript Support**: Uses Puppeteer to handle JavaScript-rendered content
- **Automatic Login**: Supports automatic authentication with configurable login forms
- **Parallel Scanning**: Configurable concurrent requests for faster scanning (1-20 parallel requests)
- **Real-time Progress**: Live streaming of logs and results to the UI
- **Comprehensive Link Extraction**: Extracts links from:
  - Anchor tags (`<a href>`)
  - Data attributes (`data-href`, `data-url`, etc.)
  - Form actions
  - JavaScript onclick handlers
  - Meta refresh tags
  - Canonical links

### Advanced Features
- **Pause/Resume/Stop**: Control scan execution in real-time
- **Custom Headers**: Configure custom HTTP headers via JSON
- **Status Code Tracking**: Detailed HTTP status code reporting (200, 201, 400, 401, 500, etc.)
- **Error Response Capture**: Captures response bodies for error pages (400, 500, etc.)
- **Excel Export**: Generate comprehensive Excel reports with filtering options
- **Pagination**: Paginated results table for better performance
- **Search & Filter**: Filter results by status code, search URLs, errors, and response bodies
- **Real-time Logs**: Detailed, categorized logs with progress, statistics, and performance metrics

### UI/UX
- **Modern Dark Theme**: Beautiful, modern UI with dark theme
- **Responsive Design**: Works on all screen sizes
- **Real-time Updates**: Live progress tracking with auto-scrolling logs
- **Toast Notifications**: Custom notification system for user feedback
- **Compact Log Display**: Optimized log view to show maximum information
- **Interactive Results Table**: Expandable rows, status badges, and detailed error information

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/stop1love1/web-scanner.git
cd web-scanner

# Install dependencies
pnpm install

# Install Puppeteer browser (required for JavaScript rendering)
npx puppeteer browsers install chrome
```

### Development

```bash
# Start development server
pnpm dev

# The app will be available at http://localhost:3000
```

### Building for Production

```bash
# Build the application
pnpm build

# Preview the production build
pnpm preview
```

## 📖 Usage

### Basic Scanning

1. Enter the website URL you want to scan
2. Click "Start Scan"
3. Monitor progress in real-time through logs and results table

### Automatic Login

1. Enable "Show login information"
2. Enter:
   - **Login URL**: The URL of the login page
   - **Username**: Your username
   - **Password**: Your password
3. Optionally configure:
   - **Username Field Name**: Auto-detected if not provided
   - **Password Field Name**: Auto-detected if not provided
4. The scanner will automatically log in before scanning

### Advanced Configuration

Click "Show advanced" to access:

- **Username/Password Field Names**: Override auto-detection
- **Custom Headers (JSON)**: Add custom HTTP headers
  ```json
  {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  }
  ```

### Configuration Options

- **Timeout (ms)**: Request timeout (5000-120000ms, default: 30000ms)
- **Parallel**: Number of concurrent requests (1-20, recommended: 3-10, default: 5)

### Scan Control

- **Pause**: Temporarily pause the scan
- **Resume**: Continue a paused scan
- **Stop**: Stop the scan completely

### Results Management

- **Filter**: Filter by status (All, Success, Error, 2xx, 4xx, 5xx) or specific status code
- **Search**: Search URLs, error messages, and response bodies
- **Export Excel**: Export results to Excel with options:
  - Export All
  - Export Success only
  - Export Errors only
- **Copy URLs**: Copy table data in TSV format for Excel paste
- **Pagination**: Navigate through results (50 per page by default)

## 📊 Features in Detail

### Real-time Logging

The scanner provides detailed, real-time logs including:
- **Progress**: Current/total URLs, percentage complete
- **Statistics**: URLs scanned, links found, errors, queue size, visited count
- **Performance**: Response time, elapsed time, average response time
- **Categorization**: Info, Success, Warning, Error logs with color coding

### Excel Export

Excel reports include:
- **Summary Sheet**: Scan information, statistics, filter applied
- **Details Sheet**: Complete results with columns:
  - No. (Serial number)
  - Page Name
  - URL
  - Status
  - Status Code
  - Links Count
  - Depth
  - Time
  - Notes
  - Response Body (for errors)

### Status Code Tracking

- **2xx**: Success responses (green)
- **4xx**: Client errors (yellow)
- **5xx**: Server errors (red)
- **Other**: Other status codes (blue)

### Error Handling

- Captures HTTP status codes for all requests
- Stores response bodies for error pages (400, 500, etc.)
- Detailed error messages in logs
- Error summary in statistics

## 🛠️ Technology Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React SSR)
- **Routing**: TanStack Router
- **Styling**: Tailwind CSS
- **Browser Automation**: Puppeteer
- **HTML Parsing**: Cheerio
- **Excel Export**: xlsx
- **Icons**: Lucide React
- **Linting/Formatting**: Biome

## 📁 Project Structure

```
src/
├── components/
│   └── scanner/
│       ├── ScannerForm.tsx      # Input form and scan controls
│       ├── ScannerLogs.tsx      # Real-time log display
│       ├── ScannerProgress.tsx  # Progress indicator
│       ├── ScannerResults.tsx   # Results table and export
│       ├── Toast.tsx            # Toast notification component
│       └── types.ts            # TypeScript interfaces
├── lib/
│   ├── scanner-config.ts        # Centralized configuration
│   ├── scanner-control.ts       # Pause/resume/stop control
│   ├── scanner-server.ts        # Core scanning logic
│   ├── scanner-utils.ts         # Utility functions
│   └── export-excel.ts          # Excel export functionality
└── routes/
    ├── __root.tsx              # Root layout
    └── index.tsx               # Main scanner page
```

## ⚙️ Configuration

All scanner settings are centralized in `src/lib/scanner-config.ts`:

- **Scanning Limits**: Max depth, max pages
- **Parallel Scanning**: Max concurrent requests
- **Timeouts**: Default, min, max timeout values
- **Puppeteer**: Browser settings, viewport, user agent
- **Polling**: Log polling interval
- **Logging**: Log display options, retention
- **UI**: Auto-scroll, default views, pagination
- **Link Extraction**: What to extract and exclude
- **Excel Export**: Report settings

## 🔧 Development

### Scripts

```bash
# Development
pnpm dev              # Start dev server

# Building
pnpm build            # Build for production
pnpm preview          # Preview production build

# Testing
pnpm test             # Run tests

# Code Quality
pnpm lint             # Lint code
pnpm format           # Format code
pnpm check            # Check code (lint + format)
```

### Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Configuration is in `biome.json`.

## 🐛 Troubleshooting

### Puppeteer Issues

If Puppeteer fails to launch:
- Ensure Chrome is installed: `npx puppeteer browsers install chrome`
- The scanner will automatically fall back to fetch/cheerio method

### Login Issues

- Verify login URL is correct
- Check username/password field names (use advanced settings if auto-detection fails)
- Ensure CSRF tokens are being handled (automatic for Laravel applications)
- Check custom headers if authentication requires specific headers

### Performance

- Adjust "Parallel" setting based on server capacity (3-10 recommended)
- Increase timeout for slow servers
- Monitor logs for timeout errors

## 📝 License

This project is private.

## 👤 Author

**stop1love1**

- GitHub: [@stop1love1](https://github.com/stop1love1)
- Repository: [web-scanner](https://github.com/stop1love1/web-scanner)

## 🙏 Acknowledgments

Built with:
- [TanStack Start](https://tanstack.com/start)
- [Puppeteer](https://pptr.dev/)
- [Cheerio](https://cheerio.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Note**: This scanner is designed for authorized testing and analysis of websites you own or have permission to scan. Always respect robots.txt and terms of service.
