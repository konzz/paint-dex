import { PAINTS, type Paint } from '../data/paints'
import { INVENTORY_ID, supabase } from './supabase'

const PALLID_HANDS_ID = 'pal_pallid_hands'
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
  paints: Paint[]
}

export const DEFAULT_STATE: SavedState = {
  v: 2,
  owned: [],
  palettes: [],
  activePaletteId: null,
  paints: [],
}

type InventoryRow = {
  id: string
  owned: string[] | null
  palettes?: unknown
  active_palette_id?: string | null
  paints?: unknown
  extra_paints?: unknown
  updated_at?: string
}

export function normalizePaint(raw: unknown): Paint | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<Paint>
  if (typeof item.id !== 'string' || typeof item.original !== 'string') return null
  if (!item.names || typeof item.names !== 'object') return null
  const names = item.names as Record<string, unknown>
  const hex = typeof item.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.hex) ? item.hex : '#8A8580'
  return {
    id: item.id,
    original: item.original.trim() || 'Color',
    hex,
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
      ttc: typeof names.ttc === 'string' && names.ttc.trim() ? names.ttc.trim() : null,
      citadel: typeof names.citadel === 'string' && names.citadel.trim() ? names.citadel.trim() : null,
      vallejo: typeof names.vallejo === 'string' && names.vallejo.trim() ? names.vallejo.trim() : null,
      ak: typeof names.ak === 'string' && names.ak.trim() ? names.ak.trim() : null,
    },
  }
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

function mergePaints(base: Paint[], extras: Paint[]) {
  const byId = new Map<string, Paint>()
  for (const paint of base) byId.set(paint.id, paint)
  for (const paint of extras) {
    if (!byId.has(paint.id)) byId.set(paint.id, paint)
  }
  return [...byId.values()]
}

/** Seed catalog from built-in PAINTS + any legacy extras; keep “Todas” as null tab. */
export function ensureCatalog(state: SavedState, legacyExtra: Paint[] = []): SavedState {
  const paints =
    state.paints.length > 0
      ? mergePaints(state.paints, legacyExtra)
      : mergePaints(PAINTS, legacyExtra)

  const withPaints = { ...state, paints }
  return ensurePallidHandsPalette(withPaints)
}

function ensurePallidHandsPalette(state: SavedState): SavedState {
  const allIds = state.paints.map((p) => p.id)

  if (state.palettes.length === 0) {
    return {
      ...state,
      palettes: [{ id: PALLID_HANDS_ID, name: 'Pallid Hands', paintIds: allIds }],
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
        { id: PALLID_HANDS_ID, name: 'Pallid Hands', paintIds: allIds },
        ...state.palettes,
      ],
    }
  }

  return state
}

type ImportPayload = {
  v?: number
  owned?: unknown
  palettes?: unknown
  activePaletteId?: unknown
  paints?: unknown
  extraPaints?: unknown
}

export function normalizeState(raw: ImportPayload | null | undefined): SavedState {
  if (!raw || (raw.v !== 1 && raw.v !== 2) || !Array.isArray(raw.owned)) {
    return { ...DEFAULT_STATE }
  }

  const palettes = Array.isArray(raw.palettes)
    ? raw.palettes.map(normalizePalette).filter((p): p is Palette => p != null)
    : []

  const paints = Array.isArray(raw.paints)
    ? raw.paints.map(normalizePaint).filter((p): p is Paint => p != null)
    : []

  const legacyExtra = Array.isArray(raw.extraPaints)
    ? raw.extraPaints.map(normalizePaint).filter((p): p is Paint => p != null)
    : []

  const activePaletteId =
    typeof raw.activePaletteId === 'string' && palettes.some((p) => p.id === raw.activePaletteId)
      ? raw.activePaletteId
      : null

  return ensureCatalog(
    {
      v: 2,
      owned: raw.owned.filter((k): k is string => typeof k === 'string'),
      palettes,
      activePaletteId,
      paints,
    },
    legacyExtra,
  )
}

function rowToState(row: InventoryRow): SavedState {
  return normalizeState({
    v: 2,
    owned: Array.isArray(row.owned) ? row.owned : [],
    palettes: Array.isArray(row.palettes) ? row.palettes : [],
    activePaletteId: row.active_palette_id ?? null,
    paints: Array.isArray(row.paints) ? row.paints : [],
    extraPaints: Array.isArray(row.extra_paints) ? row.extra_paints : [],
  })
}

export function stateFingerprint(state: SavedState): string {
  return JSON.stringify({
    owned: [...state.owned].sort(),
    activePaletteId: state.activePaletteId,
    palettes: state.palettes
      .map((p) => ({ id: p.id, name: p.name, paintIds: [...p.paintIds].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    paints: state.paints.map((p) => ({
      id: p.id,
      original: p.original,
      hex: p.hex,
      kind: p.kind,
      names: p.names,
    })),
  })
}

export function loadCachedState(): SavedState {
  try {
    const raw = localStorage.getItem(CACHE_KEY) ?? localStorage.getItem(LEGACY_CACHE_KEY)
    if (!raw) return ensureCatalog(DEFAULT_STATE)
    return normalizeState(JSON.parse(raw) as ImportPayload)
  } catch {
    return ensureCatalog(DEFAULT_STATE)
  }
}

export function cacheState(state: SavedState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state))
}

export async function fetchRemoteState(): Promise<SavedState | null> {
  const { data, error } = await supabase
    .from('paint_inventory')
    .select('id, owned, palettes, active_palette_id, paints, extra_paints, updated_at')
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
      paints: state.paints,
      extra_paints: [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', INVENTORY_ID)
  if (error) throw error
}

export async function hydrateState(): Promise<SavedState> {
  const cached = loadCachedState()
  const remoteRaw = await fetchRemoteState()
  const remote = remoteRaw

  if (!remote) {
    const seed =
      cached.owned.length > 0 || cached.palettes.length > 0 || cached.paints.length > 0
        ? cached
        : ensureCatalog(DEFAULT_STATE)
    const { error } = await supabase.from('paint_inventory').upsert({
      id: INVENTORY_ID,
      owned: seed.owned,
      palettes: seed.palettes,
      active_palette_id: seed.activePaletteId,
      paints: seed.paints,
      extra_paints: [],
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
    remoteRaw.paints.length <= PAINTS.length &&
    (cached.owned.length > 0 || cached.paints.length > PAINTS.length)
  ) {
    const merged = ensureCatalog({
      ...cached,
      owned: cached.owned.length > 0 ? cached.owned : remote.owned,
      paints: cached.paints.length > 0 ? cached.paints : remote.paints,
    })
    await saveRemoteState(merged)
    cacheState(merged)
    return merged
  }

  if (stateFingerprint(remote) !== stateFingerprint(remoteRaw)) {
    await saveRemoteState(remote)
  }

  cacheState(remote)
  return remote
}

export function newPaletteId() {
  return `pal_${crypto.randomUUID().slice(0, 8)}`
}

export function newPaintId(label = 'color') {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'color'
  return `paint_${slug}_${crypto.randomUUID().slice(0, 6)}`
}

type SaveHandlers = {
  onError?: (message: string) => void
  onSuccess?: () => void
}

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
