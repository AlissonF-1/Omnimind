'use client'

import React, { useState } from 'react'
import { 
  Settings, Volume2, Bot, Trophy, Brush, Shield, 
  Trash2, Download, AlertTriangle, Monitor, Sparkles, CheckCircle2
} from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'
import { exportUserData, deleteAllUserData } from '@/actions/settings'
import ReviewAlarm from '@/components/ReviewAlarm'

const TABS = [
  { id: 'estudos', label: 'Estudos', icon: <Settings className="size-4" /> },
  { id: 'audio', label: 'Áudio e Voz', icon: <Volume2 className="size-4" /> },
  { id: 'ai', label: 'IA e Modelos', icon: <Bot className="size-4" /> },
  { id: 'gamificacao', label: 'Gamificação', icon: <Trophy className="size-4" /> },
  { id: 'aparencia', label: 'Aparência', icon: <Brush className="size-4" /> },
  { id: 'privacidade', label: 'Privacidade', icon: <Shield className="size-4" /> },
]

export default function SettingsTabs() {
  const [activeTab, setActiveTab] = useState('estudos')
  const { settings, updateSetting, isUpdating } = useSettings()

  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const handleUpdate = async (key: keyof typeof settings, value: any) => {
    await updateSetting(key as any, value)
    setSavedKey(key)
    setTimeout(() => setSavedKey(null), 1500)
  }

  const handleExport = async () => {
    try {
      const data = await exportUserData()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `omnimind_backup_${new Date().toISOString().split('T')[0]}.json`
      a.click()
    } catch (e) {
      alert('Erro ao exportar dados')
    }
  }

  const handleDelete = async () => {
    if (deleteConfirmation !== 'CONCORDO EM APAGAR TUDO') return
    setIsDeleting(true)
    try {
      const result = await deleteAllUserData(deleteConfirmation)
      
      if (result.backupJson) {
        const blob = new Blob([result.backupJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `omnimind_backup_auto_${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)
      }

      window.location.href = '/' // Volta pro login/início após apagar
    } catch (e) {
      alert('Erro ao apagar conta. Tente novamente.')
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar de Tabs */}
      <div className="w-full md:w-64 shrink-0 flex flex-col gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
              activeTab === tab.id
                ? 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/30'
                : 'text-text-muted hover:bg-surface-muted hover:text-text-strong'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das Tabs */}
      <div className="flex-1 bg-surface border border-border rounded-2xl p-6 min-h-[400px]">
        
        {/* ABA: ESTUDOS */}
        {activeTab === 'estudos' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-text-strong mb-1">Estudos e Metas</h3>
              <p className="text-sm text-text-muted mb-4">Configurações globais de aprendizado.</p>
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold">Meta Diária Padrão (Cards/dia)</label>
                  <p className="text-xs text-text-muted mb-2">Usado quando não há nenhuma meta dinâmica/prova.</p>
                  <input 
                    type="number" 
                    min={1} max={100}
                    value={settings.daily_goal_default}
                    onChange={(e) => handleUpdate('daily_goal_default', parseInt(e.target.value) || 10)}
                    disabled={isUpdating}
                    className="field w-32"
                  />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-surface-muted rounded-xl border border-border">
                  <div>
                    <h4 className="font-semibold text-sm">Modo Não Perturbe</h4>
                    <p className="text-xs text-text-muted">Desativa notificações de revisão (Silencioso).</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.do_not_disturb} onChange={(e) => handleUpdate('do_not_disturb', e.target.checked)} disabled={isUpdating} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                <div className="pt-2">
                  <ReviewAlarm />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: AUDIO */}
        {activeTab === 'audio' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-text-strong mb-1">Áudio e Voz</h3>
              <p className="text-sm text-text-muted mb-4">Ajustes do Feynman Sandbox e TTS.</p>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">Motor de Transcrição</label>
                  <select 
                    value={settings.transcription_mode}
                    onChange={(e) => handleUpdate('transcription_mode', e.target.value)}
                    disabled={isUpdating}
                    className="field"
                  >
                    <option value="browser">⚡ Navegador Web (Instantâneo, Gratuito)</option>
                    <option value="whisper">🧠 Groq Whisper (Alta Precisão, Consome Tokens)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">Voz do Tutor (TTS)</label>
                  <select 
                    value={settings.tts_voice}
                    onChange={(e) => handleUpdate('tts_voice', e.target.value)}
                    disabled={isUpdating}
                    className="field"
                  >
                    <option value="default">Voz Padrão do Sistema</option>
                    <option value="male">Voz Masculina (Preferencial)</option>
                    <option value="female">Voz Feminina (Preferencial)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: IA */}
        {activeTab === 'ai' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-text-strong mb-1">IA e Modelos</h3>
              <p className="text-sm text-text-muted mb-4">Escolha os modelos e comportamento do tutor.</p>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">Modelo de IA Padrão (Chat)</label>
                  <select 
                    value={settings.ai_default_model}
                    onChange={(e) => handleUpdate('ai_default_model', e.target.value)}
                    disabled={isUpdating}
                    className="field"
                  >
                    <option value="gemini">Gemini 2.5 Flash (Rápido, Balanceado)</option>
                    <option value="groq">Llama 3 70B via Groq (Raciocínio Profundo)</option>
                    <option value="openrouter">OpenRouter (Auto-Fallback)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-surface-muted rounded-xl border border-border">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">Modo de Economia</h4>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full font-bold">Eco</span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">Força o uso de modelos menores (Groq 8B) para economizar limites.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" className="sr-only peer" checked={settings.eco_mode} onChange={(e) => handleUpdate('eco_mode', e.target.checked)} disabled={isUpdating} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">Tamanho da Fonte (IA)</label>
                  <select 
                    value={settings.ai_font_size}
                    onChange={(e) => handleUpdate('ai_font_size', e.target.value)}
                    disabled={isUpdating}
                    className="field"
                  >
                    <option value="small">Pequena</option>
                    <option value="normal">Normal</option>
                    <option value="large">Grande</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-surface-muted rounded-xl border border-border">
                  <div>
                    <h4 className="font-semibold text-sm">Gerar Analogias nos Flashcards</h4>
                    <p className="text-xs text-text-muted">Desative se quiser apenas texto puro/direto.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" className="sr-only peer" checked={settings.generate_analogies} onChange={(e) => handleUpdate('generate_analogies', e.target.checked)} disabled={isUpdating} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: GAMIFICACAO */}
        {activeTab === 'gamificacao' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-text-strong mb-1">Gamificação</h3>
              <p className="text-sm text-text-muted mb-4">Controle recompensas visuais e sonoras.</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-muted rounded-xl border border-border">
                  <div>
                    <h4 className="font-semibold text-sm">Efeitos Sonoros</h4>
                    <p className="text-xs text-text-muted mt-0.5">Silencia todo o app (cliques de botões, bipes de acerto/erro, troféus e combos) de uma vez só.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.enable_sounds} onChange={(e) => handleUpdate('enable_sounds', e.target.checked)} disabled={isUpdating} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-surface-muted rounded-xl border border-border">
                  <div>
                    <h4 className="font-semibold text-sm">Animações de Confetes</h4>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.enable_confetti} onChange={(e) => handleUpdate('enable_confetti', e.target.checked)} disabled={isUpdating} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                <div className="pt-4 border-t border-border">
                  <button className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
                    <Sparkles className="size-4 text-amber-500" />
                    Regenerar Título do Jogador com IA
                  </button>
                  <p className="text-xs text-text-muted mt-2">Um novo título (ex: "Mestre do Foco") será criado baseado no seu nível e XP atual.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: APARENCIA */}
        {activeTab === 'aparencia' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-text-strong mb-1">Organização e Aparência</h3>
              <p className="text-sm text-text-muted mb-4">Preferências visuais da interface.</p>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold">Tema</label>
                  <select 
                    value={settings.theme}
                    onChange={(e) => handleUpdate('theme', e.target.value)}
                    disabled={isUpdating}
                    className="field"
                  >
                    <option value="dark">Escuro</option>
                    <option value="light">Claro</option>
                    <option value="system">Seguir o Sistema</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: PRIVACIDADE */}
        {activeTab === 'privacidade' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-lg font-bold text-text-strong mb-1">Privacidade e Dados</h3>
              <p className="text-sm text-text-muted mb-6">Controle total sobre seus dados armazenados.</p>
              
              <div className="space-y-6">
                <div className="p-5 bg-surface-muted rounded-xl border border-border flex flex-col items-start gap-3">
                  <div className="flex items-center gap-2 text-text-strong font-bold">
                    <Download className="size-5" /> Exportar Dados (Backup)
                  </div>
                  <p className="text-sm text-text-muted">Baixe um arquivo JSON contendo todas as suas anotações, flashcards e estatísticas.</p>
                  <button onClick={handleExport} className="btn-secondary mt-2 px-4 py-2">
                    Baixar JSON
                  </button>
                </div>

                <div className="p-5 bg-red-950/20 rounded-xl border border-red-500/30 flex flex-col items-start gap-3">
                  <div className="flex items-center gap-2 text-red-500 font-bold">
                    <AlertTriangle className="size-5" /> Apagar Todos os Dados
                  </div>
                  <p className="text-sm text-red-400/80">
                    Isso removerá permanentemente seu progresso, notas e flashcards. Esta ação é IRREVERSÍVEL.
                  </p>
                  
                  <div className="w-full mt-2">
                    <label className="text-xs font-semibold text-red-400 mb-2 block">
                      Digite <span className="font-mono bg-red-500/20 px-1 rounded">CONCORDO EM APAGAR TUDO</span> para confirmar:
                    </label>
                    <div className="flex gap-2 w-full max-w-md">
                      <input 
                        type="text"
                        value={deleteConfirmation}
                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                        className="field border-red-500/30 focus:border-red-500 focus:ring-red-500/20 bg-red-950/20 text-red-200 w-full"
                        placeholder="CONCORDO EM APAGAR TUDO"
                      />
                      <button 
                        onClick={handleDelete}
                        disabled={deleteConfirmation !== 'CONCORDO EM APAGAR TUDO' || isDeleting}
                        className="btn-primary bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isDeleting ? 'Apagando...' : 'Apagar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Toast de Confirmação */}
      <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg shadow-lg backdrop-blur-md transition-all duration-300 z-50 ${savedKey ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}>
        <CheckCircle2 className="size-4" />
        <span className="text-sm font-medium">Configuração salva!</span>
      </div>
    </div>
  )
}
