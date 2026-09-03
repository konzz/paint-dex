import {
  BRANDS,
  PAINTS,
  type BrandId,
  type Paint,
  type PaintKind,
} from '../data/paints'


const EMPTY = /^(?:-|—|–|sin equivalente|n\/?a|none|null)?$/i

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function brandName(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || EMPTY.test(trimmed)) return null
  return trimmed
}

function paintMatchesName(paint: Paint, name: string) {
  const n = norm(name)
  if (!n) return false
  if (norm(paint.original) === n) return true
  return BRANDS.some((brand) => {
    const label = paint.names[brand.id]
    return label != null && norm(label) === n
  })
}

function findPaint(catalog: Paint[], names: string[]) {
  for (const name of names) {
    const hit = catalog.find((paint) => paintMatchesName(paint, name))
    if (hit) return hit
  }
  return null
}

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return base || 'color'
}

function parseBrandSlots(right: string): Record<BrandId, string | null> {
  const parts = right.split(',').map((part) => part.trim())
  return {
    ttc: brandName(parts[0] ?? ''),
    citadel: brandName(parts[1] ?? ''),
    vallejo: brandName(parts[2] ?? ''),
    ak: brandName(parts[3] ?? ''),
  }
}

export function serializePaletteText(paletteName: string, paints: Paint[]) {
  const lines = [paletteName.trim() || 'Paleta']
  for (const paint of paints) {
    const slots = BRANDS.map((brand) => paint.names[brand.id] ?? '-').join(', ')
    lines.push(`${paint.original}: ${slots}`)
  }
  return `${lines.join('\n')}\n`
}

export type ParsedPaletteText = {
  name: string
  paintIds: string[]
  extraPaints: Paint[]
  matched: number
  created: number
}

/** Parse:
 * Palette Name
 * Color: TTC, Citadel, Vallejo, AK
 */
export function parsePaletteText(
  text: string,
  existingExtra: Paint[] = [],
): ParsedPaletteText {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  if (lines.length < 2) {
    throw new Error('Formato no válido')
  }

  const name = lines[0]
  if (name.includes(':') && lines.length === 1) {
    throw new Error('Falta el nombre de la paleta en la primera línea')
  }

  const catalog = [...PAINTS, ...existingExtra]
  const paintIds: string[] = []
  const extraPaints: Paint[] = []
  const seen = new Set<string>()
  let matched = 0
  let created = 0

  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon <= 0) {
      throw new Error(`Línea sin "nombre: marcas" → ${line}`)
    }
    const primary = line.slice(0, colon).trim()
    const slots = parseBrandSlots(line.slice(colon + 1))
    const candidates = [
      primary,
      slots.ttc,
      slots.citadel,
      slots.vallejo,
      slots.ak,
    ].filter((v): v is string => Boolean(v))

    const existing = findPaint([...catalog, ...extraPaints], candidates)
    if (existing) {
      if (!seen.has(existing.id)) {
        seen.add(existing.id)
        paintIds.push(existing.id)
        matched += 1
      }
      continue
    }

    const id = `custom_${slugify(primary)}_${extraPaints.length + existingExtra.length}`
    const paint: Paint = {
      id,
      original: primary,
      hex: '#8A8580',
      kind: 'base' satisfies PaintKind,
      names: slots,
    }
    extraPaints.push(paint)
    seen.add(id)
    paintIds.push(id)
    created += 1
  }

  if (paintIds.length === 0) {
    throw new Error('No hay colores en la paleta')
  }

  return { name, paintIds, extraPaints, matched, created }
}

export function paintsForPalette(
  paintIds: string[],
  catalog: Paint[],
): Paint[] {
  const byId = new Map(catalog.map((paint) => [paint.id, paint]))
  return paintIds.map((id) => byId.get(id)).filter((p): p is Paint => Boolean(p))
}
