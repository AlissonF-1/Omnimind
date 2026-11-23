export const assistantPath = '/dashboard/assistente'
export const assistantPrivateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export type AssistantPersona = 'tutor' | 'grill' | 'eli5'

export type AssistantSource = {
  id: string
  title: string | null
  type: string
  similarity: number
  workspaceId: string | null
  noteId: string | null
}

export function isAssistantId(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
}

export function assistantAccountMatches(expected: unknown, active: string | null): expected is string {
  return isAssistantId(expected) && expected === active
}

export function assistantHistoryKey(accountId: string, workspaceId?: string) {
  return 'omnimind_assistant_v2:' + accountId + ':' + (workspaceId || 'global')
}

export function isAssistantPersona(value: unknown): value is AssistantPersona {
  return value === 'tutor' || value === 'grill' || value === 'eli5'
}

export function assistantSourceHref(source: AssistantSource) {
  if (!isAssistantId(source.workspaceId)) return null
  const workspacePath = '/dashboard/' + source.workspaceId
  return isAssistantId(source.noteId) ? workspacePath + '/note/' + source.noteId : workspacePath
}

export function parseAssistantHistory(input: unknown) {
  const history: { role: 'user' | 'model'; parts: [{ text: string }] }[] = []
  if (!Array.isArray(input)) return history
  for (const turn of input) {
    if (!turn || (turn.role !== 'user' && turn.role !== 'ai') || typeof turn.content !== 'string') continue
    const text = turn.content.trim()
    if (text) history.push({ role: turn.role === 'ai' ? 'model' : 'user', parts: [{ text }] })
  }
  return history
}

export function assistantScreenLabel(input: unknown) {
  if (typeof input !== 'string') return 'Painel'
  const screens = [
    ['/dashboard/assistente', 'Assistente'],
    ['/dashboard/trilhas', 'Trilhas'],
    ['/dashboard/questoes', 'Questões'],
    ['/dashboard/revisoes', 'Revisão ativa'],
    ['/dashboard/feynman', 'Feynman Sandbox'],
    ['/dashboard/busca', 'Busca semântica'],
    ['/dashboard/grafo', 'Rede de Conexões'],
    ['/dashboard/conquistas', 'Minhas Conquistas'],
    ['/dashboard/calendario', 'Calendário'],
    ['/dashboard/configuracoes', 'Configurações'],
    ['/dashboard/perfil', 'Perfil'],
  ]
  return screens.find(([path]) => input === path || input.startsWith(path + '/'))?.[1] ?? 'Painel'
}
