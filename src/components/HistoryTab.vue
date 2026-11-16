<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NCard, NEmpty } from 'naive-ui'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type TooltipItem,
} from 'chart.js'

import { loadAllEntries } from '../composables/useRoutineLogs'
import {
  describeFeed,
  describeDiaper,
  formatTime,
  formatDateKey,
  getBottleAmounts,
  type RoutineEntryWithMeta,
  type FeedEntry,
} from '../utils/baby'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// ── State ─────────────────────────────────────────────────────────────────────

const allEntries = ref<RoutineEntryWithMeta[]>([])
const chartMode = ref<'36h' | '7d'>('36h')
const activityFilter = ref<'all' | 'feed' | 'diaper'>('all')

function loadData() {
  allEntries.value = loadAllEntries()
}

// ── 36-Hour KPI Summary ───────────────────────────────────────────────────────

const recent36hStats = computed(() => {
  const cutoff = Date.now() - 36 * 60 * 60 * 1000
  const recent = allEntries.value.filter(e => e.timestamp >= cutoff)

  let totalMl = 0
  let breastMl = 0
  let formulaMl = 0
  let bottleCount = 0
  let latchCount = 0
  let diaperCount = 0
  let urineCount = 0
  let poopCount = 0

  for (const e of recent) {
    if (e.type === 'feed') {
      if (e.feedingMethod === 'bottle') {
        bottleCount++
        const amounts = getBottleAmounts(e)
        totalMl += amounts.totalMl
        breastMl += amounts.breastMl
        formulaMl += amounts.formulaMl
      } else {
        latchCount++
      }
    } else {
      diaperCount++
      if (e.hasUrine) urineCount++
      if (e.hasPoop) poopCount++
    }
  }

  return {
    totalMl,
    breastMl,
    formulaMl,
    feedCount: bottleCount + latchCount,
    bottleCount,
    latchCount,
    diaperCount,
    urineCount,
    poopCount,
  }
})

// ── Chart: Last 36 Hours (Milk Intake Trend) ──────────────────────────────────

const recent36hFeeds = computed(() => {
  const cutoff = Date.now() - 36 * 60 * 60 * 1000
  return allEntries.value
    .filter((e): e is FeedEntry & { dateKey: string; index: number } => e.type === 'feed' && e.timestamp >= cutoff)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
})

