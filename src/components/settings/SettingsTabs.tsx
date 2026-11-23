'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight, BookOpen, Bot, Check, ChevronRight, Download, LockKeyhole, Monitor, Moon, Sparkles, Sun, Trash2, Trophy, Volume2, X,
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { exportUserData, deleteAllUserData } from '@/actions/settings'
import ReviewAlarm from '@/components/ReviewAlarm'
import { DELETE_STUDY_DATA_CONFIRMATION, isValidDailyGoal, type UserPreferences } from '@/types/settings'

const tabs = [
  { id: 'estudos', label: 'Estudos', description: 'Meta diária e lembretes de revisão.', icon: BookOpen },
  { id: 'audio', label: 'Áudio e voz', description: 'Transcrição de voz e leitura em voz alta.', icon: Volume2 },
  { id: 'ai', label: 'IA e modelos', description: 'Preferências do assistente e dos flashcards.', icon: Bot },
  { id: 'gamificacao', label: 'Gamificação', description: 'Sons e efeitos durante o estudo.', icon: Trophy },
  { id: 'aparencia', label: 'Aparência', description: 'Escolha o tema usado na sua conta.', icon: Monitor },
  { id: 'privacidade', label: 'Privacidade', description: 'Exporte ou apague os dados de estudo da sua conta.', icon: LockKeyhole },
] as const

const themes = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const

type Tab = typeof tabs[number]['id']
type Preference = Exclude<keyof UserPreferences, 'user_id' | 'updated_at'>
type Notice = { tone: 'success' | 'error'; text: string }

function SettingRow({ title, description, children, id }: { title: string; description: string; children: ReactNode; id: string }) {
  return (
    <div className="st-row">
      <div>
        <label htmlFor={id}>{title}</label>
        <p id={id + '-info'}>{description}</p>
      </div>
      {children}
    </div>
  )
}

