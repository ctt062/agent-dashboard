export const DATE_RANGES = ['1d', '7d', '30d', 'month'] as const
export type DateRange = (typeof DATE_RANGES)[number]

export function parseRange(value: unknown): DateRange {
  if (typeof value === 'string' && (DATE_RANGES as readonly string[]).includes(value)) {
    return value as DateRange
  }
  return '7d'
}

/** Inclusive day count for avg/day math. */
export function daysInRange(range: DateRange, now = new Date()): number {
  if (range === '1d') return 1
  if (range === '7d') return 7
  if (range === '30d') return 30
  // This month: from the 1st through today (inclusive)
  return Math.max(1, now.getDate())
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

/** Inclusive start date (YYYY-MM-DD) for the selected range ending today. */
export function rangeStartDate(range: DateRange, now = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (range === 'month') {
    d.setDate(1)
    return formatLocalDate(d)
  }
  const days = daysInRange(range, now)
  d.setDate(d.getDate() - (days - 1))
  return formatLocalDate(d)
}

export function rangeLabel(range: DateRange): string {
  if (range === '1d') return 'Today'
  if (range === '7d') return '7 days'
  if (range === '30d') return '30 days'
  return 'This month'
}
