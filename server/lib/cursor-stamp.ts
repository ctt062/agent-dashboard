const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse Cursor transcript stamps like "Monday, Jul 27, 2026, 9:18 AM (UTC+8)". */
export function localDateFromCursorStamp(raw: string): string | null {
  const m = raw.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})/i)
  if (!m) return null
  const mon = MONTHS[m[1].slice(0, 3)]
  if (mon == null) return null
  const day = Number(m[2])
  const year = Number(m[3])
  if (!year || !day) return null
  return formatLocalDate(new Date(year, mon, day))
}
