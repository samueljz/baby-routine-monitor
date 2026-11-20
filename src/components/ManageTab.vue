<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NCard, NButton, NEmpty, NModal } from 'naive-ui'

import {
  loadAllEntries,
  softDeleteEntry,
  backdateEntry,
} from '../composables/useRoutineLogs'
import {
  exportBackupJson,
  importBackupJson,
} from '../services/localBackup'
import {
  isSignedIn,
  isSyncing,
  syncError,
  needsReauth,
  handleAuthClick,
  handleSignoutClick,
  syncData,
} from '../services/driveSync'
import {
  createEntryId,
  describeFeed,
  describeDiaper,
  formatTime,
  formatDateKey,
  getBottleAmounts,
  type RoutineEntry,
  type RoutineEntryWithMeta,
  type FeedingMethod,
  type MilkType,
  type BreastSide,
} from '../utils/baby'

// ─── Data ─────────────────────────────────────────────────────────────────────

const allEntries = ref<RoutineEntryWithMeta[]>([])

function loadData() {
  allEntries.value = loadAllEntries()
}

// ─── Grouped by date ──────────────────────────────────────────────────────────

const groupedEntries = computed(() => {
  const map = new Map<string, RoutineEntryWithMeta[]>()
  for (const entry of allEntries.value) {
    const existing = map.get(entry.dateKey)
    if (existing) {
      existing.push(entry)
    } else {
      map.set(entry.dateKey, [entry])
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, entries]) => ({ dateKey, entries }))
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  loadData()
  window.addEventListener('brm_sync_complete', loadData)
})

onUnmounted(() => {
  window.removeEventListener('brm_sync_complete', loadData)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function friendlyDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  const y = parts[0] ?? 2026
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Local File Backup & Import ───────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingImportFile = ref<File | null>(null)
const showImportModeModal = ref(false)
const backupBanner = ref<{ type: 'success' | 'error'; message: string } | null>(null)

function handleExportJson() {
  backupBanner.value = null
  try {
    exportBackupJson()
    backupBanner.value = {
      type: 'success',
      message: 'Backup JSON exported to your device.',
    }
  } catch (err) {
    backupBanner.value = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to export backup.',
    }
  }
}

function triggerImportSelect() {
  backupBanner.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  pendingImportFile.value = file
  showImportModeModal.value = true
}

async function runImport(mode: 'merge' | 'overwrite') {
  const file = pendingImportFile.value
  showImportModeModal.value = false
  if (!file) return

  try {
    const result = await importBackupJson(file, mode)
    loadData()
    backupBanner.value = {
      type: 'success',
      message: `Imported ${result.totalEntries} entries across ${result.importedDays} days (${mode}).`,
    }
  } catch (err) {
    backupBanner.value = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Invalid backup file.',
    }
  } finally {
    pendingImportFile.value = null
  }
}

// ─── Backdate Entry Modal ─────────────────────────────────────────────────────

const showAddModal = ref(false)
const formDate = ref('')
const formTime = ref('')
const formEntryType = ref<'feed' | 'diaper'>('feed')
const formFeedingMethod = ref<FeedingMethod>('bottle')
const formHasBreastMilk = ref(true)
const formHasFormulaMilk = ref(false)
const formBreastAmountMl = ref<number | null>(90)
const formFormulaAmountMl = ref<number | null>(60)
const formDurationMinutes = ref<number | null>(15)
const formBreastSide = ref<BreastSide>('both')
const formHasUrine = ref(true)
const formHasPoop = ref(false)
const formError = ref('')

function openAddModal() {
  const now = new Date()
  formDate.value = formatDateKey(now)
  formTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  formEntryType.value = 'feed'
  formFeedingMethod.value = 'bottle'
  formHasBreastMilk.value = true
  formHasFormulaMilk.value = false
  formBreastAmountMl.value = 90
  formFormulaAmountMl.value = 60
  formDurationMinutes.value = 15
  formBreastSide.value = 'both'
  formHasUrine.value = true
  formHasPoop.value = false
  formError.value = ''
  showAddModal.value = true
}

function adjustFormBreastAmount(delta: number) {
  formBreastAmountMl.value = Math.max(0, Math.min(500, (formBreastAmountMl.value ?? 0) + delta))
}

function adjustFormFormulaAmount(delta: number) {
  formFormulaAmountMl.value = Math.max(0, Math.min(500, (formFormulaAmountMl.value ?? 0) + delta))
}

