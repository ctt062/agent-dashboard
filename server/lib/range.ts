export const DATE_RANGES = ['month'] as const
export type DateRange = (typeof DATE_RANGES)[number]

export function parseRange(_value?: unknown): DateRange {
  return 'month'
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local calendar YYYY-MM-DD for an ISO/RFC3339 (or Date-parseable) timestamp. */
export function localDateFromTimestamp(value: string): string | null {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return formatLocalDate(d)
}

/** Inclusive day count between YYYY-MM-DD start and end (local calendar). */
export function inclusiveDayCount(startYmd: string, endYmd: string): number {
  const [sy, sm, sd] = startYmd.split('-').map(Number)
  const [ey, em, ed] = endYmd.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, diff + 1)
}

/**
 * Start date for a billing-cycle window.
 * Prefers provider cycleStart; falls back to the 1st of the local month.
 */
export function billingCycleStartDate(
  cycleStartIso: string | null | undefined,
  now = new Date(),
): string {
  if (cycleStartIso) {
    const ymd = localDateFromTimestamp(cycleStartIso)
    if (ymd) return ymd
  }
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return formatLocalDate(d)
}

/** Inclusive day count for avg/day math in the billing cycle. */
export function daysInRange(
  _range: DateRange = 'month',
  now = new Date(),
  cycleStartIso?: string | null,
): number {
  const start = billingCycleStartDate(cycleStartIso, now)
  return inclusiveDayCount(start, formatLocalDate(now))
}

/** Inclusive start date (YYYY-MM-DD) for this billing cycle. */
export function rangeStartDate(
  _range: DateRange = 'month',
  now = new Date(),
  cycleStartIso?: string | null,
): string {
  return billingCycleStartDate(cycleStartIso, now)
}

export function rangeLabel(_range: DateRange = 'month'): string {
  return 'This billing cycle'
}
