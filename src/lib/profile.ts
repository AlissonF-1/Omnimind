const dayMs = 86_400_000
const dayFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' })
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'long' })

export function profileWeek(logs: { study_date: string; review_count: number | null }[], now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const byDate = new Map(logs.map((log) => [log.study_date.slice(0, 10), log.review_count ?? 0]))
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today - (6 - index) * dayMs)
    const date = day.toISOString().slice(0, 10)
    return {
      date,
      weekday: dayFormatter.format(day).replace('.', ''),
      label: dateFormatter.format(day),
      reviews: byDate.get(date) ?? 0,
    }
  })
}

export function profileLevelProgress(currentLevel: number, totalXp: number) {
  const threshold = (currentLevel - 1) ** 2 * 5
  const target = currentLevel ** 2 * 5 - threshold
  return { value: Math.max(0, Math.min(totalXp - threshold, target)), target }
}
