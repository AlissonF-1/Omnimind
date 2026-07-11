'use client'

import { useState, useMemo, useEffect } from 'react'
import { 
  Edit3, Trash2, PlusCircle, Save, X, Search, 
  ChevronLeft, AlertTriangle, Eye, EyeOff, 
  Flame, CheckCircle2, ArrowUpDown, AlertCircle
} from 'lucide-react'
import { createFlashcard, updateFlashcard, deleteFlashcard } from '@/actions/flashcards'

interface Card {
  id: string
  front: string
  back: string
  analogia?: string | null
  mnemonico?: string | null
  note_id: string
  created_at?: string // Assumindo que exista para ordenação
}

type SortOption = 'newest' | 'oldest' | 'az'
type ViewMode = 'list' | 'view' | 'edit'

export default function FlashcardsManager({ initialCards, noteId }: { initialCards: Card[]; noteId: string }) {
  const [cards, setCards] = useState<Card[]>(initialCards ?? [])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  
  // States de Formulário e Edição
  const [local, setLocal] = useState<Partial<Card>>({})
  const [isSaving, setIsSaving] = useState(false)
  
  // Edição Inline
  const [inlineEditing, setInlineEditing] = useState<'front' | 'back' | null>(null)
  const [inlineValue, setInlineValue] = useState('')

  // UI States (Filtros, Buscas, Review)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'analogia' | 'mnemonico'>('all')
  const [sortType, setSortType] = useState<SortOption>('newest')
  const [isFlipped, setIsFlipped] = useState(false) // Controla o modo revisão

  // Modais e Toasts
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Estatísticas de sessão (UI Mock para a feature solicitada)
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, streak: 5 })

  // Seleciona o primeiro card no desktop se não houver seleção
  useEffect(() => {
    if (window.innerWidth >= 768 && !selectedCardId && cards.length > 0 && viewMode === 'list') {
      handleSelectCard(cards[0].id)
    }
  }, [cards, selectedCardId, viewMode])

  // Reseta o flip ao mudar de card
  useEffect(() => {
    setIsFlipped(false)
    setInlineEditing(null)
  }, [selectedCardId])

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Filtragem e Ordenação
  const processedCards = useMemo(() => {
    let result = cards.filter(card => {
      const matchesSearch = card.front.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            card.back.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = 
        filterType === 'all' ? true :
        filterType === 'analogia' ? !!card.analogia :
        filterType === 'mnemonico' ? !!card.mnemonico : true
      
      return matchesSearch && matchesFilter
    })

    result.sort((a, b) => {
      if (sortType === 'az') return a.front.localeCompare(b.front)
      // Fallback para IDs se não houver created_at
      if (sortType === 'newest') return (b.created_at || b.id).localeCompare(a.created_at || a.id)
      if (sortType === 'oldest') return (a.created_at || a.id).localeCompare(b.created_at || b.id)
      return 0
    })

    return result
  }, [cards, searchQuery, filterType, sortType])

  const handleSelectCard = (id: string) => {
    setSelectedCardId(id)
    setViewMode('view')
  }

  const startNewCard = () => {
    setSelectedCardId('new')
    setLocal({ front: '', back: '', analogia: '', mnemonico: '' })
    setViewMode('edit')
  }

  const startFullEdit = () => {
    const card = cards.find(c => c.id === selectedCardId)
    if (card) {
      setLocal({ ...card })
      setViewMode('edit')
    }
  }

  const cancelEdit = () => {
    if (selectedCardId === 'new') {
      setSelectedCardId(null)
      setViewMode('list')
    } else {
      setViewMode('view')
    }
    setLocal({})
  }

  const handleSaveFull = async () => {
    if (!local.front || !local.back) {
      showToast('Frente e verso são obrigatórios', 'error')
      return
    }
    setIsSaving(true)
    try {
      if (selectedCardId === 'new') {
        const res: any = await createFlashcard(noteId, local.front, local.back, local.analogia, local.mnemonico)
        if (res?.error) throw new Error(res.error)
        setCards((c) => [res.card, ...c])
        setSelectedCardId(res.card.id)
        showToast('Card criado!', 'success')
      } else if (selectedCardId) {
        const res: any = await updateFlashcard(selectedCardId, local)
        if (res?.error) throw new Error(res.error)
        setCards((c) => c.map(card => card.id === selectedCardId ? res.card : card))
        showToast('Card atualizado!', 'success')
      }
      setViewMode('view')
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveInline = async () => {
    if (!selectedCardId || !inlineEditing || !inlineValue.trim()) return
    const card = cards.find(c => c.id === selectedCardId)
    if (!card || card[inlineEditing] === inlineValue) {
      setInlineEditing(null)
      return
    }

    const updatedData = { ...card, [inlineEditing]: inlineValue }
    
    // Otimistic UI Update
    setCards((c) => c.map(c => c.id === selectedCardId ? { ...c, [inlineEditing]: inlineValue } : c))
    setInlineEditing(null)
    
    try {
      const res: any = await updateFlashcard(selectedCardId, updatedData)
      if (res?.error) throw new Error(res.error)
    } catch (e: any) {
      // Revert in case of error
      setCards((c) => c.map(c => c.id === selectedCardId ? card : c))
      showToast('Erro ao salvar alteração rápida', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return
    try {
      const res: any = await deleteFlashcard(deleteConfirmId)
      if (res?.error) throw new Error(res.error)
      setCards((c) => c.filter(card => card.id !== deleteConfirmId))
      
      if (selectedCardId === deleteConfirmId) {
        setSelectedCardId(null)
        setViewMode('list')
      }
      showToast('Card apagado', 'success')
    } catch (e: any) {
      showToast(e.message || 'Erro ao deletar', 'error')
    } finally {
      setDeleteConfirmId(null)
    }
  }

  const activeCard = selectedCardId === 'new' ? local : cards.find(c => c.id === selectedCardId)

  return (
    <div className="relative flex flex-col h-[calc(100vh-120px)] min-h-[500px] bg-background">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full border shadow-xl text-xs font-semibold backdrop-blur-md animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300 pointer-events-none ${
          toast.type === 'success'
            ? 'border-success/30 bg-success-soft/90 text-success shadow-[0_10px_25px_rgba(34,197,94,0.12)]'
            : 'border-error/30 bg-error-soft/90 text-error shadow-[0_10px_25px_rgba(239,68,68,0.12)]'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Modal de Confirmação Customizado */}
      {deleteConfirmId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface p-6 rounded-xl shadow-xl max-w-sm w-full animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-error mb-4">
              <AlertTriangle className="size-6" />
              <h3 className="font-semibold text-lg">Apagar Flashcard?</h3>
            </div>
            <p className="text-text-muted text-sm mb-6">Esta ação não pode ser desfeita. O card será removido permanentemente da sua coleção.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="btn-ghost">Cancelar</button>
              <button onClick={handleDelete} className="btn-primary bg-error hover:bg-error/90 text-white border-transparent">
                Sim, apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Stats */}
      <div className="flex items-center justify-between shrink-0 p-3 border-b border-border bg-surface-muted/50 rounded-t-lg">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-text-medium">
            <CheckCircle2 className="size-4 text-success" />
            <span><strong className="text-text-strong">{sessionStats.reviewed}</strong> revisados hoje</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-medium">
            <Flame className="size-4 text-orange-500" />
            <span><strong className="text-text-strong">{sessionStats.streak}</strong> dias seguidos</span>
          </div>
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* COLUNA ESQUERDA: LISTA */}
        <div className={`w-full md:w-80 lg:w-96 shrink-0 flex flex-col border-r border-border bg-surface ${
          (viewMode !== 'list' && window.innerWidth < 768) ? 'hidden' : 'flex'
        }`}>
          <div className="p-3 border-b border-border space-y-3">
            <button onClick={startNewCard} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              <PlusCircle className="size-4" /> Novo Flashcard
            </button>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-text-muted pointer-events-none" />
                <input
                  type="search"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="field pl-9 w-full text-sm h-9"
                />
              </div>
              <select
                value={sortType}
                onChange={(e) => setSortType(e.target.value as SortOption)}
                className="field text-sm h-9 px-2 w-10 md:w-auto bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
                title="Ordenar por"
              >
                <option value="newest">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="az">A-Z</option>
              </select>
            </div>
            
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {(['all', 'analogia', 'mnemonico'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                    filterType === f ? 'bg-primary text-white font-medium' : 'bg-surface-muted text-text-medium hover:text-text-strong'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'analogia' ? 'C/ Analogia' : 'C/ Mnemônico'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-surface-muted/30">
            {processedCards.length === 0 ? (
              <div className="text-sm text-text-muted text-center p-6 mt-4">Nenhum card encontrado.</div>
            ) : (
              processedCards.map(card => (
                <button
                  key={card.id}
                  onClick={() => handleSelectCard(card.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all text-sm group ${
                    selectedCardId === card.id
                      ? 'bg-primary-soft/30 border-primary/40 ring-1 ring-primary/20'
                      : 'bg-surface border-transparent hover:border-border hover:bg-surface-hover'
                  }`}
                >
                  <div className="font-medium text-text-strong line-clamp-1">{card.front}</div>
                  <div className="text-text-muted text-xs line-clamp-1 mt-1 opacity-80">{card.back}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: DETALHE / EDIÇÃO */}
        <div className={`flex-1 flex flex-col bg-surface ${
          (viewMode === 'list' && window.innerWidth < 768) ? 'hidden' : 'flex'
        }`}>
          
          {selectedCardId ? (
            <>
              {/* Header do Detalhe */}
              <div className="shrink-0 h-14 border-b border-border flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setViewMode('list')} 
                    className="md:hidden p-2 -ml-2 text-text-muted hover:text-text-strong rounded-md"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <span className="font-medium text-sm text-text-strong">
                    {viewMode === 'edit' ? (selectedCardId === 'new' ? 'Criar Flashcard' : 'Editar Flashcard') : 'Modo Revisão'}
                  </span>
                </div>

                {viewMode === 'view' && (
                  <div className="flex items-center gap-1">
                    <button onClick={startFullEdit} className="p-2 text-text-muted hover:text-primary rounded-md transition-colors" title="Editar">
                      <Edit3 className="size-4" />
                    </button>
                    <button onClick={() => setDeleteConfirmId(selectedCardId)} className="p-2 text-text-muted hover:text-error rounded-md transition-colors" title="Apagar">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Corpo do Detalhe */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8">
                {viewMode === 'edit' ? (
                  
                  /* --- FORMULÁRIO COMPLETO --- */
                  <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-text-strong">Frente (Pergunta)</label>
                      <input
                        value={local.front || ''}
                        onChange={(e) => setLocal(s => ({ ...s, front: e.target.value }))}
                        className="field w-full text-base py-2.5"
                        placeholder="Ex: O que é a arquitetura MVC?"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-text-strong">Verso (Resposta)</label>
                      <textarea
                        value={local.back || ''}
                        onChange={(e) => setLocal(s => ({ ...s, back: e.target.value }))}
                        className="field w-full text-base min-h-[120px] py-2.5 resize-y"
                        placeholder="Ex: Padrão que divide a aplicação em Model, View e Controller..."
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-warning">Analogia <span className="text-text-muted font-normal">(Opcional)</span></label>
                        <input
                          value={local.analogia || ''}
                          onChange={(e) => setLocal(s => ({ ...s, analogia: e.target.value }))}
                          className="field w-full"
                          placeholder="Ex: Como um restaurante (Cozinha = Model...)"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-primary">Mnemônico <span className="text-text-muted font-normal">(Opcional)</span></label>
                        <input
                          value={local.mnemonico || ''}
                          onChange={(e) => setLocal(s => ({ ...s, mnemonico: e.target.value }))}
                          className="field w-full"
                          placeholder="Ex: Minha Vó Cozinha"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-6 mt-6 border-t border-border">
                      <button onClick={cancelEdit} className="btn-ghost flex-1 md:flex-none">Cancelar</button>
                      <button onClick={handleSaveFull} disabled={isSaving} className="btn-primary flex-1 md:flex-none ml-auto gap-2">
                        <Save className="size-4" /> {isSaving ? 'Salvando...' : 'Salvar Card'}
                      </button>
                    </div>
                  </div>

                ) : (
                  
                  /* --- MODO REVISÃO (VISUALIZAÇÃO COM INLINE EDIT) --- */
                  <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center py-4 animate-in fade-in duration-300">
                    
                    <div className="w-full relative bg-surface border border-border shadow-sm rounded-2xl p-6 md:p-10 transition-all duration-500 min-h-[300px] flex flex-col">
                      
                      {/* FRENTE */}
                      <div className="flex-1 flex flex-col items-center justify-center text-center group">
                        <span className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">Pergunta</span>
                        
                        {inlineEditing === 'front' ? (
                          <div className="w-full flex flex-col items-center gap-2">
                            <textarea 
                              autoFocus
                              value={inlineValue}
                              onChange={e => setInlineValue(e.target.value)}
                              className="field w-full text-center text-lg resize-none"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button onClick={() => setInlineEditing(null)} className="btn-ghost btn-sm text-xs">Cancelar</button>
                              <button onClick={handleSaveInline} className="btn-primary btn-sm text-xs">Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full">
                            <h2 
                              onDoubleClick={() => { setInlineEditing('front'); setInlineValue(activeCard?.front || ''); }}
                              className="text-xl md:text-2xl font-semibold text-text-strong cursor-text"
                            >
                              {activeCard?.front}
                            </h2>
                            <button 
                              onClick={() => { setInlineEditing('front'); setInlineValue(activeCard?.front || ''); }}
                              className="absolute -right-2 -top-2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-primary rounded-md"
                            >
                              <Edit3 className="size-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <hr className="my-8 border-border/60 border-dashed" />

                      {/* VERSO */}
                      <div className="flex-1 flex flex-col items-center text-center relative group">
                        <span className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">Resposta</span>
                        
                        {!isFlipped ? (
                          <button 
                            onClick={() => {
                              setIsFlipped(true)
                              setSessionStats(s => ({ ...s, reviewed: s.reviewed + 1 }))
                            }}
                            className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-surface/80 backdrop-blur-[4px] rounded-lg border border-border border-dashed text-text-medium hover:text-primary hover:border-primary/50 transition-colors"
                          >
                            <Eye className="size-6 mb-2" />
                            <span className="font-medium">Toque para revelar</span>
                          </button>
                        ) : null}

                        <div className={`w-full transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 select-none'}`}>
                          {inlineEditing === 'back' ? (
                            <div className="w-full flex flex-col items-center gap-2">
                              <textarea 
                                autoFocus
                                value={inlineValue}
                                onChange={e => setInlineValue(e.target.value)}
                                className="field w-full text-center text-base resize-none"
                                rows={4}
                              />
                              <div className="flex gap-2">
                                <button onClick={() => setInlineEditing(null)} className="btn-ghost btn-sm text-xs">Cancelar</button>
                                <button onClick={handleSaveInline} className="btn-primary btn-sm text-xs">Salvar</button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full">
                              <p 
                                onDoubleClick={() => { setInlineEditing('back'); setInlineValue(activeCard?.back || ''); }}
                                className="text-base md:text-lg text-text-strong whitespace-pre-wrap cursor-text"
                              >
                                {activeCard?.back}
                              </p>
                              <button 
                                onClick={() => { setInlineEditing('back'); setInlineValue(activeCard?.back || ''); }}
                                className="absolute -right-2 -top-2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-primary rounded-md"
                              >
                                <Edit3 className="size-4" />
                              </button>
                            </div>
                          )}

                          {/* Extras revelados junto com o verso */}
                          {(activeCard?.analogia || activeCard?.mnemonico) && (
                            <div className="flex flex-wrap justify-center gap-3 mt-6">
                              {activeCard.analogia && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-warning-soft text-warning-strong text-xs font-medium border border-warning/20 text-left">
                                  <strong className="uppercase">Analogia:</strong> {activeCard.analogia}
                                </span>
                              )}
                              {activeCard.mnemonico && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-soft text-primary-strong text-xs font-medium border border-primary/20 text-left">
                                  <strong className="uppercase">Mnemônico:</strong> {activeCard.mnemonico}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // Empty State Desktop
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface-muted/20">
              <div className="w-16 h-16 bg-surface border border-border shadow-sm rounded-2xl flex items-center justify-center mb-4 rotate-12">
                <PlusCircle className="size-8 text-text-muted opacity-50" />
              </div>
              <h3 className="text-lg font-semibold text-text-strong">Coleção Vazia</h3>
              <p className="text-text-muted max-w-sm mt-2 mb-6">Selecione um card na lista ao lado ou crie um novo para começar sua revisão.</p>
              <button onClick={startNewCard} className="btn-primary gap-2">
                <PlusCircle className="size-4" /> Criar Primeiro Card
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}