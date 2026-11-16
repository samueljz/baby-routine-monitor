import { formatDateKey, type RoutineEntry } from '../utils/baby'
import { syncData } from './driveSync'

export interface BackupPayload {
  version: number
  exportedAt: string
  data: Record<string, unknown>
}

function getEntryDedupeKey(entry: Partial<RoutineEntry>): string {
  if (entry.id) return String(entry.id)
  return `${entry.timestamp ?? 0}_${entry.type ?? 'unknown'}`
}

/**
 * Gathers all `brm_logs_*` and `brm_theme` keys from `localStorage` into a
 * structured JSON backup file and triggers a browser download.
 */
export function exportBackupJson(): void {
  const data: Record<string, unknown> = {}

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (key.startsWith('brm_logs_') || key === 'brm_theme' || key === 'brm_feed_interval_mins') {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      try {
        data[key] = JSON.parse(raw)
      } catch {
        data[key] = raw
      }
    }
  }

  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `baby-routine-backup-${formatDateKey(new Date())}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Reads and validates a JSON backup file and imports it into `localStorage`
 * using either `'merge'` or `'overwrite'` mode.
 */
export async function importBackupJson(
  file: File,
  mode: 'merge' | 'overwrite',
): Promise<{ importedDays: number; totalEntries: number }> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON file.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backup file must contain a JSON object.')
  }

  const root = parsed as Record<string, unknown>
  const sourceData: Record<string, unknown> =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root

  const logKeys = Object.keys(sourceData).filter((k) => k.startsWith('brm_logs_'))
  if (logKeys.length === 0 && !('brm_theme' in sourceData) && !('brm_feed_interval_mins' in sourceData)) {
    throw new Error('No Baby Routine Monitor data found in backup file.')
  }

  if (mode === 'overwrite') {
    const existingKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('brm_logs_')) {
        existingKeys.push(k)
      }
    }
    for (const k of existingKeys) {
      localStorage.removeItem(k)
    }
  }

  let importedDays = 0
  let totalEntries = 0

  for (const key of logKeys) {
    const rawVal = sourceData[key]
    let incomingArr: RoutineEntry[] = []

    if (Array.isArray(rawVal)) {
      incomingArr = rawVal as RoutineEntry[]
    } else if (typeof rawVal === 'string') {
      try {
        const p = JSON.parse(rawVal)
        if (Array.isArray(p)) incomingArr = p as RoutineEntry[]
      } catch {
        continue
      }
    } else {
      continue
    }

    const validIncoming = incomingArr.filter(
      (item): item is RoutineEntry =>
        Boolean(item && typeof item === 'object' && typeof item.timestamp === 'number' && (item.type === 'feed' || item.type === 'diaper')),
    )

    if (mode === 'overwrite') {
      const sorted = [...validIncoming].sort((a, b) => b.timestamp - a.timestamp)
      localStorage.setItem(key, JSON.stringify(sorted))
      importedDays++
      totalEntries += sorted.filter((e) => !e.deleted).length
    } else {
      let existingArr: RoutineEntry[] = []
      try {
        existingArr = JSON.parse(localStorage.getItem(key) || '[]')
        if (!Array.isArray(existingArr)) existingArr = []
      } catch {
        existingArr = []
      }

      const map = new Map<string, RoutineEntry>()
      for (const entry of existingArr) {
        if (entry && typeof entry === 'object') {
          map.set(getEntryDedupeKey(entry), entry)
        }
      }
      for (const entry of validIncoming) {
        map.set(getEntryDedupeKey(entry), entry)
      }

      const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp)
      localStorage.setItem(key, JSON.stringify(merged))
      importedDays++
      totalEntries += validIncoming.filter((e) => !e.deleted).length
    }
  }

  if (typeof sourceData.brm_theme === 'string') {
    localStorage.setItem('brm_theme', sourceData.brm_theme)
  }

  if (sourceData.brm_feed_interval_mins !== undefined) {
    const val = Number(sourceData.brm_feed_interval_mins)
    if (!Number.isNaN(val) && val > 0) {
      localStorage.setItem('brm_feed_interval_mins', String(val))
    }
  }

  window.dispatchEvent(new CustomEvent('brm_sync_complete'))
  syncData()

  return { importedDays, totalEntries }
}
