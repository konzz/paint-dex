import type { BrandId } from '../data/paints'

const KEY = 'mini-paint-tracker:v1'

export type SavedState = {
  v: 1
  owned: string[]
  preferredBrand: BrandId
}

const DEFAULT_STATE: SavedState = {
  v: 1,
  owned: [],
  preferredBrand: 'citadel',
}

export function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<SavedState>
    if (parsed.v !== 1 || !Array.isArray(parsed.owned)) {
      return { ...DEFAULT_STATE }
    }
    const brand = parsed.preferredBrand
    const preferredBrand: BrandId =
      brand === 'ttc' || brand === 'citadel' || brand === 'vallejo' || brand === 'ak'
        ? brand
        : 'citadel'
    return { v: 1, owned: parsed.owned.filter((k) => typeof k === 'string'), preferredBrand }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveState(state: SavedState) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function serializeExport(state: SavedState) {
  return JSON.stringify(state, null, 2)
}

export function parseImport(text: string): SavedState {
  const parsed = JSON.parse(text) as Partial<SavedState>
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.owned)) {
    throw new Error('Formato no válido')
  }
  const brand = parsed.preferredBrand
  const preferredBrand: BrandId =
    brand === 'ttc' || brand === 'citadel' || brand === 'vallejo' || brand === 'ak'
      ? brand
      : 'citadel'
  return { v: 1, owned: parsed.owned.filter((k) => typeof k === 'string'), preferredBrand }
}
