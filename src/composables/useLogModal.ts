import { ref, computed } from 'vue'
import {
  type RoutineEntry,
  type FeedEntry,
  type DiaperEntry,
  type FeedingMethod,
  type MilkType,
  type BreastSide,
  createEntryId,
  getBottleAmounts,
} from '../utils/baby'

/**
 * Manages all state and validation for logging or editing either a
 * `FeedEntry` or a `DiaperEntry` on the Today tab.
 *
 * @param onSave - Callback invoked when the user saves. Receives the constructed
 *                 `RoutineEntry` and `isEdit` (`true` when editing an existing entry).
 */
export function useLogModal(onSave: (entry: RoutineEntry, isEdit: boolean) => void) {
  const showModal        = ref(false)
  const editingId        = ref<string | null>(null)
  const entryType        = ref<'feed' | 'diaper'>('feed')
  const formTimeMs       = ref<number>(Date.now())

  // Feed fields
  const feedingMethod    = ref<FeedingMethod>('bottle')
  // Bottle milk selection (multi-select: user can select breast, formula, or both)
  const hasBreastMilk    = ref<boolean>(true)
  const hasFormulaMilk   = ref<boolean>(false)
  const breastAmountMl   = ref<number | null>(90)
  const formulaAmountMl  = ref<number | null>(60)

  // Latch fields
  const durationMinutes  = ref<number | null>(15)
  const breastSide       = ref<BreastSide>('both')

  // Diaper fields
  const hasUrine         = ref<boolean>(true)
  const hasPoop          = ref<boolean>(false)

  const formError        = ref('')

  // ── Two-way computed so the template can bind a <input type="time"> ────────

  const formTimeString = computed<string>({
    get: () => {
      const d = new Date(formTimeMs.value)
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    },
    set: (val) => {
      if (!val) {
        formTimeMs.value = Date.now()
        return
      }
      const [h = 0, m = 0] = val.split(':').map(Number)
      const d = new Date(formTimeMs.value)
      d.setHours(h, m, 0, 0)
      formTimeMs.value = d.getTime()
    },
  })

  function setTimeToNow() {
    formTimeMs.value = Date.now()
  }

  function adjustBreastAmount(delta: number) {
    breastAmountMl.value = Math.max(0, (breastAmountMl.value ?? 0) + delta)
  }

  function adjustFormulaAmount(delta: number) {
    formulaAmountMl.value = Math.max(0, (formulaAmountMl.value ?? 0) + delta)
  }

  function adjustDuration(delta: number) {
    durationMinutes.value = Math.max(0, (durationMinutes.value ?? 0) + delta)
  }

  // ── Open ──────────────────────────────────────────────────────────────────

  /** Open modal for a brand-new feeding entry. */
  function openFeed(defaultMethod: FeedingMethod = 'bottle') {
    editingId.value       = null
    entryType.value       = 'feed'
    formTimeMs.value      = Date.now()
    feedingMethod.value   = defaultMethod
    hasBreastMilk.value   = true
    hasFormulaMilk.value  = false
    breastAmountMl.value  = 90
    formulaAmountMl.value = 60
    durationMinutes.value = 15
    breastSide.value      = 'both'
    formError.value       = ''
    showModal.value       = true
  }

  /** Open modal for a brand-new diaper entry. */
  function openDiaper() {
    editingId.value  = null
    entryType.value  = 'diaper'
    formTimeMs.value = Date.now()
    hasUrine.value   = true
    hasPoop.value    = false
    formError.value  = ''
    showModal.value  = true
  }

  /** Open modal pre-filled with an existing entry for in-place editing. */
  function openEdit(entry: RoutineEntry) {
    editingId.value  = entry.id
    entryType.value  = entry.type
    formTimeMs.value = entry.timestamp
    formError.value  = ''

    if (entry.type === 'feed') {
      feedingMethod.value   = entry.feedingMethod
      if (entry.feedingMethod === 'bottle') {
        const { breastMl, formulaMl } = getBottleAmounts(entry)
        hasBreastMilk.value   = breastMl > 0 || (breastMl === 0 && formulaMl === 0)
        hasFormulaMilk.value  = formulaMl > 0
        breastAmountMl.value  = breastMl > 0 ? breastMl : 90
        formulaAmountMl.value = formulaMl > 0 ? formulaMl : 60
      } else {
        hasBreastMilk.value   = true
        hasFormulaMilk.value  = false
        breastAmountMl.value  = 90
        formulaAmountMl.value = 60
      }
      durationMinutes.value = entry.durationMinutes ?? 15
      breastSide.value      = entry.breastSide ?? 'both'
    } else {
      hasUrine.value = entry.hasUrine
      hasPoop.value  = entry.hasPoop
    }

    showModal.value = true
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function save() {
    formError.value = ''
    const isEdit = editingId.value !== null
    const id = editingId.value ?? createEntryId()

    if (entryType.value === 'feed') {
      if (feedingMethod.value === 'bottle') {
        if (!hasBreastMilk.value && !hasFormulaMilk.value) {
          formError.value = 'Please select at least Breast Milk or Formula Milk.'
          return
        }

        const bMl = hasBreastMilk.value ? Math.round(breastAmountMl.value ?? 0) : 0
        const fMl = hasFormulaMilk.value ? Math.round(formulaAmountMl.value ?? 0) : 0

        if (hasBreastMilk.value && bMl <= 0) {
          formError.value = 'Please enter a Breast Milk amount greater than 0 ml.'
          return
        }
        if (hasFormulaMilk.value && fMl <= 0) {
          formError.value = 'Please enter a Formula Milk amount greater than 0 ml.'
          return
        }

        const totalMl = bMl + fMl
        if (totalMl <= 0) {
          formError.value = 'Please enter a bottle amount greater than 0 ml.'
          return
        }

        const milkType: MilkType =
          hasBreastMilk.value && hasFormulaMilk.value
            ? 'both'
            : hasFormulaMilk.value
              ? 'formula'
              : 'breast'

        const entry: FeedEntry = {
          id,
          type: 'feed',
          timestamp: formTimeMs.value,
          feedingMethod: 'bottle',
          milkType,
          amountMl: totalMl,
          ...(bMl > 0 ? { breastAmountMl: bMl } : {}),
          ...(fMl > 0 ? { formulaAmountMl: fMl } : {}),
        }
        onSave(entry, isEdit)
        showModal.value = false
        return
      }

      // feedingMethod === 'latch'
      if (durationMinutes.value !== null && durationMinutes.value < 0) {
        formError.value = 'Duration cannot be negative.'
        return
      }
      const entry: FeedEntry = {
        id,
        type: 'feed',
        timestamp: formTimeMs.value,
        feedingMethod: 'latch',
        ...(durationMinutes.value !== null && durationMinutes.value > 0
          ? { durationMinutes: durationMinutes.value }
          : {}),
        ...(breastSide.value ? { breastSide: breastSide.value } : {}),
      }
      onSave(entry, isEdit)
      showModal.value = false
      return
    }

    // entryType === 'diaper'
    if (!hasUrine.value && !hasPoop.value) {
      formError.value = 'Please select at least Urine or Poop.'
      return
    }

    const entry: DiaperEntry = {
      id,
      type: 'diaper',
      timestamp: formTimeMs.value,
      hasUrine: hasUrine.value,
      hasPoop: hasPoop.value,
    }
    onSave(entry, isEdit)
    showModal.value = false
  }

  function close() {
    showModal.value = false
  }

  return {
    showModal,
    editingId,
    entryType,
    formTimeMs,
    formTimeString,
    feedingMethod,
    hasBreastMilk,
    hasFormulaMilk,
    breastAmountMl,
    formulaAmountMl,
    durationMinutes,
    breastSide,
    hasUrine,
    hasPoop,
    formError,
    openFeed,
    openDiaper,
    openEdit,
    setTimeToNow,
    adjustBreastAmount,
    adjustFormulaAmount,
    adjustDuration,
    save,
    close,
  }
}
