export const BRANDS = [
  { id: 'ttc', label: 'Two Thin Coats', short: 'TTC' },
  { id: 'citadel', label: 'Citadel', short: 'Citadel' },
  { id: 'vallejo', label: 'Vallejo', short: 'Vallejo' },
  { id: 'ak', label: 'AK 3rd Gen', short: 'AK' },
] as const

export type BrandId = (typeof BRANDS)[number]['id']

export type PaintKind = 'base' | 'layer' | 'shade' | 'contrast' | 'technical'

export type Paint = {
  id: string
  original: string
  hex: string
  kind: PaintKind
  metallic?: boolean
  names: Record<BrandId, string | null>
}

export const KIND_LABEL: Record<PaintKind, string> = {
  base: 'Base',
  layer: 'Layer',
  shade: 'Wash',
  contrast: 'Contrast',
  technical: 'Técnico',
}

export const PAINTS: Paint[] = [
  {
    id: 'wraithbone',
    original: 'Wraithbone',
    hex: '#E6D4B3',
    kind: 'base',
    names: {
      ttc: 'Ivory Tusk',
      citadel: 'Wraithbone',
      vallejo: 'Pale Sand',
      ak: 'Pale Sand',
    },
  },
  {
    id: 'screaming-skull',
    original: 'Screaming Skull',
    hex: '#D4C7A0',
    kind: 'layer',
    names: {
      ttc: 'Skeleton Legion',
      citadel: 'Screaming Skull',
      vallejo: 'Bone White',
      ak: 'Buff',
    },
  },
  {
    id: 'castellan-green',
    original: 'Castellan Green',
    hex: '#2C5530',
    kind: 'base',
    names: {
      ttc: 'Fury Green',
      citadel: 'Castellan Green',
      vallejo: 'US Olive Drab',
      ak: 'Olive Drab',
    },
  },
  {
    id: 'leadbelcher',
    original: 'Leadbelcher',
    hex: '#8B9094',
    kind: 'base',
    metallic: true,
    names: {
      ttc: 'Sir Coates Silver',
      citadel: 'Leadbelcher',
      vallejo: 'Gunmetal',
      ak: 'Gun Metal',
    },
  },
  {
    id: 'balthasar-gold',
    original: 'Balthasar Gold',
    hex: '#9A6B2F',
    kind: 'base',
    metallic: true,
    names: {
      ttc: 'Overlord Brass',
      citadel: 'Balthasar Gold',
      vallejo: 'Old Gold',
      ak: 'Bronze',
    },
  },
  {
    id: 'corvus-black',
    original: 'Corvus Black',
    hex: '#161412',
    kind: 'base',
    names: {
      ttc: 'Doom Death Black',
      citadel: 'Corvus Black',
      vallejo: 'Black Grey',
      ak: 'Black',
    },
  },
  {
    id: 'dryad-bark',
    original: 'Dryad Bark',
    hex: '#3A332C',
    kind: 'base',
    names: {
      ttc: 'Scorched Earth',
      citadel: 'Dryad Bark',
      vallejo: 'Black Brown',
      ak: 'Dark Brown',
    },
  },
  {
    id: 'kislev-flesh',
    original: 'Kislev Flesh',
    hex: '#D4A574',
    kind: 'layer',
    names: {
      ttc: 'Elven Skin',
      citadel: 'Kislev Flesh',
      vallejo: 'Sunny Skin Tone',
      ak: 'Light Flesh',
    },
  },
  {
    id: 'agrax-earthshade',
    original: 'Agrax Earthshade',
    hex: '#4A3426',
    kind: 'shade',
    names: {
      ttc: 'Battle Mud Wash',
      citadel: 'Agrax Earthshade',
      vallejo: 'Umber Wash',
      ak: 'Dark Brown Wash',
    },
  },
  {
    id: 'guilliman-flesh',
    original: 'Guilliman Flesh',
    hex: '#C47A58',
    kind: 'contrast',
    names: {
      ttc: null,
      citadel: 'Guilliman Flesh',
      vallejo: null,
      ak: null,
    },
  },
  {
    id: 'magos-purple',
    original: 'Magos Purple',
    hex: '#6E3D5C',
    kind: 'contrast',
    names: {
      ttc: null,
      citadel: 'Magos Purple',
      vallejo: null,
      ak: null,
    },
  },
  {
    id: 'carroburg-crimson',
    original: 'Carroburg Crimson',
    hex: '#6B1C2A',
    kind: 'shade',
    names: {
      ttc: null,
      citadel: 'Carroburg Crimson',
      vallejo: 'Red Wash',
      ak: 'Red Wash',
    },
  },
  {
    id: 'loren-forest',
    original: 'Loren Forest',
    hex: '#4F7340',
    kind: 'layer',
    names: {
      ttc: 'Gung-Ho Green',
      citadel: 'Loren Forest',
      vallejo: 'Intermediate Green',
      ak: 'Medium Green',
    },
  },
  {
    id: 'flayed-one-flesh',
    original: 'Flayed One Flesh',
    hex: '#E8CDB0',
    kind: 'layer',
    names: {
      ttc: 'Pale Skin',
      citadel: 'Flayed One Flesh',
      vallejo: 'Pale Flesh',
      ak: 'Light Flesh',
    },
  },
  {
    id: 'sycorax-bronze',
    original: 'Sycorax Bronze',
    hex: '#B8884A',
    kind: 'layer',
    metallic: true,
    names: {
      ttc: null,
      citadel: 'Sycorax Bronze',
      vallejo: 'Bright Bronze',
      ak: 'Bronze',
    },
  },
  {
    id: 'stormhost-silver',
    original: 'Stormhost Silver',
    hex: '#D0D3D6',
    kind: 'layer',
    metallic: true,
    names: {
      ttc: 'Mythril Blade',
      citadel: 'Stormhost Silver',
      vallejo: 'Silver',
      ak: 'Silver',
    },
  },
  {
    id: 'eshin-grey',
    original: 'Eshin Grey',
    hex: '#4A4C4E',
    kind: 'layer',
    names: {
      ttc: 'Ashen Grey',
      citadel: 'Eshin Grey',
      vallejo: 'Dark Grey',
      ak: 'Dark Grey',
    },
  },
  {
    id: 'gorthor-brown',
    original: 'Gorthor Brown',
    hex: '#6B4A32',
    kind: 'layer',
    names: {
      ttc: 'Boot Strap',
      citadel: 'Gorthor Brown',
      vallejo: 'Leather Brown',
      ak: 'Leather Brown',
    },
  },
  {
    id: 'white-scar',
    original: 'White Scar',
    hex: '#F4F5F0',
    kind: 'layer',
    names: {
      ttc: 'White Star',
      citadel: 'White Scar',
      vallejo: 'Dead White',
      ak: 'White',
    },
  },
  {
    id: 'seraphim-sepia',
    original: 'Seraphim Sepia',
    hex: '#8A5E2A',
    kind: 'shade',
    names: {
      ttc: 'Archaic Sepia Wash',
      citadel: 'Seraphim Sepia',
      vallejo: 'Sepia Wash',
      ak: 'Sepia Wash',
    },
  },
  {
    id: 'contrast-medium',
    original: 'Contrast Medium',
    hex: '#E8E2D4',
    kind: 'technical',
    names: {
      ttc: null,
      citadel: 'Contrast Medium',
      vallejo: null,
      ak: null,
    },
  },
  {
    id: 'averland-sunset',
    original: 'Averland Sunset',
    hex: '#F5B31A',
    kind: 'base',
    names: {
      ttc: 'Dark Sun Yellow',
      citadel: 'Averland Sunset',
      vallejo: 'Heavy Ochre',
      ak: 'Ochre',
    },
  },
  {
    id: 'skrag-brown',
    original: 'Skrag Brown',
    hex: '#8B542F',
    kind: 'layer',
    names: {
      ttc: 'Dry Rust Brown',
      citadel: 'Skrag Brown',
      vallejo: 'Parasite Brown',
      ak: 'Rust Brown',
    },
  },
]

export function paintKey(paintId: string, brand: BrandId | 'any') {
  return `${paintId}::${brand}`
}

export function isLightHex(hex: string) {
  const c = hex.replace('#', '')
  const r = Number.parseInt(c.slice(0, 2), 16)
  const g = Number.parseInt(c.slice(2, 4), 16)
  const b = Number.parseInt(c.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155
}
