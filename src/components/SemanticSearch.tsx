'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, Clock, FileText, Folder, Layers,
  Loader2, RefreshCw, Search, SearchX,
} from 'lucide-react'
import { semanticSearch } from '@/actions/search'
import { backfillEmbeddings } from '@/actions/embeddings'
import { SOURCE_TYPE_LABELS, type SemanticSearchResult } from '@/types/search'

type Workspace = { id: string; name: string }
type Criteria = { query: string; workspaceId: string }
type SearchState =
  | { status: 'idle' | 'waiting' | 'loading' }
  | { status: 'done'; results: SemanticSearchResult[] }
  | { status: 'error'; message: string }
type IndexState = { status: 'idle' | 'loading' } | { status: 'done' | 'error'; message: string }

const sourceFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'note', label: 'Notas' },
  { id: 'flashcard', label: 'Flashcards' },
] as const

function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) return <>{text}</>
  const escaped = trimmed.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  return <>{text.split(new RegExp(`(${escaped})`, 'gi')).map((part, index) => (
    part.toLowerCase() === trimmed.toLowerCase() ? <mark key={index}>{part}</mark> : part
  ))}</>
}

export function SemanticResultCard({ result, query }: { result: SemanticSearchResult; query: string }) {
  const isNote = result.sourceType === 'note'
  const Icon = isNote ? FileText : Layers
  return (
    <li className="ss-result" data-source={result.sourceType}>
      <div className="ss-result-glyph" aria-hidden="true"><Icon size={20} /></div>
      <div className="ss-result-body">
        <Link href={result.href} className="ss-result-link">
          <div className="ss-result-meta">
            <span className="ss-tag">{SOURCE_TYPE_LABELS[result.sourceType]}</span>
            {result.workspaceName && <span className="ss-result-workspace"><Folder size={14} aria-hidden="true" /> {result.workspaceName}</span>}
            <span className="ss-score">{Math.round(result.similarity * 100)}% de similaridade</span>
          </div>
          <div className="ss-result-heading">
            <h3>{result.noteTitle || SOURCE_TYPE_LABELS[result.sourceType]}</h3>
            <ArrowUpRight size={18} aria-hidden="true" />
          </div>
          <p className="ss-excerpt"><HighlightedText text={result.chunkText} query={query} /></p>
        </Link>
        {!!result.additionalChunks?.length && (
          <details className="ss-chunks">
            <summary>Mais trechos desta nota ({result.additionalChunks.length}) <ChevronDown size={14} aria-hidden="true" /></summary>
            <ul>
              {result.additionalChunks.map((chunk) => (
                <li key={chunk.id}>
                  <p><HighlightedText text={chunk.chunkText} query={query} /></p>
                  <span className="ss-score">{Math.round(chunk.similarity * 100)}% de similaridade</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  )
}

export default function SemanticSearch({
  workspaces,
  autoSearch = true,
  debounceDelay = 300,
  enableHistory = false,
}: {
  workspaces: Workspace[]
  autoSearch?: boolean
  debounceDelay?: number
  enableHistory?: boolean
}) {
  const [criteria, setCriteria] = useState<Criteria>({ query: '', workspaceId: '' })
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [index, setIndex] = useState<IndexState>({ status: 'idle' })
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<(typeof sourceFilters)[number]['id']>('all')
  const [order, setOrder] = useState<'relevance' | 'date'>('relevance')
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sequence = useRef(0)
  const lastRequested = useRef<Criteria | null>(null)

  useEffect(() => {
    if (!enableHistory) return
    const timer = setTimeout(() => {
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem('semantic-search-history') ?? '[]')
        if (Array.isArray(stored)) {
          setHistory(stored.filter((term): term is string => typeof term === 'string').slice(0, 10))
        }
      } catch { /* O armazenamento pode não estar disponível. */ }
    }, 0)
    return () => clearTimeout(timer)
  }, [enableHistory])

  useEffect(() => {
    if (!showHistory) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowHistory(false)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showHistory])

  useEffect(() => () => { sequence.current += 1 }, [])

  const performSearch = useCallback(async (current: Criteria) => {
    if (current.query.trim().length < 2) return
    const id = ++sequence.current
    lastRequested.current = current
    setSearch({ status: 'loading' })
    try {
      const response = await semanticSearch(current.query, { workspaceId: current.workspaceId || undefined })
      if (id !== sequence.current) return
      if (response.error) {
        setSearch({ status: 'error', message: response.error })
        return
      }
      setSearch({ status: 'done', results: response.results ?? [] })
      if (enableHistory) {
        setHistory((previous) => {
          const updated = [current.query, ...previous.filter((term) => term !== current.query)].slice(0, 10)
          try { sessionStorage.setItem('semantic-search-history', JSON.stringify(updated)) } catch { /* Armazenamento indisponível. */ }
          return updated
        })
      }
    } catch {
      if (id === sequence.current) setSearch({ status: 'error', message: 'Não foi possível carregar os resultados.' })
    }
  }, [enableHistory])

  useEffect(() => {
    if (!autoSearch || criteria.query.trim().length < 2 || lastRequested.current === criteria) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void performSearch(criteria)
    }, debounceDelay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [autoSearch, criteria, debounceDelay, performSearch])

  function changeCriteria(next: Criteria, immediate = false) {
    sequence.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setCriteria(next)
    if (immediate) {
      void performSearch(next)
    } else {
      setSearch({ status: autoSearch && next.query.trim().length >= 2 ? 'waiting' : 'idle' })
    }
  }

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (search.status === 'loading' || criteria.query.trim().length < 2) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    void performSearch(criteria)
  }

  async function indexContent() {
    setIndex({ status: 'loading' })
    try {
      const result = await backfillEmbeddings()
      if (result.error) {
        setIndex({ status: 'error', message: result.error })
      } else {
        setIndex({ status: 'done', message: `Indexação concluída: ${result.notesIndexed} nota(s) e ${result.cardsIndexed} flashcard(s).` })
      }
    } catch {
      setIndex({ status: 'error', message: 'Não foi possível indexar o conteúdo.' })
    }
  }

  const visibleResults = useMemo(() => {
    if (search.status !== 'done') return []
    return search.results.filter((result) => (
      sourceFilter === 'all' || (sourceFilter === 'note' ? result.sourceType === 'note' : result.sourceType.startsWith('flashcard'))
    )).sort((a, b) => {
      if (order === 'date') return (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)
      return b.similarity - a.similarity
    })
  }, [search, sourceFilter, order])

  return (
    <div className="ss-search">
      <form onSubmit={submit} className="ss-panel ss-form" role="search" aria-label="Busca semântica">
        <div className="ss-field-group">
          <div className="ss-field-title">
            <label htmlFor="semantic-query">O que você quer relembrar?</label>
            {autoSearch && <span className="ss-auto"><span aria-hidden="true" /> Busca automática</span>}
          </div>
          <div className="ss-query-row">
            <div className="ss-query-field">
              <Search size={20} aria-hidden="true" />
              <input
                id="semantic-query" ref={inputRef} type="search" value={criteria.query}
                onChange={(event) => changeCriteria({ ...criteria, query: event.target.value })}
                placeholder="Ex.: como funciona a repetição espaçada?"
                autoFocus autoComplete="off" enterKeyHint="search" aria-describedby="ss-search-hint"
              />
            </div>
            <button type="submit" className="ss-button ss-primary" disabled={search.status === 'loading' || criteria.query.trim().length < 2}>
              {search.status === 'loading' ? <Loader2 className="ss-spinner" size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
              Buscar
            </button>
          </div>
          <p id="ss-search-hint" className="ss-hint">
            {search.status === 'waiting' ? 'Aguardando uma pausa na digitação…' : 'Descreva o assunto em poucos termos ou em uma pergunta.'}
          </p>
        </div>
        <div className="ss-tools">
          <div className="ss-workspace">
            <label htmlFor="workspace-filter">Filtrar por workspace</label>
            <div className="ss-select">
              <Folder size={17} aria-hidden="true" />
              <select id="workspace-filter" value={criteria.workspaceId} onChange={(event) => changeCriteria({ ...criteria, workspaceId: event.target.value })}>
                <option value="">Todos os workspaces</option>
                {workspaces.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </div>
          </div>
          <button type="button" className="ss-button ss-secondary" disabled={index.status === 'loading'} onClick={() => void indexContent()}>
            {index.status === 'loading' ? <Loader2 size={17} className="ss-spinner" aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
            {index.status === 'loading' ? 'Indexando…' : 'Indexar conteúdo'}
          </button>
        </div>
        {enableHistory && history.length > 0 && (
          <div className="ss-history">
            <button type="button" className="ss-text-button" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory} aria-controls="ss-search-history">
              <Clock size={16} aria-hidden="true" /> {showHistory ? 'Ocultar buscas recentes' : 'Mostrar buscas recentes'}
            </button>
            <ul className="ss-filters" id="ss-search-history" hidden={!showHistory}>
              {history.map((term) => <li key={term}><button type="button" onClick={() => {
                changeCriteria({ ...criteria, query: term }, true)
                setShowHistory(false)
              }}>{term}</button></li>)}
            </ul>
          </div>
        )}
      </form>

      {index.status === 'done' && <div className="ss-notice ss-success" role="status">
        <CheckCircle2 size={19} aria-hidden="true" /> <p>{index.message}</p>
      </div>}
      {index.status === 'error' && <div className="ss-notice ss-error" role="alert">
        <AlertTriangle size={19} aria-hidden="true" /> <p>{index.message}</p>
        <button type="button" className="ss-text-button" onClick={() => void indexContent()}>Repetir indexação</button>
      </div>}
      {search.status === 'error' && <div className="ss-notice ss-error" role="alert">
        <AlertTriangle size={19} aria-hidden="true" /> <p>{search.message}</p>
        <button type="button" className="ss-text-button" onClick={() => submit()}>Repetir busca</button>
      </div>}

      {search.status === 'loading' && <span className="sr-only" role="status">Buscando no seu conteúdo…</span>}
      <div aria-live="polite" aria-busy={search.status === 'loading'} className="ss-results">
        {search.status === 'loading' && [1, 2, 3].map((key) => <div className="ss-panel ss-skeleton" key={key} aria-hidden="true">
          <span /><span /><span />
        </div>)}
        {search.status === 'done' && (
          <>
            {search.results.length > 0 && <div className="ss-results-tools">
              <div>
                <h2>Resultados</h2>
                <p>{visibleResults.length} {visibleResults.length === 1 ? 'resultado' : 'resultados'}</p>
              </div>
              <div className="ss-result-controls">
                <div className="ss-filters" role="group" aria-label="Filtrar por tipo de conteúdo">
                  {sourceFilters.map(({ id, label }) => <button type="button" key={id} aria-pressed={sourceFilter === id} onClick={() => setSourceFilter(id)}>{label}</button>)}
                </div>
                <div className="ss-select ss-sort">
                  <label htmlFor="semantic-order" className="sr-only">Ordenar resultados</label>
                  <select id="semantic-order" value={order} onChange={(event) => setOrder(event.target.value === 'date' ? 'date' : 'relevance')}>
                    <option value="relevance">Mais relevantes</option>
                    <option value="date">Mais recentes</option>
                  </select>
                  <ChevronDown size={15} aria-hidden="true" />
                </div>
              </div>
            </div>}
            {visibleResults.length > 0 ? <ul className="ss-result-list">
              {visibleResults.map((result) => <SemanticResultCard key={result.id} result={result} query={criteria.query} />)}
            </ul> : <div className="ss-panel ss-empty">
              <span className="ss-empty-icon"><SearchX size={25} aria-hidden="true" /></span>
              <h2>{search.results.length > 0 ? 'Nenhum resultado neste filtro' : 'Nenhum resultado relevante'}</h2>
              <p>{search.results.length > 0 ? 'Selecione Todos para ver os outros tipos de conteúdo.' : 'Tente outros termos ou amplie o filtro de workspaces.'}</p>
            </div>}
          </>
        )}
      </div>
    </div>
  )
}
