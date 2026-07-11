'use client'

import { useState, useTransition, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2 } from 'lucide-react'

interface WorkspaceFilterBarProps {
  initialSearch?: string
  initialSort?: string
}

export default function WorkspaceFilterBar({ initialSearch = '', initialSort = 'recent' }: WorkspaceFilterBarProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [sort, setSort] = useState(initialSort)
  const [isPending, startTransition] = useTransition()
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      router.push(url.toString())
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
    setSearch('')
    updateQuery('', sort)
    inputRef.current?.focus()
  }

  const handleSortChange = (value: string) => {
    setSort(value)
    updateQuery(search, value)
  }

  return (
    <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
      <div className="relative flex-1 max-w-full sm:max-w-xs w-full">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Buscar notas..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="field pl-10 pr-10 w-full"
          aria-label="Buscar notas por título ou conteúdo"
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-strong transition-colors"
            aria-label="Limpar busca"
          >
            <X className="size-4" />
          </button>
        )}
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <label htmlFor="workspace-sort" className="sr-only">Ordenar por</label>
        <select
          id="workspace-sort"
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="field w-full sm:w-auto min-h-[44px]"
          disabled={isPending}
          aria-label="Ordenar workspaces"
        >
          <option value="recent">Mais recentes</option>
          <option value="name">A-Z</option>
          <option value="cards">Mais cards</option>
        </select>
      </div>
    </div>
  )
}