function Toggle({ id, checked, disabled, onChange }: {
  id: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void
}) {
  return (
    <label className="st-toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={id + '-info'}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  )
}

function SelectSetting<Value extends string>({ id, value, disabled, choices, onChange }: {
  id: string; value: Value; disabled: boolean; choices: readonly { value: Value; label: string }[]; onChange: (value: Value) => void
}) {
  return (
    <select id={id} className="st-input st-select" value={value} disabled={disabled} aria-describedby={id + '-info'}
      onChange={(event) => {
        const choice = choices.find((item) => item.value === event.target.value)
        if (choice) onChange(choice.value)
      }}
    >
      {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </select>
  )
}

function downloadBackup(json: string, automatic = false) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'omnimind_backup_' + (automatic ? 'auto_' : '') + new Date().toISOString().slice(0, 10) + '.json'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function SettingsTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('estudos')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [goalDraft, setGoalDraft] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const confirmTrigger = useRef<HTMLButtonElement>(null)
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement>>>({})
  const { settings, updateSetting, isUpdating } = useSettings()
  const tab = tabs.find((item) => item.id === activeTab) ?? tabs[0]
  const goalText = goalDraft ?? String(settings.daily_goal_default)
  const goalValue = Number(goalText)
  const validGoal = isValidDailyGoal(goalValue)

  function selectTab(id: Tab) {
    setActiveTab(id)
    setNotice(null)
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp': next = (index + tabs.length - 1) % tabs.length; break
      case 'ArrowRight':
      case 'ArrowDown': next = (index + 1) % tabs.length; break
      case 'Home': next = 0; break
      case 'End': next = tabs.length - 1; break
      default: return
    }

    event.preventDefault()
    selectTab(tabs[next].id)
    tabButtons.current[tabs[next].id]?.focus()
  }

  async function save<K extends Preference>(key: K, value: UserPreferences[K]) {
    setNotice(null)
    const saved = await updateSetting(key, value)
    setNotice(saved
      ? { tone: 'success', text: 'Preferência salva.' }
      : { tone: 'error', text: 'Não foi possível salvar a preferência. Tente novamente.' })
    return saved
  }

  async function exportBackup() {
    if (exporting) return
    setExporting(true)
    setNotice(null)
    try {
      downloadBackup(await exportUserData())
      setNotice({ tone: 'success', text: 'Download do backup iniciado.' })
    } catch {
      setNotice({ tone: 'error', text: 'Não foi possível gerar o backup. Tente novamente.' })
    } finally {
      setExporting(false)
    }
  }

  async function deleteData() {
    if (confirmation !== DELETE_STUDY_DATA_CONFIRMATION || deleting || isUpdating) return
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await deleteAllUserData(confirmation)
      if (result.backupJson) downloadBackup(result.backupJson, true)
      window.location.assign('/')
    } catch {
      setDeleteError('Não foi possível confirmar a exclusão completa. Parte dos dados pode já ter sido removida.')
      setDeleting(false)
    }
  }

  return (
    <div className="st-layout">
      <div className="st-nav" role="tablist" aria-label="Categorias das configurações">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button key={id} type="button" role="tab" id={'settings-tab-' + id} aria-selected={activeTab === id}
            aria-controls={activeTab === id ? 'settings-panel-' + id : undefined} tabIndex={activeTab === id ? 0 : -1}
            ref={(node) => { if (node) tabButtons.current[id] = node }}
            onClick={() => selectTab(id)} onKeyDown={(event) => handleTabKey(event, index)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight className="st-nav-chevron" size={14} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section key={activeTab} className="st-panel" role="tabpanel" id={'settings-panel-' + activeTab}
        aria-labelledby={'settings-tab-' + activeTab} tabIndex={0}
      >
        <header className="st-panel-heading">
          <div>
            <h2>{tab.label}</h2>
            <p>{tab.description}</p>
          </div>
          {isUpdating && <span className="st-status" role="status">Salvando…</span>}
          {notice && !isUpdating && (
            <span className={'st-status st-' + notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
              {notice.tone === 'success' && <Check size={15} aria-hidden="true" />}{notice.text}
            </span>
          )}
        </header>

        <div className="st-stack">
          {activeTab === 'estudos' && (
            <>
              <form className="st-form" onSubmit={async (event) => {
                event.preventDefault()
                if (validGoal && goalValue !== settings.daily_goal_default && await save('daily_goal_default', goalValue)) {
                  setGoalDraft(null)
                }
              }}>
                <SettingRow id="settings-daily-goal" title="Meta diária padrão" description="Revisões por dia quando não há uma meta de prova. Escolha de 1 a 100.">
                  <div className="st-form-controls">
                    <input id="settings-daily-goal" className="st-input st-number" type="number" min={1} max={100} step={1}
                      value={goalText} onChange={(event) => setGoalDraft(event.target.value)} disabled={isUpdating}
                      aria-invalid={!validGoal} aria-describedby="settings-daily-goal-info" required
                    />
                    <button type="submit" className="st-button st-primary" disabled={isUpdating || !validGoal || goalValue === settings.daily_goal_default}>
                      Salvar meta
                    </button>
                  </div>
                </SettingRow>
              </form>
              <SettingRow id="settings-dnd" title="Não perturbe" description="Pausa os lembretes de revisão da sua conta.">
                <Toggle id="settings-dnd" checked={settings.do_not_disturb} disabled={isUpdating} onChange={(value) => save('do_not_disturb', value)} />
              </SettingRow>
              <ReviewAlarm />
            </>
          )}

          {activeTab === 'audio' && (
            <>
              <SettingRow id="settings-transcription" title="Transcrição" description="Escolha como o áudio vira texto nas ferramentas de estudo.">
                <SelectSetting id="settings-transcription" value={settings.transcription_mode} disabled={isUpdating}
                  choices={[{ value: 'browser', label: 'Navegador' }, { value: 'whisper', label: 'Groq Whisper' }]}
                  onChange={(value) => save('transcription_mode', value)}
                />
              </SettingRow>
              <SettingRow id="settings-voice" title="Voz do tutor" description="Preferência de voz para leitura em voz alta.">
                <SelectSetting id="settings-voice" value={settings.tts_voice} disabled={isUpdating}
                  choices={[{ value: 'default', label: 'Padrão do sistema' }, { value: 'male', label: 'Voz masculina' }, { value: 'female', label: 'Voz feminina' }]}
                  onChange={(value) => save('tts_voice', value)}
                />
              </SettingRow>
            </>
          )}

          {activeTab === 'ai' && (
            <>
              <SettingRow id="settings-model" title="Modelo padrão" description="Seleção usada ao conversar com o assistente.">
                <SelectSetting id="settings-model" value={settings.ai_default_model} disabled={isUpdating}
                  choices={[{ value: 'gemini', label: 'Gemini' }, { value: 'groq', label: 'Groq' }, { value: 'openrouter', label: 'OpenRouter' }]}
                  onChange={(value) => save('ai_default_model', value)}
                />
              </SettingRow>
              <SettingRow id="settings-eco" title="Modo de economia" description="Prioriza modelos menores nas tarefas compatíveis.">
                <Toggle id="settings-eco" checked={settings.eco_mode} disabled={isUpdating} onChange={(value) => save('eco_mode', value)} />
              </SettingRow>
              <SettingRow id="settings-font" title="Tamanho do texto" description="Altera o tamanho da fonte das respostas do assistente.">
                <SelectSetting id="settings-font" value={settings.ai_font_size} disabled={isUpdating}
                  choices={[{ value: 'small', label: 'Pequeno' }, { value: 'normal', label: 'Normal' }, { value: 'large', label: 'Grande' }]}
                  onChange={(value) => save('ai_font_size', value)}
                />
              </SettingRow>
              <SettingRow id="settings-analogies" title="Analogias nos flashcards" description="Inclui analogias na geração de cartões.">
                <Toggle id="settings-analogies" checked={settings.generate_analogies} disabled={isUpdating} onChange={(value) => save('generate_analogies', value)} />
              </SettingRow>
            </>
          )}

          {activeTab === 'gamificacao' && (
            <>
              <SettingRow id="settings-sounds" title="Efeitos sonoros" description="Sons de interação, respostas e conquistas.">
                <Toggle id="settings-sounds" checked={settings.enable_sounds} disabled={isUpdating} onChange={(value) => save('enable_sounds', value)} />
              </SettingRow>
              <SettingRow id="settings-confetti" title="Confetes" description="Animações nas celebrações de estudo.">
                <Toggle id="settings-confetti" checked={settings.enable_confetti} disabled={isUpdating} onChange={(value) => save('enable_confetti', value)} />
              </SettingRow>
              <div className="st-row">
                <div><h3><Sparkles size={16} aria-hidden="true" /> Título de jogador</h3><p>Gere um título no seu perfil.</p></div>
                <Link href="/dashboard/perfil" className="st-button">Ir ao perfil <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            </>
          )}

          {activeTab === 'aparencia' && (
            <div className="st-theme-grid" role="group" aria-label="Tema da interface">
              {themes.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" className="st-theme" data-theme={value}
                  aria-pressed={settings.theme === value} disabled={isUpdating} onClick={() => save('theme', value)}
                >
                  <span className="st-theme-preview" aria-hidden="true">
                    <span className="st-preview-sidebar" />
                    <span className="st-preview-content"><i /><i /><i /></span>
                  </span>
                  <span className="st-theme-label"><Icon size={16} aria-hidden="true" /> {label}</span>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'privacidade' && (
            <>
              <div className="st-row">
                <div>
                  <h3><Download size={17} aria-hidden="true" /> Exportar dados</h3>
                  <p>Baixe um JSON com workspaces, notas, flashcards e estatísticas de estudo.</p>
                </div>
                <button type="button" className="st-button" disabled={exporting || deleting} onClick={exportBackup}>{exporting ? 'Preparando…' : 'Baixar JSON'}</button>
              </div>
              <div className="st-row st-danger-row">
                <div>
                  <h3><Trash2 size={17} aria-hidden="true" /> Apagar dados de estudo</h3>
                  <p>A exclusão é irreversível. Baixe uma cópia antes de continuar.</p>
                </div>
                <button type="button" ref={confirmTrigger} className="st-button st-danger" disabled={exporting || deleting || isUpdating}
                  aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}
                >
                  Revisar exclusão
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <dialog ref={dialog} className="st-dialog" aria-labelledby="settings-delete-title" onClose={() => {
        setConfirmation('')
        setDeleteError('')
        confirmTrigger.current?.focus()
      }} onCancel={(event) => { if (deleting) event.preventDefault() }}>
        <div className="st-between">
          <h2 id="settings-delete-title">Apagar dados de estudo</h2>
          <button type="button" className="st-button st-close" aria-label="Fechar confirmação de exclusão" disabled={deleting} onClick={() => dialog.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p>Isso apaga seus workspaces, notas, flashcards, metas, registros de revisão, estatísticas e preferências.</p>
        <form onSubmit={(event) => { event.preventDefault(); void deleteData() }}>
          <label htmlFor="settings-confirm-delete">Digite <code>{DELETE_STUDY_DATA_CONFIRMATION}</code> para confirmar.</label>
          <input id="settings-confirm-delete" className="st-input" type="text" autoComplete="off" spellCheck={false}
            value={confirmation} disabled={deleting} onChange={(event) => setConfirmation(event.target.value)}
          />
          {deleteError && <p className="st-error" role="alert">{deleteError}</p>}
          <div className="st-dialog-actions">
            <button type="button" className="st-button" disabled={deleting} onClick={() => dialog.current?.close()}>Cancelar</button>
            <button type="submit" className="st-button st-danger" disabled={deleting || isUpdating || confirmation !== DELETE_STUDY_DATA_CONFIRMATION}>
              {deleting ? 'Apagando…' : 'Apagar dados'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
