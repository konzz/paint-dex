import type { BrandId } from '../data/paints'
import { INVENTORY_ID, supabase } from './supabase'

const CACHE_KEY = 'mini-paint-tracker:v1'

export type SavedState = {
  v: 1
  owned: string[]
  preferredBrand: BrandId
}

export const DEFAULT_STATE: SavedState = {
  v: 1,
  owned: [],
  preferredBrand: 'citadel',
}

type InventoryRow = {
  id: string
  owned: string[] | null
  preferred_brand: string | null
  updated_at?: string
}

function normalizeBrand(brand: unknown): BrandId {
  return brand === 'ttc' || brand === 'citadel' || brand === 'vallejo' || brand === 'ak'
    ? brand
    : 'citadel'
}

export function normalizeState(raw: Partial<SavedState> | null | undefined): SavedState {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.owned)) {
    return { ...DEFAULT_STATE }
  }
  return {
    v: 1,
    owned: raw.owned.filter((k): k is string => typeof k === 'string'),
    preferredBrand: normalizeBrand(raw.preferredBrand),
  }
}

function rowToState(row: InventoryRow): SavedState {
  return normalizeState({
    v: 1,
    owned: Array.isArray(row.owned) ? row.owned : [],
    preferredBrand: normalizeBrand(row.preferred_brand),
  })
}

export function loadCachedState(): SavedState {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    return normalizeState(JSON.parse(raw) as Partial<SavedState>)
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function cacheState(state: SavedState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state))
}

export async function fetchRemoteState(): Promise<SavedState | null> {
  const { data, error } = await supabase
    .from('paint_inventory')
    .select('id, owned, preferred_brand, updated_at')
    .eq('id', INVENTORY_ID)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return rowToState(data as InventoryRow)
}

export async function saveRemoteState(state: SavedState): Promise<void> {
  const { error } = await supabase.from('paint_inventory').upsert({
    id: INVENTORY_ID,
    owned: state.owned,
    preferred_brand: state.preferredBrand,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

/** Load remote inventory; if empty and local cache has data, push the cache up once. */
export async function hydrateState(): Promise<SavedState> {
  const cached = loadCachedState()
  const remote = await fetchRemoteState()

  if (!remote) {
    if (cached.owned.length > 0) {
      await saveRemoteState(cached)
      return cached
    }
    await saveRemoteState(DEFAULT_STATE)
    return { ...DEFAULT_STATE }
  }

  if (remote.owned.length === 0 && cached.owned.length > 0) {
    await saveRemoteState(cached)
    cacheState(cached)
    return cached
  }

  cacheState(remote)
  return remote
}

export function stateFingerprint(state: SavedState): string {
  return JSON.stringify({
    preferredBrand: state.preferredBrand,
    owned: [...state.owned].sort(),
  })
}

export function serializeExport(state: SavedState) {
  return JSON.stringify(state, null, 2)
}

export function parseImport(text: string): SavedState {
  const parsed = JSON.parse(text) as Partial<SavedState>
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.owned)) {
    throw new Error('Formato no válido')
  }
  return normalizeState(parsed)
}

export function subscribeInventory(onChange: (state: SavedState) => void) {
  const channel = supabase
    .channel('paint_inventory_shared')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'paint_inventory',
        filter: `id=eq.${INVENTORY_ID}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as InventoryRow | undefined
        if (!row || !('owned' in row)) return
        const next = rowToState(row)
        cacheState(next)
        onChange(next)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
