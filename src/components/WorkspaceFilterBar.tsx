'use client'

import { useState, useTransition, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2 } from '@/components/icons'

interface WorkspaceFilterBarProps {
  initialSearch?: string
  initialSort?: string
}

export default function WorkspaceFilterBar({ initialSearch = '', initialSort = 'recent' }: WorkspaceFilterBarProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [sort, setSort] = useState(initialSort)
  const [applied, setApplied] = useState({ search: initialSearch, sort: initialSort })
  const [isPending, startTransition] = useTransition()
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  if (!isPending && (applied.search !== initialSearch || applied.sort !== initialSort)) {
    setApplied({ search: initialSearch, sort: initialSort })
    setSearch(initialSearch)
    setSort(initialSort)
  }

  // Função que atualiza a URL (encapsulada)
  const updateQuery = useCallback((nextSearch: string, nextSort: string) => {
    startTransition(() => {
      const url = new URL(window.location.href)
      if (nextSearch) {
        url.searchParams.set('search', nextSearch)
      } else {
        url.searchParams.delete('search')
      }
      url.searchParams.set('sort', nextSort)
      router.push(url.pathname + url.search + url.hash, { scroll: false })
    })
  }, [router])

  // Debounce para busca automática
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    debounceTimerRef.current = setTimeout(() => {
      updateQuery(value, sort)
    }, 300) // 300ms de debounce
  }

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [])

  const handleClear = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    setSearch('')
    updateQuery('', sort)
    inputRef.current?.focus()
  }

  const handleSortChange = (value: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    setSort(value)
    updateQuery(search, value)
  }

  return (
    <div className="wp-filters">
      <div className="wp-search">
        <Search size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Buscar notas..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Buscar notas por título"
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            onClick={handleClear}
            className="wp-search-clear"
            aria-label="Limpar busca"
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
        {isPending && (
          <span role="status" className="wp-filter-loading"><Loader2 size={16} className="wp-spinner" aria-hidden="true" /><span className="sr-only">Atualizando anotações</span></span>
        )}
      </div>

      <label className="wp-sort">
        <span>Ordenar por</span>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          disabled={isPending}
        >
          <option value="recent">Mais recentes</option>
          <option value="name">A-Z</option>
          <option value="cards">Mais flashcards</option>
        </select>
      </label>
    </div>
  )
}
