// ─── Shared Baby Routine types & pure utility functions ───────────────────────
// Single source of truth — imported by all components, services, and composables.

export type FeedingMethod = 'latch' | 'bottle'
export type MilkType = 'breast' | 'formula' | 'both'
export type BreastSide = 'left' | 'right' | 'both'

export interface FeedEntry {
  id: string
  type: 'feed'
  timestamp: number
  feedingMethod: FeedingMethod
  /** Relevant when feedingMethod === 'bottle' */
  milkType?: MilkType
  /** Total bottle volume in ml (breastAmountMl + formulaAmountMl) */
  amountMl?: number
  /** Breast milk volume in ml when feedingMethod === 'bottle' */
  breastAmountMl?: number
  /** Formula milk volume in ml when feedingMethod === 'bottle' */
  formulaAmountMl?: number
  /** Relevant when feedingMethod === 'latch' (optional duration in mins) */
  durationMinutes?: number
  /** Relevant when feedingMethod === 'latch' (optional breast side) */
  breastSide?: BreastSide
  deleted?: boolean
}

export interface DiaperEntry {
  id: string
  type: 'diaper'
  timestamp: number
  hasUrine: boolean
  hasPoop: boolean
  deleted?: boolean
}

export type RoutineEntry = FeedEntry | DiaperEntry

export type RoutineEntryWithMeta = RoutineEntry & {
  dateKey: string // e.g. "2026-11-15"
  index: number   // index within that day's localStorage array
}

export interface EntryBadge {
  label: string
  /** Optional secondary line (e.g., milk breakdown for combined bottle feeds) */
  subLabel?: string
  /** Individual lines for multi-line rendering */
  lines: string[]
  /** Lighter colour for use on a coloured gradient card */
  color: string
  /** Standard colour for use on a neutral card background */
  cls: string
}

/** Generate a unique ID for a routine entry. */
export function createEntryId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Format a unix-ms timestamp as "h:mm AM/PM". */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  let h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

/** Format a relative "time ago" string (e.g. "Just now", "2h 15m ago"). */
export function formatTimeAgo(ts: number, nowMs: number = Date.now()): string {
  const diffMs = Math.max(0, nowMs - ts)
  const totalMins = Math.floor(diffMs / 60000)
  if (totalMins < 1) return 'Just now'
  if (totalMins < 60) return `${totalMins}m ago`
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Format YYYY-MM-DD key from a Date or timestamp. */
export function formatDateKey(dateOrTs: Date | number = new Date()): string {
  const d = typeof dateOrTs === 'number' ? new Date(dateOrTs) : dateOrTs
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Return the localStorage key for a given YYYY-MM-DD date string. */
export function getStorageKeyForDate(dateKey: string): string {
  return `brm_logs_${dateKey}`
}

/** Return the localStorage key for today's routine logs. */
export function getTodayStorageKey(): string {
  return getStorageKeyForDate(formatDateKey(new Date()))
}

/**
 * Extract normalized breast, formula, and total ml from a FeedEntry,
 * seamlessly supporting both combined entries and single-milk entries.
 */
export function getBottleAmounts(entry: FeedEntry): {
  breastMl: number
  formulaMl: number
  totalMl: number
} {
  if (entry.feedingMethod !== 'bottle') {
    return { breastMl: 0, formulaMl: 0, totalMl: 0 }
  }
  const hasExplicitBreakdown =
    entry.breastAmountMl !== undefined || entry.formulaAmountMl !== undefined

  if (hasExplicitBreakdown) {
    const breastMl = Math.max(0, entry.breastAmountMl ?? 0)
    const formulaMl = Math.max(0, entry.formulaAmountMl ?? 0)
    return { breastMl, formulaMl, totalMl: breastMl + formulaMl }
  }

  const fallbackTotal = Math.max(0, entry.amountMl ?? 0)
  if (entry.milkType === 'formula') {
    return { breastMl: 0, formulaMl: fallbackTotal, totalMl: fallbackTotal }
  }
  return { breastMl: fallbackTotal, formulaMl: 0, totalMl: fallbackTotal }
}

/** Describe a FeedEntry in human-readable badge format. */
export function describeFeed(entry: FeedEntry): EntryBadge {
  if (entry.feedingMethod === 'latch') {
    const sideLabel = entry.breastSide
      ? ` • ${entry.breastSide.toUpperCase()}`
      : ''
    const label = `Latching${sideLabel}`
    return {
      label,
      lines: [label],
      color: 'text-orange-100',
      cls: 'text-orange-700 dark:text-orange-400',
    }
  }

  const { breastMl, formulaMl } = getBottleAmounts(entry)

  if (breastMl > 0 && formulaMl > 0) {
    return {
      label: 'Bottle • Combined',
      subLabel: `${breastMl}ml Breast Milk • ${formulaMl}ml Formula`,
      lines: ['Bottle', `${breastMl}ml Breast Milk`, `${formulaMl}ml Formula`],
      color: 'text-amber-100',
      cls: 'text-amber-700 dark:text-amber-400',
    }
  }

  if (formulaMl > 0 || entry.milkType === 'formula') {
    const label = 'Bottle • Formula Milk'
    return {
      label,
      lines: [label],
      color: 'text-yellow-100',
      cls: 'text-yellow-700 dark:text-yellow-400',
    }
  }

  const label = 'Bottle • Breast Milk'
  return {
    label,
    lines: [label],
    color: 'text-orange-100',
    cls: 'text-amber-800 dark:text-amber-300',
  }
}

/** Describe a DiaperEntry in human-readable badge format. */
export function describeDiaper(entry: DiaperEntry): EntryBadge {
  if (entry.hasUrine && entry.hasPoop) {
    return {
      label: 'Urine + Poop',
      lines: ['Urine + Poop'],
      color: 'text-amber-100',
      cls: 'text-amber-700 dark:text-amber-400',
    }
  }
  if (entry.hasPoop) {
    return {
      label: 'Poop Only',
      lines: ['Poop Only'],
      color: 'text-orange-100',
      cls: 'text-orange-700 dark:text-orange-400',
    }
  }
  return {
    label: 'Urine Only',
    lines: ['Urine Only'],
    color: 'text-emerald-100',
    cls: 'text-emerald-700 dark:text-emerald-400',
  }
}
