import { formatRelativeTime } from './formatRelativeTime'

const now = new Date('2026-10-05T12:00:00.000Z')

function ago(seconds: number): string {
  return new Date(now.getTime() - seconds * 1000).toISOString()
}

describe('formatRelativeTime', () => {
  it('uses seconds under a minute', () => {
    expect(formatRelativeTime(ago(30), now)).toBe('há 30 segundos')
    expect(formatRelativeTime(ago(59), now)).toBe('há 59 segundos')
  })

  it('switches to minutes at a minute', () => {
    expect(formatRelativeTime(ago(60), now)).toBe('há 1 minuto')
    expect(formatRelativeTime(ago(90 * 60), now)).toBe('há 1 hora')
  })

  it('switches to hours and then days', () => {
    expect(formatRelativeTime(ago(3 * 60 * 60), now)).toBe('há 3 horas')
    expect(formatRelativeTime(ago(25 * 60 * 60), now)).toBe('ontem')
    expect(formatRelativeTime(ago(2 * 24 * 60 * 60), now)).toBe('anteontem')
  })

  // numeric: 'auto' gives the idiomatic form for a single unit ("semana
  // passada" rather than "há 1 semana"), which is what a reader expects.
  it('uses weeks and months for older posts', () => {
    expect(formatRelativeTime(ago(8 * 24 * 60 * 60), now)).toBe('semana passada')
    expect(formatRelativeTime(ago(15 * 24 * 60 * 60), now)).toBe('há 2 semanas')
    expect(formatRelativeTime(ago(40 * 24 * 60 * 60), now)).toBe('mês passado')
    expect(formatRelativeTime(ago(70 * 24 * 60 * 60), now)).toBe('há 2 meses')
  })

  it('uses years past a year', () => {
    expect(formatRelativeTime(ago(400 * 24 * 60 * 60), now)).toBe('ano passado')
    expect(formatRelativeTime(ago(800 * 24 * 60 * 60), now)).toBe('há 2 anos')
  })

  it('reads a just-published post as now, never as the future', () => {
    expect(formatRelativeTime(now.toISOString(), now)).toBe('agora')
    // A clock skew that puts the post slightly ahead must not produce
    // "em 3 segundos".
    expect(formatRelativeTime(ago(-3), now)).toBe('agora')
  })
})
