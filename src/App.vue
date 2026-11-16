<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  NConfigProvider, NCard, NButton, NModal,
  NTabs, NTabPane, NDropdown,
} from 'naive-ui'
import confetti from 'canvas-confetti'

import LogEntryModal      from './components/LogEntryModal.vue'
import HistoryTab         from './components/HistoryTab.vue'
import ManageTab          from './components/ManageTab.vue'

import {
  syncData, isSignedIn, isSyncing, syncError, needsReauth,
  handleAuthClick, handleSignoutClick, initGoogleApi,
  pendingConflict, resolveConflict,
} from './services/driveSync'

import { useTheme }       from './composables/useTheme'
import { useClock }       from './composables/useClock'
import { useLogModal }    from './composables/useLogModal'
import { useRoutineLogs } from './composables/useRoutineLogs'
import {
  formatTime,
  formatTimeAgo,
  describeFeed,
  describeDiaper,
  getBottleAmounts,
} from './utils/baby'

// ─── Theme ────────────────────────────────────────────────────────────────────

const { isDarkMode, naiveTheme, themeOverrides, initTheme, toggleTheme } = useTheme()

// ─── Clock ────────────────────────────────────────────────────────────────────

const { now, timeParts, dateString, todayDateKey } = useClock()

// ─── Routine Logs ─────────────────────────────────────────────────────────────

const {
  todayEntries,
  latestFeed,
  latestDiaper,
  loadToday,
  addEntry,
  updateEntry,
} = useRoutineLogs()

// Reload today's entries whenever the date changes (midnight rollover)
watch(todayDateKey, loadToday)

// ─── Feed Interval & Next Feed Timing Settings ────────────────────────────────

const FEED_INTERVAL_KEY = 'brm_feed_interval_mins'
const feedIntervalMinutes = ref<number>(180) // default 3 hours (180 mins)
const showSettingsModal = ref(false)
const formIntervalHours = ref<number>(3)
const formIntervalMins = ref<number>(0)
const settingsError = ref('')

function loadSettings() {
  const raw = localStorage.getItem(FEED_INTERVAL_KEY)
  if (raw) {
    const parsed = Number(raw)
    if (!Number.isNaN(parsed) && parsed >= 15 && parsed <= 1440) {
      feedIntervalMinutes.value = Math.round(parsed)
    }
  }
}

function openSettingsModal() {
  formIntervalHours.value = Math.floor(feedIntervalMinutes.value / 60)
  formIntervalMins.value = feedIntervalMinutes.value % 60
  settingsError.value = ''
  showSettingsModal.value = true
}

function applyIntervalPreset(totalMins: number) {
  formIntervalHours.value = Math.floor(totalMins / 60)
  formIntervalMins.value = totalMins % 60
  settingsError.value = ''
}

function adjustIntervalMinutes(delta: number) {
  const currentTotal = Math.max(15, Math.min(1440, formIntervalHours.value * 60 + formIntervalMins.value + delta))
  formIntervalHours.value = Math.floor(currentTotal / 60)
  formIntervalMins.value = currentTotal % 60
  settingsError.value = ''
}

function saveSettings() {
  settingsError.value = ''
  const h = Math.max(0, Math.floor(formIntervalHours.value || 0))
  const m = Math.max(0, Math.floor(formIntervalMins.value || 0))
  const total = h * 60 + m
  if (total < 15) {
    settingsError.value = 'Feed interval must be at least 15 minutes.'
    return
  }
  if (total > 1440) {
    settingsError.value = 'Feed interval cannot exceed 24 hours.'
    return
  }
  feedIntervalMinutes.value = total
  localStorage.setItem(FEED_INTERVAL_KEY, String(total))
  syncData()
  showSettingsModal.value = false
}

const formattedIntervalLabel = computed(() => {
  const h = Math.floor(feedIntervalMinutes.value / 60)
  const m = feedIntervalMinutes.value % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
})

