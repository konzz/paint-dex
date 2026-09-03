import type { BrandId } from '../data/paints'
import { INVENTORY_ID, supabase } from './supabase'

const CACHE_KEY = 'mini-paint-tracker:v2'
const LEGACY_CACHE_KEY = 'mini-paint-tracker:v1'
const SAVE_DEBOUNCE_MS = 450

export type Palette = {
  id: string
  name: string
  paintIds: string[]
}

export type SavedState = {
  v: 2
  owned: string[]
  preferredBrand: BrandId
  palettes: Palette[]
  activePaletteId: string | null
}

export const DEFAULT_STATE: SavedState = {
  v: 2,
  owned: [],
  preferredBrand: 'citadel',
  palettes: [],
  activePaletteId: null,
}

type InventoryRow = {
  id: string
  owned: string[] | null
  preferred_brand: string | null
  palettes?: unknown
  active_palette_id?: string | null
  updated_at?: string
}

function normalizeBrand(brand: unknown): BrandId {
  return brand === 'ttc' || brand === 'citadel' || brand === 'vallejo' || brand === 'ak'
    ? brand
    : 'citadel'
}

function normalizePalette(raw: unknown): Palette | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<Palette>
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.paintIds)) {
    return null
  }
  return {
    id: item.id,
    name: item.name.trim() || 'Paleta',
    paintIds: item.paintIds.filter((id): id is string => typeof id === 'string'),
  }
}

type ImportPayload = {
  v?: number
  owned?: unknown
  preferredBrand?: unknown
  preferred_brand?: unknown
  palettes?: unknown
  activePaletteId?: unknown
}

export function normalizeState(raw: ImportPayload | null | undefined): SavedState {
  if (!raw || (raw.v !== 1 && raw.v !== 2) || !Array.isArray(raw.owned)) {
    return { ...DEFAULT_STATE, palettes: [] }
  }

  const palettes = Array.isArray(raw.palettes)
    ? raw.palettes.map(normalizePalette).filter((p): p is Palette => p != null)
    : []

  const activePaletteId =
    typeof raw.activePaletteId === 'string' && palettes.some((p) => p.id === raw.activePaletteId)
      ? raw.activePaletteId
      : null

  return {
    v: 2,
    owned: raw.owned.filter((k): k is string => typeof k === 'string'),
    preferredBrand: normalizeBrand(raw.preferredBrand),
    palettes,
    activePaletteId,
  }
}

function rowToState(row: InventoryRow): SavedState {
  return normalizeState({
    v: 2,
    owned: Array.isArray(row.owned) ? row.owned : [],
    preferredBrand: normalizeBrand(row.preferred_brand),
    palettes: Array.isArray(row.palettes) ? (row.palettes as Palette[]) : [],
    activePaletteId: row.active_palette_id ?? null,
  })
}

export function stateFingerprint(state: SavedState): string {
  return JSON.stringify({
    preferredBrand: state.preferredBrand,
    owned: [...state.owned].sort(),
    activePaletteId: state.activePaletteId,
    palettes: state.palettes
      .map((p) => ({ id: p.id, name: p.name, paintIds: [...p.paintIds].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  })
}

export function loadCachedState(): SavedState {
  try {
    const raw = localStorage.getItem(CACHE_KEY) ?? localStorage.getItem(LEGACY_CACHE_KEY)
    if (!raw) return { ...DEFAULT_STATE, palettes: [] }
    return normalizeState(JSON.parse(raw) as Partial<SavedState>)
  } catch {
    return { ...DEFAULT_STATE, palettes: [] }
  }
}

export function cacheState(state: SavedState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state))
}

export async function fetchRemoteState(): Promise<SavedState | null> {
  const { data, error } = await supabase
    .from('paint_inventory')
    .select('id, owned, preferred_brand, palettes, active_palette_id, updated_at')
    .eq('id', INVENTORY_ID)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return rowToState(data as InventoryRow)
}

export async function saveRemoteState(state: SavedState): Promise<void> {
  const { error } = await supabase
    .from('paint_inventory')
    .update({
      owned: state.owned,
      preferred_brand: state.preferredBrand,
      palettes: state.palettes,
      active_palette_id: state.activePaletteId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', INVENTORY_ID)
  if (error) throw error
}

/** Load remote inventory; if empty and local cache has data, push the cache up once. */
export async function hydrateState(): Promise<SavedState> {
  const cached = loadCachedState()
  const remote = await fetchRemoteState()

  if (!remote) {
    const seed = cached.owned.length > 0 || cached.palettes.length > 0 ? cached : DEFAULT_STATE
    const { error } = await supabase.from('paint_inventory').upsert({
      id: INVENTORY_ID,
      owned: seed.owned,
      preferred_brand: seed.preferredBrand,
      palettes: seed.palettes,
      active_palette_id: seed.activePaletteId,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    cacheState(seed)
    return seed
  }

  if (
    remote.owned.length === 0 &&
    remote.palettes.length === 0 &&
    (cached.owned.length > 0 || cached.palettes.length > 0)
  ) {
    await saveRemoteState(cached)
    cacheState(cached)
    return cached
  }

  cacheState(remote)
  return remote
}

export function serializeExport(state: SavedState) {
  return JSON.stringify(
    {
      v: 2,
      owned: state.owned,
      preferredBrand: state.preferredBrand,
      palettes: state.palettes,
    },
    null,
    2,
  )
}

export function parseImport(text: string): SavedState {
  const parsed = JSON.parse(text) as ImportPayload
  if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !Array.isArray(parsed.owned)) {
    throw new Error('Formato no válido')
  }
  return normalizeState(parsed)
}

export function newPaletteId() {
  return `pal_${crypto.randomUUID().slice(0, 8)}`
}

type SaveHandlers = {
  onError?: (message: string) => void
  onSuccess?: () => void
}

/** Coalesced remote saver: at most one timer + one in-flight request. */
export function createInventorySaver(handlers: SaveHandlers = {}) {
  let lastSyncedFp = ''
  let pending: SavedState | null = null
  let timer: number | null = null
  let inFlight = false

  function noteSynced(state: SavedState) {
    lastSyncedFp = stateFingerprint(state)
    pending = null
  }

  function isSynced(state: SavedState) {
    return stateFingerprint(state) === lastSyncedFp
  }

  async function flush() {
    timer = null
    if (inFlight) return

    const toSave = pending
    if (!toSave) return

    const fp = stateFingerprint(toSave)
    if (fp === lastSyncedFp) {
      pending = null
      return
    }

    pending = null
    inFlight = true
    try {
      await saveRemoteState(toSave)
      lastSyncedFp = fp
      handlers.onSuccess?.()
    } catch {
      if (!pending) pending = toSave
      handlers.onError?.('No se pudo guardar en la nube')
    } finally {
      inFlight = false
      if (pending && stateFingerprint(pending) !== lastSyncedFp) {
        timer = window.setTimeout(() => {
          void flush()
        }, SAVE_DEBOUNCE_MS)
      }
    }
  }

  function schedule(state: SavedState) {
    const fp = stateFingerprint(state)
    if (fp === lastSyncedFp) {
      pending = null
      return
    }
    pending = state
    if (timer != null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void flush()
    }, SAVE_DEBOUNCE_MS)
  }

  function flushNow(state?: SavedState) {
    if (state) {
      const fp = stateFingerprint(state)
      if (fp !== lastSyncedFp) pending = state
    }
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
    void flush()
  }

  function dispose() {
    if (timer != null) window.clearTimeout(timer)
    timer = null
  }

  return { noteSynced, isSynced, schedule, flushNow, dispose }
}
