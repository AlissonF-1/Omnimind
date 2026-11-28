export async function sendStudyRequest(url: '/api/assistant/training' | '/api/assistant/sql-lab', input: object, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401 || response.status === 409) window.dispatchEvent(new Event('assistant-session-invalid'))
  if (response.status === 423) window.dispatchEvent(new Event('assistant-assessment-open'))
  if (!response.ok || !data) throw new Error(typeof data?.error === 'string' ? data.error : 'Não foi possível concluir. Tente novamente.')
  return data
}
