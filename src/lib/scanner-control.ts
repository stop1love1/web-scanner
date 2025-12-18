/**
 * Scanner Control Store
 * Manages pause/resume state for active scans
 */

// Global store for scan control state (in-memory)
const scanControlStore = new Map<string, {
  isPaused: boolean
  isStopped: boolean
}>()

export function getScanControl(scanId: string) {
  return scanControlStore.get(scanId) || { isPaused: false, isStopped: false }
}

export function setScanPaused(scanId: string, isPaused: boolean) {
  const control = scanControlStore.get(scanId) || { isPaused: false, isStopped: false }
  control.isPaused = isPaused
  scanControlStore.set(scanId, control)
}

export function setScanStopped(scanId: string, isStopped: boolean) {
  const control = scanControlStore.get(scanId) || { isPaused: false, isStopped: false }
  control.isStopped = isStopped
  scanControlStore.set(scanId, control)
}

export function initializeScanControl(scanId: string) {
  scanControlStore.set(scanId, { isPaused: false, isStopped: false })
}

export function cleanupScanControl(scanId: string) {
  scanControlStore.delete(scanId)
}

