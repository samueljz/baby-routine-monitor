<script setup lang="ts">
import { NModal, NCard, NButton } from 'naive-ui'
import type { useLogModal } from '../composables/useLogModal'

defineProps<{
  modal: ReturnType<typeof useLogModal>
  isDarkMode: boolean
}>()
</script>

<template>
  <n-modal v-model:show="modal.showModal.value">
    <n-card
      style="width: 350px; border-radius: 28px;"
      :title="
        modal.editingId.value
          ? modal.entryType.value === 'feed'
            ? 'Edit Feed Entry'
            : 'Edit Diaper Entry'
          : modal.entryType.value === 'feed'
            ? 'Log Baby Feed'
            : 'Log Diaper Change'
      "
      :bordered="false"
      size="huge"
      role="dialog"
      aria-modal="true"
      class="shadow-2xl"
    >
      <div class="flex flex-col gap-5 pt-1">

        <!-- Entry Type Switcher (when adding new entry) -->
        <div
          v-if="!modal.editingId.value"
          class="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl"
        >
          <button
            type="button"
            @click="modal.entryType.value = 'feed'; modal.formError.value = ''"
            class="py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            :class="
              modal.entryType.value === 'feed'
                ? 'bg-[#fffdf9] dark:bg-stone-700 text-amber-700 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
            "
          >
            <span>🍼</span>
            <span>Feed</span>
          </button>
          <button
            type="button"
            @click="modal.entryType.value = 'diaper'; modal.formError.value = ''"
            class="py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            :class="
              modal.entryType.value === 'diaper'
                ? 'bg-[#fffdf9] dark:bg-stone-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
            "
          >
            <span>🧸</span>
            <span>Diaper</span>
          </button>
        </div>

        <!-- Time Picker -->
        <div>
          <div class="flex justify-between items-center mb-2">
            <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest">Time</label>
            <button
              type="button"
              @click="modal.setTimeToNow()"
              class="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/40 px-2.5 py-1 rounded-md active:scale-95 transition-transform"
            >
              Now
            </button>
          </div>
          <input
            type="time"
            v-model="modal.formTimeString.value"
            :style="{ colorScheme: isDarkMode ? 'dark' : 'light' }"
            class="w-full rounded-2xl px-4 py-3 text-3xl font-black tabular-nums tracking-tight bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100 border-0 outline-none focus:ring-4 focus:ring-amber-500/30 transition-shadow"
          />
        </div>

        <!-- ── FEED FIELDS ──────────────────────────────────────────────────── -->
        <template v-if="modal.entryType.value === 'feed'">
          <!-- Feeding Method Toggle: Latching vs Bottle Feed -->
          <div>
            <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
              Feeding Method
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                @click="modal.feedingMethod.value = 'bottle'; modal.formError.value = ''"
                class="py-3 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all flex flex-col items-center gap-1 active:scale-95"
                :class="
                  modal.feedingMethod.value === 'bottle'
                    ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 shadow-sm'
                    : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                "
              >
                <span class="text-lg">🍼</span>
                <span>Bottle Feed</span>
              </button>

              <button
                type="button"
                @click="modal.feedingMethod.value = 'latch'; modal.formError.value = ''"
                class="py-3 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all flex flex-col items-center gap-1 active:scale-95"
                :class="
                  modal.feedingMethod.value === 'latch'
                    ? 'border-orange-500 bg-orange-50/80 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 shadow-sm'
                    : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                "
              >
                <span class="text-lg">🤱</span>
                <span>Latching</span>
              </button>
            </div>
          </div>

          <!-- Bottle Feed Conditional Fields: Milk Type (Multi-select) & Amounts (ml) -->
          <template v-if="modal.feedingMethod.value === 'bottle'">
            <div>
              <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
                Type of Milk (Select one or both)
              </label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  @click="modal.hasBreastMilk.value = !modal.hasBreastMilk.value; modal.formError.value = ''"
                  class="py-2.5 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  :class="
                    modal.hasBreastMilk.value
                      ? 'border-amber-600 bg-amber-50/90 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 shadow-sm'
                      : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                  "
                >
                  <span>💧</span>
                  <span>Breast Milk</span>
                </button>

                <button
                  type="button"
                  @click="modal.hasFormulaMilk.value = !modal.hasFormulaMilk.value; modal.formError.value = ''"
                  class="py-2.5 px-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  :class="
                    modal.hasFormulaMilk.value
                      ? 'border-orange-500 bg-orange-50/90 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 shadow-sm'
                      : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                  "
                >
                  <span>✨</span>
                  <span>Formula Milk</span>
                </button>
              </div>
            </div>

            <!-- Breast Milk Amount (ml) Stepper -->
            <div v-if="modal.hasBreastMilk.value">
              <label class="text-xs font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2 block">
                Breast Milk Amount (ml)
              </label>
              <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3 py-2">
                <button
                  type="button"
                  @click="modal.adjustBreastAmount(-10)"
                  class="shrink-0 w-12 h-12 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-base font-black text-stone-600 dark:text-stone-200 select-none"
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
                    v-model.number="modal.breastAmountMl.value"
                    placeholder="90"
                    class="w-full bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 border-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest -mt-1">ML BREAST</span>
                </div>
                <button
                  type="button"
                  @click="modal.adjustBreastAmount(10)"
                  class="shrink-0 w-12 h-12 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-base font-black text-stone-600 dark:text-stone-200 select-none"
                >
                  +10
                </button>
              </div>
            </div>

            <!-- Formula Milk Amount (ml) Stepper -->
            <div v-if="modal.hasFormulaMilk.value">
              <label class="text-xs font-extrabold text-orange-700 dark:text-orange-400 uppercase tracking-widest mb-2 block">
                Formula Milk Amount (ml)
              </label>
              <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3 py-2">
                <button
                  type="button"
                  @click="modal.adjustFormulaAmount(-10)"
                  class="shrink-0 w-12 h-12 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-base font-black text-stone-600 dark:text-stone-200 select-none"
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
                    v-model.number="modal.formulaAmountMl.value"
                    placeholder="60"
                    class="w-full bg-transparent text-center text-3xl font-black tabular-nums text-stone-800 dark:text-stone-100 border-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest -mt-1">ML FORMULA</span>
                </div>
                <button
                  type="button"
                  @click="modal.adjustFormulaAmount(10)"
                  class="shrink-0 w-12 h-12 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-base font-black text-stone-600 dark:text-stone-200 select-none"
                >
                  +10
                </button>
              </div>
            </div>

            <!-- Combined Total Pill when both are selected -->
            <div
              v-if="modal.hasBreastMilk.value && modal.hasFormulaMilk.value"
              class="px-3.5 py-2 rounded-xl bg-amber-100/70 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-xs font-extrabold flex items-center justify-between"
            >
              <span class="uppercase tracking-wider">Total Bottle Volume</span>
              <span class="text-sm font-black tabular-nums">
                {{ Math.max(0, modal.breastAmountMl.value ?? 0) + Math.max(0, modal.formulaAmountMl.value ?? 0) }} ml
              </span>
            </div>
          </template>

          <!-- Latching Conditional Fields: Breast Side & Duration (mins) -->
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
                  @click="modal.breastSide.value = side"
                  class="py-2.5 px-2 rounded-2xl font-extrabold text-xs uppercase tracking-wider border-2 transition-all active:scale-95"
                  :class="
                    modal.breastSide.value === side
                      ? 'border-orange-500 bg-orange-50/80 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 shadow-sm'
                      : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                  "
                >
                  {{ side }}
                </button>
              </div>
            </div>

            <!-- Duration (mins) Stepper -->
            <div>
              <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
                Duration (mins, optional)
              </label>
              <div class="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3 py-2.5">
                <button
                  type="button"
                  @click="modal.adjustDuration(-1)"
                  class="shrink-0 w-12 h-12 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-2xl font-black text-stone-600 dark:text-stone-200 select-none"
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
                    v-model.number="modal.durationMinutes.value"
                    placeholder="15"
                    class="w-full bg-transparent text-center text-4xl font-black tabular-nums text-stone-800 dark:text-stone-100 border-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span class="text-[10px] font-bold text-stone-400 uppercase tracking-widest -mt-1">MINS</span>
                </div>
                <button
                  type="button"
                  @click="modal.adjustDuration(1)"
                  class="shrink-0 w-12 h-12 rounded-xl bg-[#fffdf9] dark:bg-stone-700 shadow-sm active:scale-95 transition-transform flex items-center justify-center text-2xl font-black text-stone-600 dark:text-stone-200 select-none"
                >
                  +
                </button>
              </div>
            </div>
          </template>
        </template>

        <!-- ── DIAPER FIELDS ────────────────────────────────────────────────── -->
        <template v-else>
          <div>
            <label class="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 block">
              Diaper Contents (Select one or both)
            </label>
            <div class="flex flex-col gap-3">
              <!-- Urine (Wet) Toggle Card -->
              <button
                type="button"
                @click="modal.hasUrine.value = !modal.hasUrine.value; modal.formError.value = ''"
                class="w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between active:scale-[0.98]"
                :class="
                  modal.hasUrine.value
                    ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 shadow-sm'
                    : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                "
              >
                <div class="flex items-center gap-3">
                  <span class="w-10 h-10 rounded-xl bg-[#fffdf9] dark:bg-stone-700 flex items-center justify-center text-xl shadow-sm">
                    💧
                  </span>
                  <div class="flex flex-col items-start">
                    <span class="font-extrabold text-sm">Urine (Wet)</span>
                    <span class="text-[11px] opacity-75 font-semibold">Wet diaper</span>
                  </div>
                </div>
                <div
                  class="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  :class="
                    modal.hasUrine.value
                      ? 'bg-emerald-600 text-white'
                      : 'border-2 border-stone-300 dark:border-stone-600'
                  "
                >
                  <svg v-if="modal.hasUrine.value" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              </button>

              <!-- Poop (Dirty) Toggle Card -->
              <button
                type="button"
                @click="modal.hasPoop.value = !modal.hasPoop.value; modal.formError.value = ''"
                class="w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between active:scale-[0.98]"
                :class="
                  modal.hasPoop.value
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 shadow-sm'
                    : 'border-transparent bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                "
              >
                <div class="flex items-center gap-3">
                  <span class="w-10 h-10 rounded-xl bg-[#fffdf9] dark:bg-stone-700 flex items-center justify-center text-xl shadow-sm">
                    💩
                  </span>
                  <div class="flex flex-col items-start">
                    <span class="font-extrabold text-sm">Poop (Dirty)</span>
                    <span class="text-[11px] opacity-75 font-semibold">Soiled diaper</span>
                  </div>
                </div>
                <div
                  class="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  :class="
                    modal.hasPoop.value
                      ? 'bg-amber-600 text-white'
                      : 'border-2 border-stone-300 dark:border-stone-600'
                  "
                >
                  <svg v-if="modal.hasPoop.value" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </template>

        <!-- Error Message Banner -->
        <div
          v-if="modal.formError.value"
          class="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-semibold flex items-start gap-2 leading-tight animate-in fade-in zoom-in-95 duration-200"
        >
          <svg class="shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{{ modal.formError.value }}</span>
        </div>

      </div>

      <template #footer>
        <div class="flex items-center gap-3 mt-2 w-full justify-end">
          <n-button size="large" @click="modal.close()" class="font-bold">Cancel</n-button>
          <n-button
            :color="modal.entryType.value === 'feed' ? '#d97706' : '#059669'"
            text-color="#ffffff"
            size="large"
            @click="modal.save()"
            class="font-bold px-6 shadow-md"
          >
            Save
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>