const chartData36h = computed(() => {
  const feeds = recent36hFeeds.value
  return {
    labels: feeds.map(f => {
      const d = new Date(f.timestamp)
      return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(f.timestamp)}`
    }),
    datasets: [
      {
        label: 'Total Milk (ml)',
        data: feeds.map(f => {
          if (f.feedingMethod !== 'bottle') return null
          const { totalMl } = getBottleAmounts(f)
          return totalMl > 0 ? totalMl : null
        }),
        borderColor: '#c2410c',
        backgroundColor: 'rgba(194, 65, 12, 0.14)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true,
        fill: true,
      },
      {
        label: 'Breast Milk (ml)',
        data: feeds.map(f => {
          if (f.feedingMethod !== 'bottle') return null
          const { breastMl } = getBottleAmounts(f)
          return breastMl > 0 ? breastMl : null
        }),
        borderColor: '#d97706',
        backgroundColor: 'rgba(217, 119, 6, 0.1)',
        borderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 5.5,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
      {
        label: 'Formula Milk (ml)',
        data: feeds.map(f => {
          if (f.feedingMethod !== 'bottle') return null
          const { formulaMl } = getBottleAmounts(f)
          return formulaMl > 0 ? formulaMl : null
        }),
        borderColor: '#eab308',
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        borderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 5.5,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
      {
        label: 'Latching (mins)',
        data: feeds.map(f =>
          f.feedingMethod === 'latch' ? (f.durationMinutes && f.durationMinutes > 0 ? f.durationMinutes : 15) : null
        ),
        borderColor: '#15803d',
        backgroundColor: 'rgba(21, 128, 61, 0.12)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true,
        fill: false,
      },
    ],
  }
})

const chartOptions36h = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
      labels: { boxWidth: 10, font: { size: 11, weight: 'bold' as const } },
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        afterBody: (items: TooltipItem<'line'>[]) => {
          const first = items[0]
          if (!first) return ''
          const feed = recent36hFeeds.value[first.dataIndex]
          if (!feed) return ''
          if (feed.feedingMethod === 'latch') {
            const side = feed.breastSide ? ` (${feed.breastSide.toUpperCase()} side)` : ''
            const dur = feed.durationMinutes ? `${feed.durationMinutes} mins` : 'Logged latch'
            return `Direct Latch: ${dur}${side}`
          }
          const { breastMl, formulaMl, totalMl } = getBottleAmounts(feed)
          if (breastMl > 0 && formulaMl > 0) {
            return `Combined Bottle: ${totalMl} ml (${breastMl}ml Breast + ${formulaMl}ml Formula)`
          }
          const milk = formulaMl > 0 ? 'Formula Milk' : 'Breast Milk'
          return `Bottle: ${totalMl} ml (${milk})`
        },
      },
    },
  },
  scales: {
    x: {
      ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } },
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: 'ml / mins', font: { size: 11, weight: 'bold' as const } },
    },
  },
}))

// ── Chart: Last 7 Days (Daily Milk Intake Trend) ──────────────────────────────

interface DailyBucket {
  dateKey: string
  shortLabel: string
  breastMl: number
  formulaMl: number
  latchCount: number
  diaperCount: number
}

const daily7dBuckets = computed<DailyBucket[]>(() => {
  const buckets: DailyBucket[] = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = formatDateKey(d)
    const shortLabel = `${d.getMonth() + 1}/${d.getDate()}`
    buckets.push({
      dateKey: key,
      shortLabel,
      breastMl: 0,
      formulaMl: 0,
      latchCount: 0,
      diaperCount: 0,
    })
  }

  const map = new Map<string, DailyBucket>()
  for (const b of buckets) {
    map.set(b.dateKey, b)
  }

  for (const e of allEntries.value) {
    const bucket = map.get(e.dateKey)
    if (!bucket) continue
    if (e.type === 'feed') {
      if (e.feedingMethod === 'bottle') {
        const amounts = getBottleAmounts(e)
        bucket.breastMl += amounts.breastMl
        bucket.formulaMl += amounts.formulaMl
      } else {
        bucket.latchCount++
      }
    } else {
      bucket.diaperCount++
    }
  }

  return buckets
})

const chartData7d = computed(() => ({
  labels: daily7dBuckets.value.map(b => b.shortLabel),
  datasets: [
    {
      label: 'Total Milk (ml)',
      data: daily7dBuckets.value.map(b => b.breastMl + b.formulaMl),
      borderColor: '#c2410c',
      backgroundColor: 'rgba(194, 65, 12, 0.14)',
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      fill: true,
    },
    {
      label: 'Breast Milk (ml)',
      data: daily7dBuckets.value.map(b => b.breastMl),
      borderColor: '#d97706',
      backgroundColor: 'rgba(217, 119, 6, 0.08)',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
    },
    {
      label: 'Formula Milk (ml)',
      data: daily7dBuckets.value.map(b => b.formulaMl),
      borderColor: '#eab308',
      backgroundColor: 'rgba(234, 179, 8, 0.08)',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
    },
  ],
}))

const chartOptions7d = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
      labels: { boxWidth: 10, font: { size: 11, weight: 'bold' as const } },
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        afterBody: (items: TooltipItem<'line'>[]) => {
          const first = items[0]
          if (!first) return ''
          const b = daily7dBuckets.value[first.dataIndex]
          if (!b) return ''
          return [
            `Latch Feeds: ${b.latchCount}`,
            `Diapers Changed: ${b.diaperCount}`,
          ]
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Milk Intake (ml)', font: { size: 11, weight: 'bold' as const } },
    },
  },
}))

const hasChartData = computed(() => {
  if (chartMode.value === '36h') {
    return recent36hFeeds.value.length > 0
  }
  return daily7dBuckets.value.some(b => b.breastMl > 0 || b.formulaMl > 0 || b.latchCount > 0)
})

// ── Filtered Activity List ────────────────────────────────────────────────────

const filteredEntries = computed(() => {
  if (activityFilter.value === 'all') return allEntries.value
  return allEntries.value.filter(e => e.type === activityFilter.value)
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  loadData()
  window.addEventListener('brm_sync_complete', loadData)
})

onUnmounted(() => {
  window.removeEventListener('brm_sync_complete', loadData)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto no-scrollbar pb-32 px-4 transition-colors duration-500">

    <!-- 36-Hour KPI Summary Row -->
    <div class="grid grid-cols-3 gap-2.5 mb-4">
      <div class="rounded-2xl bg-[#fffdf9] dark:bg-stone-900 border border-amber-900/10 dark:border-stone-800 p-3 shadow-sm flex flex-col">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">36h Milk</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-black tabular-nums text-amber-700 dark:text-amber-400">
            {{ recent36hStats.totalMl }}
          </span>
          <span class="text-[10px] font-bold text-stone-400 uppercase">ml</span>
        </div>
        <span class="text-[10px] text-stone-400 font-semibold truncate">
          {{ recent36hStats.breastMl }}B / {{ recent36hStats.formulaMl }}F
        </span>
      </div>

      <div class="rounded-2xl bg-[#fffdf9] dark:bg-stone-900 border border-amber-900/10 dark:border-stone-800 p-3 shadow-sm flex flex-col">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">36h Feeds</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-black tabular-nums text-orange-700 dark:text-orange-400">
            {{ recent36hStats.feedCount }}
          </span>
          <span class="text-[10px] font-bold text-stone-400 uppercase">total</span>
        </div>
        <span class="text-[10px] text-stone-400 font-semibold truncate">
          {{ recent36hStats.bottleCount }} bottle • {{ recent36hStats.latchCount }} latch
        </span>
      </div>

      <div class="rounded-2xl bg-[#fffdf9] dark:bg-stone-900 border border-amber-900/10 dark:border-stone-800 p-3 shadow-sm flex flex-col">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">36h Diapers</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
            {{ recent36hStats.diaperCount }}
          </span>
          <span class="text-[10px] font-bold text-stone-400 uppercase">changes</span>
        </div>
        <span class="text-[10px] text-stone-400 font-semibold truncate">
          💧{{ recent36hStats.urineCount }} • 💩{{ recent36hStats.poopCount }}
        </span>
      </div>
    </div>

    <!-- Chart card -->
    <n-card
      class="w-full mb-6 rounded-3xl shadow-sm border border-amber-900/10 dark:border-stone-800 bg-[#fffdf9] dark:bg-stone-900"
      :bordered="false"
      size="small"
    >
      <div class="flex items-center justify-between mb-4 px-1">
        <h3 class="text-base font-extrabold tracking-tight text-stone-800 dark:text-stone-100">
          {{ chartMode === '36h' ? 'Milk Intake Trend (36h)' : 'Daily Milk Intake (7d)' }}
        </h3>
        <div class="flex bg-[#f3ece1] dark:bg-stone-800 p-0.5 rounded-xl">
          <button
            type="button"
            @click="chartMode = '36h'"
            class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all"
            :class="
              chartMode === '36h'
                ? 'bg-[#fffdf9] dark:bg-stone-700 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 dark:text-stone-400'
            "
          >
            36h
          </button>
          <button
            type="button"
            @click="chartMode = '7d'"
            class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all"
            :class="
              chartMode === '7d'
                ? 'bg-[#fffdf9] dark:bg-stone-700 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 dark:text-stone-400'
            "
          >
            7 Days
          </button>
        </div>
      </div>

      <div v-if="hasChartData" class="h-56">
        <Line
          v-if="chartMode === '36h'"
          :data="chartData36h"
          :options="chartOptions36h"
        />
        <Line
          v-else
          :data="chartData7d"
          :options="chartOptions7d"
        />
      </div>
      <n-empty v-else description="No feed data in this range yet" class="my-6" />
    </n-card>

    <!-- All Activity Header + Filter Pills -->
    <div class="flex items-center justify-between mb-3 px-1">
      <h3 class="text-lg font-bold text-stone-800 dark:text-stone-100">All Activity</h3>
      <div class="flex items-center gap-1.5 bg-[#f3ece1] dark:bg-stone-800 p-1 rounded-xl">
        <button
          v-for="tab in ([
            { key: 'all', label: 'All' },
            { key: 'feed', label: 'Feeds' },
            { key: 'diaper', label: 'Diapers' },
          ] as const)"
          :key="tab.key"
          type="button"
          @click="activityFilter = tab.key"
          class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all"
          :class="
            activityFilter === tab.key
              ? 'bg-[#fffdf9] dark:bg-stone-700 text-amber-800 dark:text-amber-300 shadow-sm'
              : 'text-stone-500 dark:text-stone-400'
          "
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <n-empty v-if="filteredEntries.length === 0" description="No historical entries found" />

    <div v-else class="flex flex-col gap-3">
      <n-card
        v-for="entry in filteredEntries"
        :key="entry.id"
        class="w-full rounded-2xl shadow-sm border border-amber-900/10 dark:border-stone-800 bg-[#fffdf9] dark:bg-stone-900"
        :bordered="false"
        size="small"
      >
        <div class="flex justify-between items-center px-2 py-1">
          <!-- Left: Icon + Date/Time + Category Badge -->
          <div class="flex items-center gap-3">
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

            <div class="flex flex-col">
              <div class="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-2">
                <span>{{ entry.dateKey }}</span>
                <span class="w-1 h-1 rounded-full bg-stone-300 dark:bg-stone-600"></span>
                <span>{{ formatTime(entry.timestamp) }}</span>
              </div>
              <span
                class="text-[11px] font-extrabold uppercase tracking-widest mt-0.5"
                :class="
                  entry.type === 'feed'
                    ? describeFeed(entry).cls
                    : describeDiaper(entry).cls
                "
              >
                {{ entry.type === 'feed' ? describeFeed(entry).label : describeDiaper(entry).label }}
              </span>
            </div>
          </div>

          <!-- Right: Value -->
          <div class="flex items-end gap-1">
            <template v-if="entry.type === 'feed'">
              <template v-if="entry.feedingMethod === 'bottle'">
                <span class="text-2xl font-black tabular-nums text-stone-800 dark:text-amber-100">
                  {{ getBottleAmounts(entry).totalMl }}
                </span>
                <span class="ml-0.5 mb-1 text-[10px] font-bold text-stone-400 uppercase self-end">ml</span>
              </template>
              <template v-else>
                <span class="text-xl font-black tabular-nums text-stone-800 dark:text-amber-100">
                  {{ entry.durationMinutes ? `${entry.durationMinutes}m` : 'Latch' }}
                </span>
              </template>
            </template>
            <template v-else>
              <div class="flex items-center gap-1">
                <span
                  v-if="entry.hasUrine"
                  class="px-2 py-0.5 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold"
                >
                  💧 Wet
                </span>
                <span
                  v-if="entry.hasPoop"
                  class="px-2 py-0.5 rounded-lg bg-amber-100/80 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-xs font-extrabold"
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
</template>