function adjustFormDuration(delta: number) {
  formDurationMinutes.value = Math.max(0, Math.min(180, (formDurationMinutes.value ?? 0) + delta))
}

function saveBackdatedEntry() {
  formError.value = ''
  if (!formDate.value) {
    formError.value = 'Please select a date.'
    return
  }
  if (!formTime.value) {
    formError.value = 'Please select a time.'
    return
  }

  const dateParts = formDate.value.split('-').map(Number)
  const timeParts = formTime.value.split(':').map(Number)
  const ts = new Date(
    dateParts[0] ?? 2026,
    (dateParts[1] ?? 1) - 1,
    dateParts[2] ?? 1,
    timeParts[0] ?? 0,
    timeParts[1] ?? 0,
    0,
    0
  ).getTime()

  let entry: RoutineEntry

  if (formEntryType.value === 'feed') {
    if (formFeedingMethod.value === 'bottle') {
      if (!formHasBreastMilk.value && !formHasFormulaMilk.value) {
        formError.value = 'Please select at least Breast Milk or Formula Milk.'
        return
      }
      const bMl = formHasBreastMilk.value ? Math.round(formBreastAmountMl.value ?? 0) : 0
      const fMl = formHasFormulaMilk.value ? Math.round(formFormulaAmountMl.value ?? 0) : 0

      if (formHasBreastMilk.value && bMl <= 0) {
        formError.value = 'Please enter a valid Breast Milk amount in ml.'
        return
      }
      if (formHasFormulaMilk.value && fMl <= 0) {
        formError.value = 'Please enter a valid Formula Milk amount in ml.'
        return
      }

      const totalMl = bMl + fMl
      const milkType: MilkType =
        formHasBreastMilk.value && formHasFormulaMilk.value
          ? 'both'
          : formHasFormulaMilk.value
            ? 'formula'
            : 'breast'

      entry = {
        id: createEntryId(),
        type: 'feed',
        timestamp: ts,
        feedingMethod: 'bottle',
        milkType,
        amountMl: totalMl,
        ...(bMl > 0 ? { breastAmountMl: bMl } : {}),
        ...(fMl > 0 ? { formulaAmountMl: fMl } : {}),
      }
    } else {
      entry = {
        id: createEntryId(),
        type: 'feed',
        timestamp: ts,
        feedingMethod: 'latch',
        durationMinutes:
          formDurationMinutes.value && formDurationMinutes.value > 0
            ? Math.round(formDurationMinutes.value)
            : undefined,
        breastSide: formBreastSide.value,
      }
    }
  } else {
    if (!formHasUrine.value && !formHasPoop.value) {
      formError.value = 'Please select Urine (Wet), Poop (Dirty), or both.'
      return
    }
    entry = {
      id: createEntryId(),
      type: 'diaper',
      timestamp: ts,
      hasUrine: formHasUrine.value,
      hasPoop: formHasPoop.value,
    }
  }

  backdateEntry(formDate.value, entry)
  showAddModal.value = false
  loadData()
}

// ─── Delete Entry Modal ───────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const pendingDeleteEntry = ref<RoutineEntryWithMeta | null>(null)

function confirmDelete(entry: RoutineEntryWithMeta) {
  pendingDeleteEntry.value = entry
  showDeleteModal.value = true
}