const nextFeedStatus = computed(() => {
  const last = latestFeed.value
  if (!last) {
    return {
      hasFeed: false,
      isDue: false,
      nextTimeStr: '',
      relativeStr: '',
    }
  }

  const nextTs = last.timestamp + feedIntervalMinutes.value * 60 * 1000
  const diffMs = nextTs - now.value.getTime()
  const nextTimeStr = formatTime(nextTs)

  if (diffMs <= 0) {
    const overdueMins = Math.floor(Math.abs(diffMs) / 60000)
    let overdueStr = 'Due now'
    if (overdueMins >= 60) {
      const h = Math.floor(overdueMins / 60)
      const m = overdueMins % 60
      overdueStr = m > 0 ? `Overdue by ${h}h ${m}m` : `Overdue by ${h}h`
    } else if (overdueMins >= 1) {
      overdueStr = `Overdue by ${overdueMins}m`
    }
    return {
      hasFeed: true,
      isDue: true,
      nextTimeStr,
      relativeStr: overdueStr,
    }
  }

  const remainingMins = Math.ceil(diffMs / 60000)
  const h = Math.floor(remainingMins / 60)
  const m = remainingMins % 60
  const inStr = h > 0 ? (m > 0 ? `in ${h}h ${m}m` : `in ${h}h`) : `in ${m}m`

  return {
    hasFeed: true,
    isDue: false,
    nextTimeStr,
    relativeStr: inStr,
  }
})

// ─── Log modal ────────────────────────────────────────────────────────────────

const logModal = useLogModal((entry, isEdit) => {
  if (isEdit) updateEntry(entry.id, entry)
  else        addEntry(entry)

  confetti({
    particleCount: 80,
    spread: 65,
    origin: { y: 0.7 },
    colors:
      entry.type === 'feed'
        ? ['#d97706', '#ea580c', '#f59e0b', '#fb923c']
        : ['#65a30d', '#16a34a', '#d97706', '#eab308'],
  })
})

// ─── Settings dropdown (Kebab menu) ───────────────────────────────────────────

const dropdownOptions = computed(() => [
  { label: 'Settings', key: 'settings' },
  { label: isDarkMode.value ? 'Light Mode' : 'Dark Mode', key: 'theme' },
  {
    label: !isSignedIn.value
      ? 'Connect Google Drive'
      : needsReauth.value
        ? 'Reconnect Google Drive'
        : (isSyncing.value ? 'Syncing to Drive…' : 'Sync Now'),
    key: 'sync',
    disabled: isSyncing.value,
  },
  ...(isSignedIn.value ? [{ label: 'Disconnect Drive', key: 'signout' }] : []),
])

function handleDropdownSelect(key: string) {
  if (key === 'settings')  openSettingsModal()
  else if (key === 'theme') toggleTheme()
  else if (key === 'sync') {
    if (!isSignedIn.value || needsReauth.value) handleAuthClick()
    else syncData()
  } else if (key === 'signout') {
    handleSignoutClick()
  }
}

// ─── Drive conflict-resolution modal ─────────────────────────────────────────

const showConflictModal = computed({
  get:  () => !!pendingConflict.value,
  set:  (val) => { if (!val) resolveConflict(false) },
})

// ─── Mount ────────────────────────────────────────────────────────────────────

let gapiPollInterval: number | null = null

function handleSyncComplete() {
  loadToday()
  loadSettings()
}

onMounted(() => {
  initTheme()
  loadSettings()
  loadToday()

  // Refresh today's entries and settings after a Drive sync or local backup import/delete
  window.addEventListener('brm_sync_complete', handleSyncComplete)

  // Init Google API once both gapi and google.accounts are loaded
  gapiPollInterval = window.setInterval(() => {
    if (window.gapi && window.google) {
      if (gapiPollInterval !== null) clearInterval(gapiPollInterval)
      initGoogleApi()
    }
  }, 100)
})

