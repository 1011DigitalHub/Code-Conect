// Pure helpers live here rather than in components/: they are not components,
// so atoms/ would be the wrong level, and because this file imports nothing
// it is safe for any level to use.

const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
// Average lengths: good enough for "há 2 meses", and it keeps the thresholds
// monotonic, which exact calendar months would not be.
const MONTH = 30 * DAY
const YEAR = 365 * DAY

const units: { limit: number; seconds: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: MINUTE, seconds: 1, unit: 'second' },
  { limit: HOUR, seconds: MINUTE, unit: 'minute' },
  { limit: DAY, seconds: HOUR, unit: 'hour' },
  { limit: WEEK, seconds: DAY, unit: 'day' },
  { limit: MONTH, seconds: WEEK, unit: 'week' },
  { limit: YEAR, seconds: MONTH, unit: 'month' },
]

// "há 2 dias". `now` is injectable so tests are deterministic — without it
// every assertion would depend on the wall clock.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)

  for (const { limit, seconds, unit } of units) {
    if (elapsed < limit) {
      return formatter.format(-Math.floor(elapsed / seconds), unit)
    }
  }
  return formatter.format(-Math.floor(elapsed / YEAR), 'year')
}
