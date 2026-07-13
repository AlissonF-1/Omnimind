'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { semanticSearch } from '@/actions/search'
import { backfillEmbeddings } from '@/actions/embeddings'
import { SOURCE_TYPE_LABELS, type SemanticSearchResult } from '@/types/search'
import { Brain, Loader2, RefreshCw, Search, Clock, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Workspace {
  id: string
  name: string
}

interface SemanticSearchProps {
  workspaces: Workspace[]
  /** Habilita busca automática com debounce. Padrão: true */
  autoSearch?: boolean
  /** Tempo de debounce em ms. Padrão: 300 */
  debounceDelay?: number
  /** Habilita histórico de buscas recentes. Padrão: false */
  enableHistory?: boolean
}

export default function SemanticSearch({
  workspaces,
  autoSearch = true,
  debounceDelay = 300,
  enableHistory = false,
}: SemanticSearchProps) {
  const [query, setQuery] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [results, setResults] = useState<SemanticSearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isBackfilling, startBackfill] = useTransition()
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'all' | 'note' | 'flashcard'>('all')
  const [orderBy, setOrderBy] = useState<'relevance' | 'date'>('relevance')
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})

  const toggleNoteExpanded = (noteId: string) => {
    setExpandedNotes((prev) => ({
      ...prev,
      [noteId]: !prev[noteId],
    }))
  }

  const getHighlightedText = (text: string, queryText: string) => {
    if (!queryText.trim()) return text
    const escaped = queryText.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'gi')
    return text.replace(regex, '<mark class="bg-primary/20 text-primary font-bold rounded px-1">$1</mark>')
  }

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Carrega histórico do sessionStorage
  useEffect(() => {
    if (enableHistory) {
      try {
        const stored = sessionStorage.getItem('semantic-search-history')
        if (stored) {
          setSearchHistory(JSON.parse(stored))
        }
      } catch (_) {}
    }
  }, [enableHistory])

  // Salva histórico
  const saveHistory = useCallback(
    (term: string) => {
      if (!enableHistory || !term.trim()) return
      const updated = [term, ...searchHistory.filter((h) => h !== term)].slice(0, 10)
      setSearchHistory(updated)
      sessionStorage.setItem('semantic-search-history', JSON.stringify(updated))
    },
    [enableHistory, searchHistory]
  )

  // Função de busca (encapsulada para reuso)
  const performSearch = useCallback(
    (searchQuery: string, wsId: string) => {
      if (searchQuery.trim().length < 2) {
        setResults([])
        setHasSearched(false)
        return
      }

      startTransition(async () => {
        setError(null)
        setHasSearched(true)

        const response = await semanticSearch(searchQuery, {
          workspaceId: wsId || undefined,
        })

        if (response.error) {
          setError(response.error)
          setResults([])
          return
        }

        setResults(response.results ?? [])
        saveHistory(searchQuery)
      })
    },
    [saveHistory]
  )

  // Debounce da busca automática
  useEffect(() => {
    if (!autoSearch) return

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (query.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(query, workspaceId)
      }, debounceDelay)
    } else {
      setResults([])
      setHasSearched(false)
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [query, workspaceId, autoSearch, debounceDelay, performSearch])

  // Submissão manual (botão ou Enter)
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    performSearch(query, workspaceId)
  }

  const handleBackfill = () => {
    startBackfill(async () => {
      setBackfillMessage(null)
      setError(null)
      const result = await backfillEmbeddings()

      if (result.error) {
        setError(result.error)
        return
      }

      setBackfillMessage(
        `Indexação concluída: ${result.notesIndexed} nota(s) e ${result.cardsIndexed} flashcard(s).`
      )
    })
  }

  const handleHistoryClick = (term: string) => {
    setQuery(term)
    setShowHistory(false)
    performSearch(term, workspaceId)
  }

  const isLoading = isPending || (autoSearch && query.trim().length >= 2 && results.length === 0 && !error && !hasSearched)

  // Aplicando filtros e ordenações locais
  const filteredAndSortedResults = results
    .filter((r) => {
      if (sourceTypeFilter === 'all') return true
      if (sourceTypeFilter === 'note') return r.sourceType === 'note'
      if (sourceTypeFilter === 'flashcard') return r.sourceType.startsWith('flashcard')
      return true
    })
    .sort((a, b) => {
      if (orderBy === 'date') {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      }
      return b.similarity - a.similarity
    })

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      
      {/* O cabeçalho foi removido daqui, pois agora ele é renderizado pela página pai (BuscaPage) */}

      <form onSubmit={handleSubmit} className="panel space-y-4 p-4 sm:p-5">
        {/* Linha 1: Input + Botão Buscar integrado */}
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-strong">
            O que você quer relembrar?
            {autoSearch && (
              <span className="ml-2 text-xs font-normal text-text-muted">(busca automática)</span>
            )}
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: como funciona a repetição espaçada no cérebro"
              className="field pl-10 pr-[4.5rem] h-11 text-base w-full"
              autoFocus
              aria-label="Termo de busca"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isPending || query.trim().length < 2}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </div>
        </label>

        {/* Linha 2: Filtro e Indexação em linha (alinhado por base) */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2.5 items-stretch sm:items-end w-full">
          <div className="flex-1 min-w-0">
            <label htmlFor="workspace-filter" className="mb-1.5 block text-xs font-medium text-text-strong">
              Filtrar por workspace
            </label>
            <select
              id="workspace-filter"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="field w-full min-w-0 truncate"
            >
              <option value="">Todos os workspaces</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleBackfill}
            disabled={isBackfilling}
            className="btn-secondary h-[42px] whitespace-nowrap flex items-center justify-center gap-2 px-3 sm:px-4 shrink-0"
            title="Indexar todo o conteúdo do workspace"
          >
            {isBackfilling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="hidden sm:inline">Indexar conteúdo</span>
          </button>
        </div>

        {enableHistory && searchHistory.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-strong transition-colors"
            >
              <Clock className="size-3" />
              {showHistory ? 'Ocultar buscas recentes' : 'Mostrar buscas recentes'}
            </button>
            {showHistory && (
              <div className="mt-2 flex flex-wrap gap-2">
                {searchHistory.map((term, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleHistoryClick(term)}
                    className="rounded-full bg-surface-muted px-3 py-1 text-xs text-text-medium hover:bg-surface-hover transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {backfillMessage && (
        <div className="flex items-start gap-3 p-4 bg-success-soft/30 dark:bg-success-soft/10 border-l-4 border-l-success border border-border/50 rounded-r-xl rounded-l-md text-success text-sm shadow-[0_2px_12px_rgba(34,197,94,0.05)] animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-success mt-0.5" />
          <span className="flex-1 font-medium">{backfillMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 bg-error-soft/30 dark:bg-error-soft/10 border-l-4 border-l-error border border-border/50 rounded-r-xl rounded-l-md text-error text-sm shadow-[0_2px_12px_rgba(220,38,38,0.05)] animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-error" />
          <span className="flex-1 font-medium">{error}</span>
          <button
            type="button"
            onClick={() => handleSubmit()}
            className="shrink-0 text-error hover:underline text-xs font-semibold transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Filtros e Ordenação rápidos */}
      {hasSearched && results.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mr-1">Tipo:</span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'note', label: 'Notas' },
              { id: 'flashcard', label: 'Flashcards' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceTypeFilter(tab.id as any)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  sourceTypeFilter === tab.id
                    ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                    : 'bg-surface text-text-muted border-border hover:bg-surface-hover'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="order-by-select" className="text-xs font-medium text-text-muted">
              Ordenar por:
            </label>
            <select
              id="order-by-select"
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as any)}
              className="field h-8 py-0.5 text-xs bg-surface"
            >
              <option value="relevance">Mais Relevantes</option>
              <option value="date">Mais Recentes</option>
            </select>
          </div>
        </div>
      )}

      {/* Estado de carregamento (skeleton) */}
      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="h-5 w-16 rounded-full bg-surface-muted"></div>
                <div className="h-4 w-24 rounded bg-surface-muted"></div>
              </div>
              <div className="h-4 w-3/4 rounded bg-surface-muted mb-1"></div>
              <div className="h-3 w-full rounded bg-surface-muted"></div>
              <div className="h-3 w-2/3 rounded bg-surface-muted mt-1"></div>
            </div>
          ))}
        </div>
      )}

      {/* Nenhum resultado */}
      {hasSearched && !isPending && !error && filteredAndSortedResults.length === 0 && !isLoading && (
        <div className="panel-muted py-12 text-center animate-in fade-in zoom-in-95 duration-300">
          <Brain className="mx-auto mb-3 size-8 text-text-muted" />
          <p className="text-sm font-medium text-text-strong">Nenhum resultado relevante encontrado</p>
          <p className="mt-1 text-xs text-text-muted">
            Tente outros termos ou remova os filtros ativos para ver mais resultados.
          </p>
        </div>
      )}

      {/* Resultados */}
      {filteredAndSortedResults.length > 0 && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>{filteredAndSortedResults.length} resultado{filteredAndSortedResults.length > 1 && 's'}</span>
            <span className="text-xs">
              {orderBy === 'date' ? 'data de criação' : 'relevância'}
            </span>
          </div>

          <ul className="space-y-3">
            {filteredAndSortedResults.map((result, index) => (
              <li key={result.id} className="animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: `${index * 30}ms` }}>
                <div className="panel block p-4 bg-surface hover:border-primary/50 transition-all">
                  <Link
                    href={result.href}
                    className="block"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        {SOURCE_TYPE_LABELS[result.sourceType]}
                      </span>
                      {result.workspaceName && (
                        <span className="text-xs text-text-muted truncate max-w-[120px]">
                          {result.workspaceName}
                        </span>
                      )}
                      <span className="ml-auto text-xs font-medium text-success">
                        {Math.round(result.similarity * 100)}%
                      </span>
                    </div>

                    {result.noteTitle && (
                      <p className="mb-1 text-sm font-semibold text-text-strong line-clamp-1">
                        {result.noteTitle}
                      </p>
                    )}

                    {/* Destaque do texto buscado */}
                    <p 
                      className="line-clamp-3 text-sm leading-relaxed text-text-medium"
                      dangerouslySetInnerHTML={{ __html: getHighlightedText(result.chunkText, query) }}
                    />
                  </Link>

                  {/* Acordeão de Chunks adicionais */}
                  {result.additionalChunks && result.additionalChunks.length > 0 && (
                    <div className="mt-3 border-t border-border/50 pt-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleNoteExpanded(result.noteId || '')}
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        {expandedNotes[result.noteId || ''] 
                          ? 'Ocultar outros trechos' 
                          : `Mostrar outros ${result.additionalChunks.length} trechos relevantes nesta nota`}
                      </button>

                      {expandedNotes[result.noteId || ''] && (
                        <div className="mt-2 space-y-2 pl-3 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200">
                          {result.additionalChunks.map((chunk) => (
                            <div key={chunk.id} className="text-xs text-text-medium bg-surface-muted/40 p-2.5 rounded-lg border border-border/40">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider">similaridade</span>
                                <span className="text-[10px] font-semibold text-success">{Math.round(chunk.similarity * 100)}%</span>
                              </div>
                              <p 
                                className="leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: getHighlightedText(chunk.chunkText, query) }} 
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}