onUnmounted(() => {
  window.removeEventListener('brm_sync_complete', handleSyncComplete)
  if (gapiPollInterval !== null) clearInterval(gapiPollInterval)
})
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <div
      class="max-w-md mx-auto h-screen flex flex-col font-sans transition-colors duration-500 relative overflow-hidden"
      :class="isDarkMode ? 'bg-stone-950 text-stone-200' : 'bg-[#fdfaf5] text-stone-800'"
    >
      <!-- Subtle warm ambient background glow -->
      <div
        class="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-40"
        :class="isDarkMode ? 'bg-amber-900/20' : 'bg-amber-200/50'"
      ></div>
      <div
        class="pointer-events-none absolute top-32 -right-24 w-64 h-64 rounded-full blur-3xl opacity-30"
        :class="isDarkMode ? 'bg-orange-900/20' : 'bg-orange-200/40'"
      ></div>

      <!-- Header -->
      <div class="px-6 pt-10 pb-3 shrink-0 flex items-start justify-between z-20">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <h1 class="font-bold tracking-widest uppercase text-[10px]" :class="isDarkMode ? 'text-stone-400' : 'text-stone-500'">
              Baby Routine Monitor
            </h1>
            <span v-if="isSignedIn" class="text-[9px] font-medium tracking-wide flex items-center gap-1">
              <template v-if="isSyncing">
                <svg class="animate-spin h-2.5 w-2.5" :class="isDarkMode ? 'text-amber-400' : 'text-amber-600'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span :class="isDarkMode ? 'text-stone-400' : 'text-stone-500'">SYNCING</span>
              </template>
              <template v-else-if="syncError">
                <button @click="needsReauth ? handleAuthClick() : syncData()" class="flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline cursor-pointer" :title="syncError ?? ''">
                  <svg class="h-2.5 w-2.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{{ needsReauth ? 'RECONNECT DRIVE' : 'SYNC ERROR' }}</span>
                </button>
              </template>
              <template v-else>
                <svg class="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span :class="isDarkMode ? 'text-stone-500' : 'text-stone-400'">SYNCED</span>
              </template>
            </span>
          </div>
          <p class="text-sm font-semibold" :class="isDarkMode ? 'text-stone-300' : 'text-stone-600'">{{ dateString }}</p>
        </div>
        <n-dropdown :options="dropdownOptions" @select="handleDropdownSelect" placement="bottom-end" trigger="click">
          <button
            class="w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm shrink-0 border"
            :class="isDarkMode ? 'bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800' : 'bg-[#fffdf9] border-amber-900/10 text-stone-600 hover:bg-amber-50/70'"
            aria-label="Settings menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>
        </n-dropdown>
      </div>

      <!-- Clock & Next Feed Timing Status -->
      <div class="px-6 pb-4 pt-1 shrink-0 flex flex-col items-center justify-center relative z-20">
        <div class="flex items-baseline">
          <span class="text-[72px] font-black tabular-nums tracking-tighter drop-shadow-sm leading-none" :class="isDarkMode ? 'text-amber-50' : 'text-stone-800'">{{ timeParts.time }}</span>
          <span class="text-xl font-bold ml-2" :class="isDarkMode ? 'text-amber-400/70' : 'text-amber-800/60'">{{ timeParts.ampm }}</span>
        </div>

        <!-- Next Feed Timing Status Pill -->
        <button
          type="button"
          @click="openSettingsModal"
          class="mt-2.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold tracking-wide flex items-center gap-2 transition-all active:scale-95 border shadow-xs"
          :class="
            !nextFeedStatus.hasFeed
              ? isDarkMode
                ? 'bg-stone-900/90 border-stone-800 text-stone-400 hover:bg-stone-800'
                : 'bg-[#fffdf9] border-amber-900/10 text-stone-500 hover:bg-amber-50/70'
              : nextFeedStatus.isDue
                ? isDarkMode
                  ? 'bg-orange-950/80 border-orange-700/60 text-orange-300'
                  : 'bg-orange-100/90 border-orange-300 text-orange-800'
                : isDarkMode
                  ? 'bg-amber-950/60 border-amber-800/50 text-amber-200 hover:bg-amber-950/90'
                  : 'bg-amber-100/75 border-amber-300/70 text-amber-900 hover:bg-amber-100'
          "
          title="Tap to configure feed interval"
        >
          <span>🍼</span>
          <template v-if="nextFeedStatus.hasFeed">
            <span>
              Next feed at <strong class="font-black tabular-nums">{{ nextFeedStatus.nextTimeStr }}</strong>
            </span>
            <span class="opacity-50">•</span>
            <span :class="nextFeedStatus.isDue ? 'font-black underline decoration-dotted' : 'opacity-85'">
              {{ nextFeedStatus.relativeStr }}
            </span>
          </template>
          <template v-else>
            <span>No feed logged yet • Every {{ formattedIntervalLabel }}</span>
          </template>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex-1 min-h-0 w-full flex flex-col relative z-10 overflow-hidden">
        <n-tabs type="segment" justify-content="space-evenly" class="mb-2 flex flex-col h-full" pane-wrapper-style="flex: 1; min-height: 0;" pane-style="height: 100%;">

          <!-- Today tab -->
          <n-tab-pane name="today" tab="Today" display-directive="show">
            <div class="w-full h-full overflow-y-auto no-scrollbar px-4 pb-32 pt-2 flex flex-col gap-4 transition-colors duration-500">

              <!-- Warm & Homey Log Feed / Log Diaper Action Cards -->
              <div class="grid grid-cols-2 gap-3.5">
                <!-- Log Feed Card -->
                <button
                  type="button"
                  @click="logModal.openFeed()"
                  class="group relative overflow-hidden rounded-3xl p-4 text-left shadow-md hover:shadow-lg active:scale-[0.98] transition-all border border-amber-500/20 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 dark:from-amber-700 dark:via-orange-800 dark:to-amber-900 text-white"
                >
                  <div class="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/15 blur-xl pointer-events-none"></div>
                  <div class="flex flex-col justify-between h-full gap-3 relative z-10">
                    <div class="flex items-center justify-between">
                      <span class="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner">
                        🍼
                      </span>
                      <span class="px-2.5 py-1 rounded-full bg-white/20 text-[10px] font-extrabold uppercase tracking-wider">
                        + Log
                      </span>
                    </div>
                    <div>
                      <div class="text-base font-black tracking-tight leading-snug">
                        Log Feed
                      </div>
                      <div class="text-[11px] font-semibold text-amber-100/90 mt-0.5 truncate">
                        {{ latestFeed ? `Last: ${formatTimeAgo(latestFeed.timestamp, now.getTime())}` : 'Bottle or Latching' }}
                      </div>
                    </div>
                  </div>
                </button>

                <!-- Log Diaper Card -->
                <button
                  type="button"
                  @click="logModal.openDiaper()"
                  class="group relative overflow-hidden rounded-3xl p-4 text-left shadow-md hover:shadow-lg active:scale-[0.98] transition-all border border-emerald-600/20 bg-gradient-to-br from-emerald-600 via-teal-600 to-stone-600 dark:from-emerald-800 dark:via-teal-900 dark:to-stone-800 text-white"
                >
                  <div class="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/15 blur-xl pointer-events-none"></div>
                  <div class="flex flex-col justify-between h-full gap-3 relative z-10">
                    <div class="flex items-center justify-between">
                      <span class="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl shadow-inner">
                        🧸
                      </span>
                      <span class="px-2.5 py-1 rounded-full bg-white/20 text-[10px] font-extrabold uppercase tracking-wider">
                        + Log
                      </span>
                    </div>
                    <div>
                      <div class="text-base font-black tracking-tight leading-snug">
                        Log Diaper
                      </div>
                      <div class="text-[11px] font-semibold text-emerald-100/90 mt-0.5 truncate">
                        {{ latestDiaper ? `Last: ${formatTimeAgo(latestDiaper.timestamp, now.getTime())}` : 'Wet or Soiled' }}
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <!-- Empty state if no logs today -->
              <div
                v-if="todayEntries.length === 0"
                class="flex flex-col items-center justify-center py-12 px-6 gap-2.5 rounded-3xl border border-dashed"
                :class="isDarkMode ? 'border-stone-800 bg-stone-900/40' : 'border-amber-900/15 bg-[#fffdf9]/70'"
              >
                <div
                  class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                  :class="isDarkMode ? 'bg-stone-800' : 'bg-amber-100/70'"
                >
                  🏡
                </div>
                <p class="text-sm font-bold" :class="isDarkMode ? 'text-stone-300' : 'text-stone-700'">
                  No entries logged yet today
                </p>
                <p class="text-xs text-center leading-relaxed" :class="isDarkMode ? 'text-stone-500' : 'text-stone-500'">
                  Tap <strong>Log Feed</strong> or <strong>Log Diaper</strong> above to record today's routine.
                </p>
              </div>

              <!-- Today's Activity Log -->
              <div v-else class="flex flex-col gap-2.5 mt-1">
                <div class="flex items-center justify-between px-1">
                  <h2 class="text-xs font-extrabold uppercase tracking-widest" :class="isDarkMode ? 'text-stone-400' : 'text-stone-500'">
                    Today's Activity ({{ todayEntries.length }})
                  </h2>
                  <span class="text-[10px] font-bold" :class="isDarkMode ? 'text-stone-500' : 'text-stone-400'">
                    Tap item to edit
                  </span>
                </div>

                <n-card
                  v-for="entry in todayEntries"
                  :key="entry.id"
                  @click="logModal.openEdit(entry)"
                  class="w-full rounded-2xl shadow-sm border cursor-pointer active:scale-[0.99] transition-all"
                  :class="
                    isDarkMode
                      ? 'bg-stone-900 border-stone-800 hover:bg-stone-800/80'
                      : 'bg-[#fffdf9] border-amber-900/10 hover:bg-amber-50/40'
                  "
                  :bordered="false"
                  size="small"
                >
                  <div class="flex justify-between items-center px-2 py-0.5">
                    <!-- Left: Icon + Time + Badge -->
                    <div class="flex items-center gap-3">
                      <div
                        class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                        :class="
                          entry.type === 'feed'
                            ? 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        "
                      >
                        {{ entry.type === 'feed' ? (entry.feedingMethod === 'latch' ? '🤱' : '🍼') : '🧸' }}
                      </div>
                      <div class="flex flex-col">
                        <div class="flex items-center gap-1.5 text-xs font-bold" :class="isDarkMode ? 'text-stone-200' : 'text-stone-700'">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {{ formatTime(entry.timestamp) }}
                        </div>
                        <span
                          class="text-[10px] font-extrabold uppercase tracking-widest mt-0.5"
                          :class="entry.type === 'feed' ? describeFeed(entry).cls : describeDiaper(entry).cls"
                        >
                          {{ entry.type === 'feed' ? describeFeed(entry).label : describeDiaper(entry).label }}
                        </span>
                      </div>
                    </div>

                    <!-- Right: Value / Status -->
                    <div class="flex items-center gap-2">
                      <template v-if="entry.type === 'feed'">
                        <div v-if="entry.feedingMethod === 'bottle'" class="flex items-baseline gap-1">
                          <span class="text-xl font-black tabular-nums" :class="isDarkMode ? 'text-amber-100' : 'text-stone-800'">
                            {{ getBottleAmounts(entry).totalMl }}
                          </span>
                          <span class="text-[10px] font-bold text-stone-400 uppercase">ml</span>
                        </div>
                        <div v-else class="flex items-baseline gap-1">
                          <span class="text-lg font-black tabular-nums" :class="isDarkMode ? 'text-amber-100' : 'text-stone-800'">
                            {{ entry.durationMinutes ? `${entry.durationMinutes}m` : 'Latch' }}
                          </span>
                        </div>
                      </template>
                      <template v-else>
                        <div class="flex items-center gap-1">
                          <span
                            v-if="entry.hasUrine"
                            class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                          >
                            💧 Wet
                          </span>
                          <span
                            v-if="entry.hasPoop"
                            class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                          >
                            💩 Poop
                          </span>
                        </div>
                      </template>
                    </div>
                  </div>
                </n-card>
              </div>

            </div>
          </n-tab-pane>

          <!-- History tab -->
          <n-tab-pane name="history" tab="History">
            <div class="w-full h-full overflow-y-auto no-scrollbar pb-32 transition-colors duration-500">
              <HistoryTab />
            </div>
          </n-tab-pane>

          <!-- Manage tab -->
          <n-tab-pane name="manage" tab="Manage">
            <div class="w-full h-full overflow-y-auto no-scrollbar pb-32 transition-colors duration-500">
              <ManageTab />
            </div>
          </n-tab-pane>

        </n-tabs>
      </div>

      <!-- ── Log / Edit Modal ─────────────────────────────────────────────── -->
      <LogEntryModal :modal="logModal" :is-dark-mode="isDarkMode" />

      <!-- ── Settings Modal (Feed Interval Configuration) ─────────────────── -->
      <n-modal v-model:show="showSettingsModal">
        <n-card
          style="width: 350px; border-radius: 28px;"
          title="Routine Settings"
          :bordered="false"
          size="huge"
          role="dialog"
          aria-modal="true"
          class="shadow-2xl"
        >
          <div class="flex flex-col gap-5 pt-1">
            <div>
              <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-1 block">
                Feed Interval
              </label>
              <p class="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-relaxed">
                Configure how far apart each feed should be to calculate the next feed timing below the clock.
              </p>

              <!-- Quick Presets -->
              <div class="grid grid-cols-5 gap-1.5 mb-3">
                <button
                  v-for="preset in [
                    { label: '2h', mins: 120 },
                    { label: '2.5h', mins: 150 },
                    { label: '3h', mins: 180 },
                    { label: '3.5h', mins: 210 },
                    { label: '4h', mins: 240 },
                  ]"
                  :key="preset.mins"
                  type="button"
                  @click="applyIntervalPreset(preset.mins)"
                  class="py-2 rounded-xl font-extrabold text-xs border-2 transition-all active:scale-95"
                  :class="
                    formIntervalHours * 60 + formIntervalMins === preset.mins
                      ? 'border-amber-600 bg-amber-50/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-xs'
                      : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                  "
                >
                  {{ preset.label }}
                </button>
              </div>

              <!-- Custom Hours & Minutes Stepper -->
              <div class="flex items-center gap-2 bg-stone-100 dark:bg-stone-800 rounded-2xl p-2.5">
                <button
                  type="button"
                  @click="adjustIntervalMinutes(-15)"
                  class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-xs font-black text-stone-600 dark:text-stone-200 select-none"
                >
                  −15m
                </button>

                <div class="flex-1 flex items-center justify-center gap-2 min-w-0">
                  <div class="flex flex-col items-center">
                    <input
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="24"
                      v-model.number="formIntervalHours"
                      class="w-14 bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-[9px] font-bold text-stone-400 uppercase tracking-widest -mt-1">HRS</span>
                  </div>
                  <span class="text-xl font-black text-stone-400 mb-3">:</span>
                  <div class="flex flex-col items-center">
                    <input
                      type="number"
                      inputmode="numeric"
                      step="5"
                      min="0"
                      max="59"
                      v-model.number="formIntervalMins"
                      class="w-14 bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-[9px] font-bold text-stone-400 uppercase tracking-widest -mt-1">MINS</span>
                  </div>
                </div>

                <button
                  type="button"
                  @click="adjustIntervalMinutes(15)"
                  class="shrink-0 w-11 h-11 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-xs font-black text-stone-600 dark:text-stone-200 select-none"
                >
                  +15m
                </button>
              </div>
            </div>

            <!-- Error Banner -->
            <div
              v-if="settingsError"
              class="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-semibold flex items-start gap-2 leading-tight"
            >
              <span>{{ settingsError }}</span>
            </div>
          </div>

          <template #footer>
            <div class="flex items-center gap-3 mt-2 w-full justify-end">
              <n-button size="large" @click="showSettingsModal = false" class="font-bold">Cancel</n-button>
              <n-button
                color="#d97706"
                text-color="#ffffff"
                size="large"
                @click="saveSettings"
                class="font-bold px-6 shadow-md"
              >
                Save
              </n-button>
            </div>
          </template>
        </n-card>
      </n-modal>

      <!-- ── Drive Conflict Resolution Modal ──────────────────────────────── -->
      <n-modal v-model:show="showConflictModal">
        <n-card
          style="width: 340px; border-radius: 28px;"
          title="Google Drive Backup Found"
          :bordered="false"
          size="medium"
          role="dialog"
          aria-modal="true"
          class="shadow-2xl"
        >
          <div class="flex flex-col gap-3 pt-1">
            <p class="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
              A backup already exists in Google Drive. How would you like to proceed?
            </p>
            <ul class="text-xs text-stone-500 dark:text-stone-400 space-y-1 list-disc list-inside">
              <li><strong>Overwrite local</strong> — replace this device's data with the Drive backup.</li>
              <li><strong>Keep local</strong> — merge Drive data in, local entries take priority.</li>
            </ul>
          </div>
          <template #footer>
            <div class="flex items-center gap-3 mt-2 w-full justify-end">
              <n-button size="large" @click="resolveConflict(false)" class="font-bold">Keep Local</n-button>
              <n-button type="primary" size="large" @click="resolveConflict(true)" class="font-bold px-6 shadow-md">Overwrite Local</n-button>
            </div>
          </template>
        </n-card>
      </n-modal>

    </div>
  </n-config-provider>
</template>

<style>
.n-tabs-nav { padding: 0 16px !important; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
