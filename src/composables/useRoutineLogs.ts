import { ref, computed } from 'vue'
import {
  type RoutineEntry,
  type RoutineEntryWithMeta,
  type FeedEntry,
  type DiaperEntry,
  formatDateKey,
  getStorageKeyForDate,
  getTodayStorageKey,
} from '../utils/baby'
import { syncData } from '../services/driveSync'

// ── Shared localStorage helpers ──────────────────────────────────────────────

function readRaw(key: string): RoutineEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? (parsed as RoutineEntry[]) : []
  } catch {
    return []
  }
}

/** Load every active (non-deleted) routine entry across all dates, newest first. */
export function loadAllEntries(): RoutineEntryWithMeta[] {
  const keys = Object.keys(localStorage)
    .filter((k) => k.startsWith('brm_logs_'))
    .sort((a, b) => b.localeCompare(a))

  const result: RoutineEntryWithMeta[] = []
  for (const key of keys) {
    const dateKey = key.replace('brm_logs_', '')
    readRaw(key).forEach((r, idx) => {
      if (!r.deleted) {
        result.push({ ...r, dateKey, index: idx })
      }
    })
  }
  return result.sort((a, b) => b.timestamp - a.timestamp)
}

/** Soft-delete a routine entry by ID or timestamp. */
export function softDeleteEntry(dateKey: string, idOrTimestamp: string | number): void {
  const key = getStorageKeyForDate(dateKey)
  const arr = readRaw(key).map((e) =>
    e.id === idOrTimestamp || e.timestamp === idOrTimestamp
      ? { ...e, deleted: true }
      : e,
  )
  localStorage.setItem(key, JSON.stringify(arr))
  window.dispatchEvent(new CustomEvent('brm_sync_complete'))
  syncData()
}

export { softDeleteEntry as softDelete }

/** Insert or replace a (potentially backdated) routine entry for any date. */
export function backdateEntry(dateKey: string, entry: RoutineEntry): void {
  const key = getStorageKeyForDate(dateKey)
  const existing = readRaw(key).filter((e) => e.id !== entry.id)
  const arr = [...existing, entry].sort((a, b) => b.timestamp - a.timestamp)
  localStorage.setItem(key, JSON.stringify(arr))
  window.dispatchEvent(new CustomEvent('brm_sync_complete'))
  syncData()
}

// ── Today routine logs composable (used by App.vue's Today tab) ──────────────

export function useRoutineLogs() {
  const todayEntries = ref<RoutineEntry[]>([])
  const latestOverallFeed = ref<FeedEntry | null>(null)

  const todayFeeds = computed(() =>
    todayEntries.value.filter((e): e is FeedEntry => e.type === 'feed'),
  )

  const todayDiapers = computed(() =>
    todayEntries.value.filter((e): e is DiaperEntry => e.type === 'diaper'),
  )

  const latestFeed = computed<FeedEntry | null>(() => todayFeeds.value[0] ?? latestOverallFeed.value)

  const latestDiaper = computed<DiaperEntry | null>(() => todayDiapers.value[0] ?? null)

  function loadToday() {
    todayEntries.value = readRaw(getTodayStorageKey())
      .filter((r) => !r.deleted)
      .sort((a, b) => b.timestamp - a.timestamp)

    const allFeeds = loadAllEntries().filter((e): e is FeedEntry & { dateKey: string; index: number } => e.type === 'feed')
    latestOverallFeed.value = allFeeds[0] ?? null
  }

  function persistToday() {
    const key = getTodayStorageKey()
    try {
      const deleted = readRaw(key).filter((r) => r.deleted)
      const combined = [...todayEntries.value, ...deleted].sort(
        (a, b) => b.timestamp - a.timestamp,
      )
      localStorage.setItem(key, JSON.stringify(combined))
    } catch {
      localStorage.setItem(key, JSON.stringify(todayEntries.value))
    }
    window.dispatchEvent(new CustomEvent('brm_sync_complete'))
    syncData()
  }

  function addEntry(entry: RoutineEntry) {
    const targetDateKey = formatDateKey(entry.timestamp)
    const todayKey = formatDateKey(new Date())
    if (targetDateKey !== todayKey) {
      backdateEntry(targetDateKey, entry)
      loadToday()
      return
    }
    todayEntries.value = [entry, ...todayEntries.value.filter((e) => e.id !== entry.id)].sort(
      (a, b) => b.timestamp - a.timestamp,
    )
    persistToday()
  }

  function updateEntry(id: string, updated: RoutineEntry) {
    const todayDateKey = formatDateKey(new Date())
    const targetDateKey = formatDateKey(updated.timestamp)

    if (targetDateKey === todayDateKey) {
      const existsInToday = todayEntries.value.some((e) => e.id === id)
      if (existsInToday) {
        todayEntries.value = todayEntries.value
          .map((e) => (e.id === id ? updated : e))
          .sort((a, b) => b.timestamp - a.timestamp)
      } else {
        todayEntries.value = [updated, ...todayEntries.value].sort(
          (a, b) => b.timestamp - a.timestamp,
        )
      }
      persistToday()
    } else {
      // Entry was moved to a different date — remove from today and save to target date
      todayEntries.value = todayEntries.value.filter((e) => e.id !== id)
      persistToday()
      backdateEntry(targetDateKey, updated)
    }
  }

  function deleteEntry(id: string) {
    const todayDateKey = formatDateKey(new Date())
    softDeleteEntry(todayDateKey, id)
    loadToday()
  }

  return {
    todayEntries,
    todayFeeds,
    todayDiapers,
    latestFeed,
    latestDiaper,
    loadToday,
    addEntry,
    updateEntry,
    deleteEntry,
  }
}
