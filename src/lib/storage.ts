import { PAINTS, type Paint } from '../data/paints'
import { INVENTORY_ID, supabase } from './supabase'

const PALLID_HANDS_ID = 'pal_pallid_hands'

/** Ensure the catalog palette exists as “Pallid Hands”; keep “Todas” as the null tab. */
export function ensurePallidHandsPalette(state: SavedState): SavedState {
  if (state.palettes.length === 0) {
    return {
      ...state,
      palettes: [{ id: PALLID_HANDS_ID, name: 'Pallid Hands', paintIds: PAINTS.map((p) => p.id) }],
      activePaletteId: PALLID_HANDS_ID,
    }
  }

  if (state.palettes.length === 1 && state.palettes[0].name !== 'Pallid Hands') {
    const only = state.palettes[0]
    return {
      ...state,
      palettes: [{ ...only, name: 'Pallid Hands' }],
      activePaletteId: state.activePaletteId ?? only.id,
    }
  }

  const hasPallid = state.palettes.some((p) => p.name === 'Pallid Hands')
  if (!hasPallid) {
    return {
      ...state,
      palettes: [
        { id: PALLID_HANDS_ID, name: 'Pallid Hands', paintIds: PAINTS.map((p) => p.id) },
        ...state.palettes,
      ],
    }
  }

  return state
}

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
  palettes: Palette[]
  activePaletteId: string | null
  extraPaints: Paint[]
}

export const DEFAULT_STATE: SavedState = {
  v: 2,
  owned: [],
  palettes: [],
  activePaletteId: null,
  extraPaints: [],
}

type InventoryRow = {
  id: string
  owned: string[] | null
  palettes?: unknown
  active_palette_id?: string | null
  extra_paints?: unknown
  updated_at?: string
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

function normalizeExtraPaint(raw: unknown): Paint | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<Paint>
  if (typeof item.id !== 'string' || typeof item.original !== 'string' || typeof item.hex !== 'string') {
    return null
  }
  if (!item.names || typeof item.names !== 'object') return null
  const names = item.names as Record<string, unknown>
  return {
    id: item.id,
    original: item.original,
    hex: item.hex,
    kind:
      item.kind === 'base' ||
      item.kind === 'layer' ||
      item.kind === 'shade' ||
      item.kind === 'contrast' ||
      item.kind === 'technical'
        ? item.kind
        : 'base',
    metallic: item.metallic === true ? true : undefined,
    names: {
      ttc: typeof names.ttc === 'string' ? names.ttc : null,
      citadel: typeof names.citadel === 'string' ? names.citadel : null,
      vallejo: typeof names.vallejo === 'string' ? names.vallejo : null,
      ak: typeof names.ak === 'string' ? names.ak : null,
    },
  }
}

type ImportPayload = {
  v?: number
  owned?: unknown
  palettes?: unknown
  activePaletteId?: unknown
  extraPaints?: unknown
}

export function normalizeState(raw: ImportPayload | null | undefined): SavedState {
  if (!raw || (raw.v !== 1 && raw.v !== 2) || !Array.isArray(raw.owned)) {
    return { ...DEFAULT_STATE, palettes: [], extraPaints: [] }
  }

  const palettes = Array.isArray(raw.palettes)
    ? raw.palettes.map(normalizePalette).filter((p): p is Palette => p != null)
    : []

  const extraPaints = Array.isArray(raw.extraPaints)
    ? raw.extraPaints.map(normalizeExtraPaint).filter((p): p is Paint => p != null)
    : []

  const activePaletteId =
    typeof raw.activePaletteId === 'string' && palettes.some((p) => p.id === raw.activePaletteId)
      ? raw.activePaletteId
      : null

  return {
    v: 2,
    owned: raw.owned.filter((k): k is string => typeof k === 'string'),
    palettes,
    activePaletteId,
    extraPaints,
  }
}

function rowToState(row: InventoryRow): SavedState {
  return normalizeState({
    v: 2,
    owned: Array.isArray(row.owned) ? row.owned : [],
    palettes: Array.isArray(row.palettes) ? (row.palettes as Palette[]) : [],
    activePaletteId: row.active_palette_id ?? null,
    extraPaints: Array.isArray(row.extra_paints) ? (row.extra_paints as Paint[]) : [],
  })
}

export function stateFingerprint(state: SavedState): string {
  return JSON.stringify({
    owned: [...state.owned].sort(),
    activePaletteId: state.activePaletteId,
    palettes: state.palettes
      .map((p) => ({ id: p.id, name: p.name, paintIds: [...p.paintIds].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    extraPaints: state.extraPaints.map((p) => p.id).sort(),
  })
}

export function loadCachedState(): SavedState {
  try {
    const raw = localStorage.getItem(CACHE_KEY) ?? localStorage.getItem(LEGACY_CACHE_KEY)
    if (!raw) return { ...DEFAULT_STATE, palettes: [], extraPaints: [] }
    return normalizeState(JSON.parse(raw) as ImportPayload)
  } catch {
    return { ...DEFAULT_STATE, palettes: [], extraPaints: [] }
  }
}

export function cacheState(state: SavedState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state))
}

export async function fetchRemoteState(): Promise<SavedState | null> {
  const { data, error } = await supabase
    .from('paint_inventory')
    .select('id, owned, palettes, active_palette_id, extra_paints, updated_at')
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
      palettes: state.palettes,
      active_palette_id: state.activePaletteId,
      extra_paints: state.extraPaints,
      updated_at: new Date().toISOString(),
    })
    .eq('id', INVENTORY_ID)
  if (error) throw error
}

/** Load remote inventory; if empty and local cache has data, push the cache up once. */
export async function hydrateState(): Promise<SavedState> {
  const cached = ensurePallidHandsPalette(loadCachedState())
  const remoteRaw = await fetchRemoteState()
  const remote = remoteRaw ? ensurePallidHandsPalette(remoteRaw) : null

  if (!remote) {
    const seed =
      cached.owned.length > 0 || cached.palettes.length > 0
        ? cached
        : ensurePallidHandsPalette(DEFAULT_STATE)
    const { error } = await supabase.from('paint_inventory').upsert({
      id: INVENTORY_ID,
      owned: seed.owned,
      palettes: seed.palettes,
      active_palette_id: seed.activePaletteId,
      extra_paints: seed.extraPaints,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    cacheState(seed)
    return seed
  }

  if (
    remoteRaw &&
    remoteRaw.owned.length === 0 &&
    remoteRaw.palettes.length === 0 &&
    (cached.owned.length > 0 || cached.palettes.length > 0)
  ) {
    const merged = ensurePallidHandsPalette({
      ...cached,
      owned: cached.owned.length > 0 ? cached.owned : remote.owned,
    })
    await saveRemoteState(merged)
    cacheState(merged)
    return merged
  }

  if (stateFingerprint(remote) !== stateFingerprint(remoteRaw ?? remote)) {
    await saveRemoteState(remote)
  }

  cacheState(remote)
  return remote
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
