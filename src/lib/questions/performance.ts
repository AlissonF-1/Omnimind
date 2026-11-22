export type RecentAttempt = {
  is_correct: boolean
  answered_at: string
  question: { competency_id: string } | null
}

const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo',
})

export function lastStudyDays(now = new Date()) {
  const today = new Date(`${dayFormatter.format(now)}T00:00:00Z`).getTime()
  return Array.from({ length: 14 }, (_, index) => new Date(today - (13 - index) * 86_400_000).toISOString().slice(0, 10))
}

export function summarizeRecentAttempts(attempts: RecentAttempt[], days: string[]) {
  const daily = new Map(days.map((day) => [day, { day, correct: 0, incorrect: 0 }]))
  const competencies = new Map<string, { id: string; correct: number; incorrect: number }>()
  let correct = 0
  let incorrect = 0

  for (const attempt of attempts) {
    const day = daily.get(dayFormatter.format(new Date(attempt.answered_at)))
    if (!day) continue

    const result = attempt.is_correct ? 'correct' : 'incorrect'
    day[result] += 1
    if (attempt.is_correct) correct += 1
    else incorrect += 1

    const id = attempt.question?.competency_id
    if (id) {
      const row = competencies.get(id) ?? { id, correct: 0, incorrect: 0 }
      row[result] += 1
      competencies.set(id, row)
    }
  }

  return { days: [...daily.values()], competencies: [...competencies.values()], correct, incorrect }
}

export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(numerator * 100 / denominator) : null
}