function executeDelete() {
  if (!pendingDeleteEntry.value) return
  softDeleteEntry(pendingDeleteEntry.value.dateKey, pendingDeleteEntry.value.id)
  showDeleteModal.value = false
  pendingDeleteEntry.value = null
  loadData()
}
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto no-scrollbar pb-32 px-4 pt-2 transition-colors duration-500">

    <!-- Backdate Entry Button -->
    <button
      type="button"
      @click="openAddModal"
      class="w-full py-4 rounded-2xl font-extrabold text-white text-sm uppercase tracking-widest shadow-md active:scale-95 transition-all bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 mb-4"
    >
      + Backdate Entry
    </button>

    <!-- Backup & Cloud Sync Card -->
    <n-card
      class="w-full rounded-2xl shadow-sm border border-amber-900/10 dark:border-stone-800 bg-[#fffdf9] dark:bg-stone-900 mb-6"
      :bordered="false"
      size="small"
    >
      <div class="flex flex-col gap-3 px-1 py-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">☁️</span>
            <span class="text-xs font-extrabold uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Backup & Cloud Sync
            </span>
          </div>
          <span
            v-if="isSignedIn"
            class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
            :class="
              isSyncing
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : syncError
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            "
          >
            {{ isSyncing ? 'Syncing…' : syncError ? 'Sync Error' : 'Drive Connected' }}
          </span>
        </div>

        <!-- Google Drive Row -->
        <div class="flex items-center gap-2">
          <button
            v-if="!isSignedIn || needsReauth"
            type="button"
            @click="handleAuthClick()"
            class="flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-[#f3ece1] dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-amber-100/70 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4 text-amber-600 dark:text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            </svg>
            <span>{{ needsReauth ? 'Reconnect Google Drive' : 'Connect Google Drive' }}</span>
          </button>

          <template v-else>
            <button
              type="button"
              :disabled="isSyncing"
              @click="syncData(false)"
              class="flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>🔄</span>
              <span>{{ isSyncing ? 'Syncing…' : 'Sync Drive Now' }}</span>
            </button>
            <button
              type="button"
              @click="handleSignoutClick()"
              class="py-2.5 px-3 rounded-xl text-xs font-bold bg-[#f3ece1] dark:bg-stone-800 text-stone-600 dark:text-stone-300 active:scale-95 transition-all"
            >
              Sign Out
            </button>
          </template>
        </div>

        <!-- Local JSON Export / Import Row -->
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            @click="handleExportJson"
            class="py-2.5 px-3 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-[#f3ece1] dark:bg-stone-800 text-stone-700 dark:text-stone-200 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>⬇️</span>
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            @click="triggerImportSelect"
            class="py-2.5 px-3 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-[#f3ece1] dark:bg-stone-800 text-stone-700 dark:text-stone-200 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>⬆️</span>
            <span>Import JSON</span>
          </button>

          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onFileSelected"
          />
        </div>

        <!-- Backup Feedback Banner -->
        <div
          v-if="backupBanner"
          class="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between"
          :class="
            backupBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-300'
          "
        >
          <span>{{ backupBanner.message }}</span>
          <button type="button" @click="backupBanner = null" class="ml-2 font-black opacity-70">✕</button>
        </div>
      </div>
    </n-card>

    <!-- Empty state -->
    <n-empty v-if="groupedEntries.length === 0" description="No routine entries yet" class="my-10" />

    <!-- Grouped list -->
    <div v-else class="flex flex-col gap-6">
      <div v-for="group in groupedEntries" :key="group.dateKey">

        <!-- Date heading -->
        <div class="flex items-center gap-2 mb-2 px-1">
          <span class="text-xs font-extrabold uppercase tracking-widest text-stone-400 dark:text-stone-500">
            {{ friendlyDate(group.dateKey) }}
          </span>
          <div class="flex-1 h-px bg-amber-900/10 dark:bg-stone-800" />
        </div>

        <!-- Entries for this day -->
        <div class="flex flex-col gap-2">
          <n-card
            v-for="entry in group.entries"
            :key="entry.id"
            class="w-full rounded-2xl shadow-sm border border-amber-900/10 dark:border-stone-800 bg-[#fffdf9] dark:bg-stone-900"
            :bordered="false"
            size="small"
          >
            <div class="flex justify-between items-center gap-3 px-2 py-1">

              <!-- Left: Icon + Time + Category -->
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                  :class="
                    entry.type === 'feed'
                      ? 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  "
                >
                  <span v-if="entry.type === 'feed'">
                    {{ entry.feedingMethod === 'bottle' ? '🍼' : '🤱' }}
                  </span>
                  <span v-else>
                    🧸
                  </span>
                </div>

                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 opacity-70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {{ formatTime(entry.timestamp) }}
                  </div>
                  <div
                    class="flex flex-col text-[11px] font-extrabold uppercase tracking-widest leading-snug"
                    :class="
                      entry.type === 'feed'
                        ? describeFeed(entry).cls
                        : describeDiaper(entry).cls
                    "
                  >
                    <span
                      v-for="(line, lIdx) in (entry.type === 'feed' ? describeFeed(entry).lines : describeDiaper(entry).lines)"
                      :key="lIdx"
                    >
                      {{ line }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Right: Value + Delete Button -->
              <div class="flex items-center gap-3 shrink-0 whitespace-nowrap">
                <div class="flex items-baseline gap-1 shrink-0 whitespace-nowrap">
                  <template v-if="entry.type === 'feed'">
                    <template v-if="entry.feedingMethod === 'bottle'">
                      <span class="text-2xl font-black tabular-nums text-stone-800 dark:text-amber-100">
                        {{ getBottleAmounts(entry).totalMl }}
                      </span>
                      <span class="text-[9px] font-bold text-stone-400 uppercase ml-0.5">ml</span>
                    </template>
                    <template v-else>
                      <span class="text-xl font-black tabular-nums text-stone-800 dark:text-amber-100">
                        {{ entry.durationMinutes ? `${entry.durationMinutes}m` : 'Latch' }}
                      </span>
                    </template>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-1 shrink-0 whitespace-nowrap">
                      <span
                        v-if="entry.hasUrine"
                        class="px-2 py-0.5 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold"
                      >
                        💧
                      </span>
                      <span
                        v-if="entry.hasPoop"
                        class="px-2 py-0.5 rounded-lg bg-amber-100/80 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-xs font-extrabold"
                      >
                        💩
                      </span>
                    </div>
                  </template>
                </div>

                <!-- Delete button -->
                <button
                  type="button"
                  @click="confirmDelete(entry)"
                  class="w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-90 transition-all shrink-0"
                  title="Delete this entry"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              </div>

            </div>
          </n-card>
        </div>

      </div>
    </div>

    <!-- ── Backdate Entry Modal ─────────────────────────────────────────── -->
    <n-modal v-model:show="showAddModal">
      <n-card
        style="width: 350px; border-radius: 28px;"
        title="Backdate Routine Entry"
        :bordered="false"
        size="huge"
        role="dialog"
        aria-modal="true"
        class="shadow-2xl"
      >
        <div class="flex flex-col gap-4 pt-1">

          <!-- Entry Type Toggle -->
          <div class="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl">
            <button
              type="button"
              @click="formEntryType = 'feed'; formError = ''"
              class="py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
              :class="
                formEntryType === 'feed'
                  ? 'bg-[#fffdf9] dark:bg-stone-700 text-amber-700 dark:text-amber-300 shadow-sm'
                  : 'text-stone-500 dark:text-stone-400'
              "
            >
              <span>🍼</span>
              <span>Feed</span>
            </button>
            <button
              type="button"
              @click="formEntryType = 'diaper'; formError = ''"
              class="py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
              :class="
                formEntryType === 'diaper'
                  ? 'bg-[#fffdf9] dark:bg-stone-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                  : 'text-stone-500 dark:text-stone-400'
              "
            >
              <span>🧸</span>
              <span>Diaper</span>
            </button>
          </div>

          <!-- Date & Time Row -->
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-1.5 block">Date</label>
              <input
                type="date"
                v-model="formDate"
                :style="{ colorScheme: 'light' }"
                class="w-full rounded-2xl px-3 py-2.5 text-sm font-bold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100 outline-none focus:ring-4 focus:ring-amber-500/30 transition-shadow"
              />
            </div>

            <div>
              <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-1.5 block">Time</label>
              <input
                type="time"
                v-model="formTime"
                :style="{ colorScheme: 'light' }"
                class="w-full rounded-2xl px-3 py-2.5 text-sm font-bold tabular-nums bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100 outline-none focus:ring-4 focus:ring-amber-500/30 transition-shadow"
              />
            </div>
          </div>

          <!-- Feed Fields -->
          <template v-if="formEntryType === 'feed'">
            <div>
              <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
                Feeding Method
              </label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  @click="formFeedingMethod = 'bottle'; formError = ''"
                  class="py-2.5 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all"
                  :class="
                    formFeedingMethod === 'bottle'
                      ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                      : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                  "
                >
                  🍼 Bottle Feed
                </button>
                <button
                  type="button"
                  @click="formFeedingMethod = 'latch'; formError = ''"
                  class="py-2.5 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all"
                  :class="
                    formFeedingMethod === 'latch'
                      ? 'border-orange-500 bg-orange-50/80 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300'
                      : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                  "
                >
                  🤱 Latching
                </button>
              </div>
            </div>

            <!-- Bottle Subfields -->
            <template v-if="formFeedingMethod === 'bottle'">
              <div>
                <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
                  Type of Milk (Select one or both)
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    @click="formHasBreastMilk = !formHasBreastMilk; formError = ''"
                    class="py-2 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all"
                    :class="
                      formHasBreastMilk
                        ? 'border-amber-600 bg-amber-50/90 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                        : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                    "
                  >
                    💧 Breast Milk
                  </button>
                  <button
                    type="button"
                    @click="formHasFormulaMilk = !formHasFormulaMilk; formError = ''"
                    class="py-2 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all"
                    :class="
                      formHasFormulaMilk
                        ? 'border-orange-500 bg-orange-50/90 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300'
                        : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                    "
                  >
                    ✨ Formula Milk
                  </button>
                </div>
              </div>

              <!-- Breast Milk Amount -->
              <div v-if="formHasBreastMilk">
                <label class="text-xs font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2 block">
                  Breast Milk Amount (ml)
                </label>
                <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3 py-2">
                  <button
                    type="button"
                    @click="adjustFormBreastAmount(-10)"
                    class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-sm font-black text-stone-600 dark:text-stone-200"
                  >
                    −10
                  </button>
                  <div class="flex-1 flex flex-col items-center min-w-0">
                    <input
                      type="number"
                      inputmode="numeric"
                      step="5"
                      min="0"
                      max="500"
                      v-model.number="formBreastAmountMl"
                      placeholder="90"
                      class="w-full bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest -mt-1">ML BREAST</span>
                  </div>
                  <button
                    type="button"
                    @click="adjustFormBreastAmount(10)"
                    class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-sm font-black text-stone-600 dark:text-stone-200"
                  >
                    +10
                  </button>
                </div>
              </div>

              <!-- Formula Milk Amount -->
              <div v-if="formHasFormulaMilk">
                <label class="text-xs font-extrabold text-orange-700 dark:text-orange-400 uppercase tracking-widest mb-2 block">
                  Formula Milk Amount (ml)
                </label>
                <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3 py-2">
                  <button
                    type="button"
                    @click="adjustFormFormulaAmount(-10)"
                    class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-sm font-black text-stone-600 dark:text-stone-200"
                  >
                    −10
                  </button>
                  <div class="flex-1 flex flex-col items-center min-w-0">
                    <input
                      type="number"
                      inputmode="numeric"
                      step="5"
                      min="0"
                      max="500"
                      v-model.number="formFormulaAmountMl"
                      placeholder="60"
                      class="w-full bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest -mt-1">ML FORMULA</span>
                  </div>
                  <button
                    type="button"
                    @click="adjustFormFormulaAmount(10)"
                    class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-sm font-black text-stone-600 dark:text-stone-200"
                  >
                    +10
                  </button>
                </div>
              </div>
            </template>

            <!-- Latching Subfields -->
            <template v-else>
              <div>
                <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
                  Breast Side
                </label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="side in (['left', 'right', 'both'] as const)"
                    :key="side"
                    type="button"
                    @click="formBreastSide = side"
                    class="py-2 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all"
                    :class="
                      formBreastSide === side
                        ? 'border-orange-500 bg-orange-50/80 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300'
                        : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                    "
                  >
                    {{ side }}
                  </button>
                </div>
              </div>

              <div>
                <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
                  Duration (mins)
                </label>
                <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3 py-2">
                  <button
                    type="button"
                    @click="adjustFormDuration(-1)"
                    class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-xl font-black text-stone-600 dark:text-stone-200"
                  >
                    −
                  </button>
                  <div class="flex-1 flex flex-col items-center min-w-0">
                    <input
                      type="number"
                      inputmode="numeric"
                      step="1"
                      min="0"
                      max="180"
                      v-model.number="formDurationMinutes"
                      placeholder="15"
                      class="w-full bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest -mt-1">MINS</span>
                  </div>
                  <button
                    type="button"
                    @click="adjustFormDuration(1)"
                    class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-xl font-black text-stone-600 dark:text-stone-200"
                  >
                    +
                  </button>
                </div>
              </div>
            </template>
          </template>

          <!-- Diaper Fields -->
          <template v-else>
            <div class="flex flex-col gap-2.5">
              <button
                type="button"
                @click="formHasUrine = !formHasUrine; formError = ''"
                class="w-full p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between"
                :class="
                  formHasUrine
                    ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                    : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                "
              >
                <span class="font-extrabold text-sm flex items-center gap-2">
                  <span>💧</span>
                  <span>Urine (Wet)</span>
                </span>
                <span class="font-black text-xs uppercase">{{ formHasUrine ? 'Yes' : 'No' }}</span>
              </button>

              <button
                type="button"
                @click="formHasPoop = !formHasPoop; formError = ''"
                class="w-full p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between"
                :class="
                  formHasPoop
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                    : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500'
                "
              >
                <span class="font-extrabold text-sm flex items-center gap-2">
                  <span>💩</span>
                  <span>Poop (Dirty)</span>
                </span>
                <span class="font-black text-xs uppercase">{{ formHasPoop ? 'Yes' : 'No' }}</span>
              </button>
            </div>
          </template>

          <!-- Error -->
          <div
            v-if="formError"
            class="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-semibold flex items-start gap-2 leading-tight"
          >
            <svg class="shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ formError }}</span>
          </div>

        </div>

        <template #footer>
          <div class="flex items-center gap-3 mt-2 w-full justify-end">
            <n-button size="large" @click="showAddModal = false" class="font-bold">Cancel</n-button>
            <n-button
              color="#d97706"
              text-color="#ffffff"
              size="large"
              @click="saveBackdatedEntry"
              class="font-bold px-6 shadow-md"
            >
              Save
            </n-button>
          </div>
        </template>
      </n-card>
    </n-modal>

    <!-- ── Import JSON Mode Modal (Merge vs Overwrite) ─────────────────── -->
    <n-modal v-model:show="showImportModeModal">
      <n-card
        style="width: 330px; border-radius: 24px;"
        title="Import Backup JSON"
        :bordered="false"
        size="medium"
        role="dialog"
        aria-modal="true"
        class="shadow-2xl"
      >
        <div class="flex flex-col gap-3 pt-1">
          <p class="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            How would you like to import
            <strong class="text-stone-800 dark:text-stone-100">{{ pendingImportFile?.name }}</strong>?
          </p>
          <button
            type="button"
            @click="runImport('merge')"
            class="w-full p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs uppercase tracking-wider text-left flex flex-col gap-0.5 active:scale-95 transition-all"
          >
            <span>Merge with existing logs (Recommended)</span>
            <span class="text-[11px] font-medium opacity-80 normal-case">Keeps current entries and adds missing ones</span>
          </button>
          <button
            type="button"
            @click="runImport('overwrite')"
            class="w-full p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-extrabold text-xs uppercase tracking-wider text-left flex flex-col gap-0.5 active:scale-95 transition-all"
          >
            <span>Overwrite matching days</span>
            <span class="text-[11px] font-medium opacity-80 normal-case">Replaces days present in the backup file</span>
          </button>
        </div>

        <template #footer>
          <div class="flex items-center justify-end mt-1">
            <n-button size="medium" @click="showImportModeModal = false" class="font-bold">Cancel</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>

    <!-- ── Delete Confirmation Modal ───────────────────────────────────── -->
    <n-modal v-model:show="showDeleteModal">
      <n-card
        style="width: 320px; border-radius: 24px;"
        title="Delete Entry"
        :bordered="false"
        size="medium"
        role="dialog"
        aria-modal="true"
        class="shadow-2xl"
      >
        <div v-if="pendingDeleteEntry" class="flex flex-col gap-3 pt-1">
          <p class="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            Are you sure you want to delete this routine entry?
          </p>
          <div class="px-4 py-3 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-between">
            <div class="text-xs font-semibold text-stone-500 dark:text-stone-400">
              <div>{{ pendingDeleteEntry.dateKey }}</div>
              <div>{{ formatTime(pendingDeleteEntry.timestamp) }}</div>
            </div>
            <div class="font-extrabold text-sm text-stone-800 dark:text-stone-100">
              <template v-if="pendingDeleteEntry.type === 'feed'">
                {{
                  pendingDeleteEntry.feedingMethod === 'bottle'
                    ? `${getBottleAmounts(pendingDeleteEntry).totalMl} ml Bottle`
                    : 'Latching Feed'
                }}
              </template>
              <template v-else>
                {{ describeDiaper(pendingDeleteEntry).label }}
              </template>
            </div>
          </div>
          <p class="text-xs text-stone-400 dark:text-stone-500">This action cannot be undone.</p>
        </div>

        <template #footer>
          <div class="flex items-center gap-3 mt-2 w-full justify-end">
            <n-button size="large" @click="showDeleteModal = false" class="font-bold">Cancel</n-button>
            <n-button type="error" size="large" @click="executeDelete" class="font-bold px-6 shadow-md">Delete</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>

  </div>
</template>
