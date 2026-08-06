'use client'

const DB_NAME = 'omnimind_offline_db'
const DB_VERSION = 1
const CARDS_STORE = 'cached_cards'
const REVIEWS_STORE = 'pending_reviews'

export interface PendingReview {
  id?: number
  cardId: string
  grade: number
  currentFsrsState: any
  timestamp: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('IndexedDB não suportado neste ambiente'))
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        db.createObjectStore(CARDS_STORE, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(REVIEWS_STORE)) {
        db.createObjectStore(REVIEWS_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Salva uma lista de cards no cache offline (substitui os existentes).
 */
export async function saveCardsToCache(cards: any[]): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(CARDS_STORE, 'readwrite')
    const store = tx.objectStore(CARDS_STORE)
    
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear()
      clearReq.onsuccess = () => {
        if (cards.length === 0) return resolve()
        let addedCount = 0
        cards.forEach((card) => {
          const req = store.put(card)
          req.onsuccess = () => {
            addedCount++
            if (addedCount === cards.length) resolve()
          }
          req.onerror = () => reject(req.error)
        })
      }
      clearReq.onerror = () => reject(clearReq.error)
    })
  } catch (error) {
    console.error('[offlineStore] Erro ao salvar cards no cache:', error)
  }
}

/**
 * Recupera todos os cards cacheados no IndexedDB.
 */
export async function getCachedCards(): Promise<any[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(CARDS_STORE, 'readonly')
    const store = tx.objectStore(CARDS_STORE)

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[offlineStore] Erro ao buscar cards cacheados:', error)
    return []
  }
}

/**
 * Adiciona uma revisão à fila pendente para ser enviada quando voltar a internet.
 */
export async function savePendingReview(review: Omit<PendingReview, 'id' | 'timestamp'>): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(REVIEWS_STORE, 'readwrite')
    const store = tx.objectStore(REVIEWS_STORE)

    const item: PendingReview = {
      ...review,
      timestamp: Date.now(),
    }

    return new Promise((resolve, reject) => {
      const request = store.add(item)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[offlineStore] Erro ao guardar revisão pendente:', error)
  }
}

/**
 * Retorna a lista de revisões pendentes na fila.
 */
export async function getPendingReviews(): Promise<PendingReview[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(REVIEWS_STORE, 'readonly')
    const store = tx.objectStore(REVIEWS_STORE)

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[offlineStore] Erro ao carregar revisões pendentes:', error)
    return []
  }
}

/**
 * Remove um item individual da fila pendente (após envio com sucesso).
 */
export async function removePendingReview(id: number): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(REVIEWS_STORE, 'readwrite')
    const store = tx.objectStore(REVIEWS_STORE)

    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[offlineStore] Erro ao remover revisão pendente:', error)
  }
}

/**
 * Limpa toda a fila de revisões pendentes.
 */
export async function clearAllPendingReviews(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(REVIEWS_STORE, 'readwrite')
    const store = tx.objectStore(REVIEWS_STORE)

    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[offlineStore] Erro ao limpar revisões pendentes:', error)
  }
}
