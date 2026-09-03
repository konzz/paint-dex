import {
  BRANDS,
  PAINTS,
  paintKey,
  type BrandId,
  type Paint,
  type PaintKind,
} from '../data/paints'

const EMPTY = /^(?:-|—|–|−|sin equivalente|n\/?a|none|null)?$/i

function norm(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
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

function splitCells(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  let inner = trimmed
  if (inner.startsWith('|')) inner = inner.slice(1)
  if (inner.endsWith('|')) inner = inner.slice(0, -1)
  return inner.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^[\s|:.-—–−]*$/.test(cell))
}

function parseCell(raw: string): { name: string | null; preferred: boolean } {
  const preferred = /\*\*[^*]+\*\*/.test(raw)
  const cleaned = raw.replace(/\*\*/g, '').replace(/_/g, '').trim()
  return { name: brandName(cleaned), preferred }
}

type HeaderMap = {
  uso: number
  ttc: number
  citadel: number
  vallejo: number
  ak: number
}

function mapHeader(cells: string[]): HeaderMap | null {
  const idx = {
    uso: -1,
    ttc: -1,
    citadel: -1,
    vallejo: -1,
    ak: -1,
  }
  cells.forEach((cell, i) => {
    const n = norm(cell)
    if (n === 'uso' || n === 'use' || n === 'rol' || n === 'color' || n === 'slot') idx.uso = i
    else if (n === 'ttc' || n.includes('two thin') || n === 'two thin coats') idx.ttc = i
    else if (n === 'citadel' || n === 'gw' || n === 'games workshop') idx.citadel = i
    else if (n === 'vallejo') idx.vallejo = i
    else if (n === 'ak' || n.includes('ak 3') || n === 'ak interactive') idx.ak = i
  })
  if (idx.uso < 0 || idx.ttc < 0 || idx.citadel < 0 || idx.vallejo < 0 || idx.ak < 0) {
    return null
  }
  return idx
}

function cellMarkdown(name: string | null, preferred: boolean) {
  if (!name) return '—'
  return preferred ? `**${name}**` : name
}

export function serializePaletteText(
  paletteName: string,
  paints: Paint[],
  owned: Set<string> = new Set(),
) {
  const lines = [
    paletteName.trim() || 'Paleta',
    '| Uso | TTC | Citadel | Vallejo | AK |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const paint of paints) {
    const uso = paint.original
    const ttc = cellMarkdown(paint.names.ttc, owned.has(paintKey(paint.id, 'ttc')))
    const citadel = cellMarkdown(paint.names.citadel, owned.has(paintKey(paint.id, 'citadel')))
    const vallejo = cellMarkdown(paint.names.vallejo, owned.has(paintKey(paint.id, 'vallejo')))
    const ak = cellMarkdown(paint.names.ak, owned.has(paintKey(paint.id, 'ak')))
    // If only "any" owned and no brand, bold the first available name column (citadel preference).
    const anyOwned = owned.has(paintKey(paint.id, 'any'))
    const row = [uso, ttc, citadel, vallejo, ak]
    if (
      anyOwned &&
      !owned.has(paintKey(paint.id, 'ttc')) &&
      !owned.has(paintKey(paint.id, 'citadel')) &&
      !owned.has(paintKey(paint.id, 'vallejo')) &&
      !owned.has(paintKey(paint.id, 'ak'))
    ) {
      for (let i = 1; i < row.length; i++) {
        if (row[i] !== '—') {
          row[i] = `**${row[i]}**`
          break
        }
      }
    }
    lines.push(`| ${row.join(' | ')} |`)
  }
  return `${lines.join('\n')}\n`
}

export type ParsedPaletteText = {
  name: string
  paintIds: string[]
  extraPaints: Paint[]
  ownedKeys: string[]
  matched: number
  created: number
}

function parseLegacyColonFormat(
  lines: string[],
  existingExtra: Paint[],
): ParsedPaletteText {
  const name = lines[0]
  const catalog = [...PAINTS, ...existingExtra]
  const paintIds: string[] = []
  const extraPaints: Paint[] = []
  const seen = new Set<string>()
  let matched = 0
  let created = 0

  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const primary = line.slice(0, colon).trim()
    const parts = line.slice(colon + 1).split(',').map((p) => p.trim())
    const slots: Record<BrandId, string | null> = {
      ttc: brandName(parts[0] ?? ''),
      citadel: brandName(parts[1] ?? ''),
      vallejo: brandName(parts[2] ?? ''),
      ak: brandName(parts[3] ?? ''),
    }
    const candidates = [primary, slots.ttc, slots.citadel, slots.vallejo, slots.ak].filter(
      (v): v is string => Boolean(v),
    )
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
    extraPaints.push({
      id,
      original: primary,
      hex: '#8A8580',
      kind: 'base' satisfies PaintKind,
      names: slots,
    })
    seen.add(id)
    paintIds.push(id)
    created += 1
  }

  if (paintIds.length === 0) throw new Error('No hay colores en la paleta')
  return { name, paintIds, extraPaints, ownedKeys: [], matched, created }
}

/**
 * Preferred format — markdown table:
 *
 * Pallid Hands
 * | Uso | TTC | Citadel | Vallejo | AK |
 * | --- | --- | --- | --- | --- |
 * | Bronce | **Spartan Bronze** | Balthasar Gold | Bright Bronze | Bronze |
 *
 * `**negrita**` = bote que tienes en esa marca.
 */
export function parsePaletteText(
  text: string,
  existingExtra: Paint[] = [],
): ParsedPaletteText {
  const rawLines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())

  const nonEmpty = rawLines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'))
  if (nonEmpty.length < 2) throw new Error('Formato no válido')

  const tableLineIdx = nonEmpty.findIndex((line) => line.includes('|'))
  if (tableLineIdx < 0) {
    return parseLegacyColonFormat(nonEmpty, existingExtra)
  }

  const beforeTable = nonEmpty.slice(0, tableLineIdx)
  const tableLines = nonEmpty.slice(tableLineIdx)
  const name = beforeTable[0]?.trim() || 'Paleta'

  const headerCells = splitCells(tableLines[0] ?? '')
  const header = mapHeader(headerCells)
  if (!header) {
    throw new Error('La tabla necesita columnas Uso, TTC, Citadel, Vallejo y AK')
  }

  const catalog = [...PAINTS, ...existingExtra]
  const paintIds: string[] = []
  const extraPaints: Paint[] = []
  const ownedKeys: string[] = []
  const seen = new Set<string>()
  let matched = 0
  let created = 0

  for (const line of tableLines.slice(1)) {
    const cells = splitCells(line)
    if (cells.length === 0 || isSeparatorRow(cells)) continue

    const uso = brandName(cells[header.uso]?.replace(/\*\*/g, '') ?? '') ?? 'Color'
    const ttcCell = parseCell(cells[header.ttc] ?? '')
    const citadelCell = parseCell(cells[header.citadel] ?? '')
    const vallejoCell = parseCell(cells[header.vallejo] ?? '')
    const akCell = parseCell(cells[header.ak] ?? '')

    const slots: Record<BrandId, string | null> = {
      ttc: ttcCell.name,
      citadel: citadelCell.name,
      vallejo: vallejoCell.name,
      ak: akCell.name,
    }

    if (!slots.ttc && !slots.citadel && !slots.vallejo && !slots.ak) continue

    const candidates = [uso, slots.ttc, slots.citadel, slots.vallejo, slots.ak].filter(
      (v): v is string => Boolean(v),
    )
    let paint = findPaint([...catalog, ...extraPaints], candidates)
    if (!paint) {
      const id = `custom_${slugify(uso)}_${extraPaints.length + existingExtra.length}`
      paint = {
        id,
        original: uso,
        hex: '#8A8580',
        kind: 'base' satisfies PaintKind,
        names: slots,
      }
      extraPaints.push(paint)
      created += 1
    } else {
      matched += 1
    }

    if (!seen.has(paint.id)) {
      seen.add(paint.id)
      paintIds.push(paint.id)
    }

    const prefs: Array<[BrandId, boolean]> = [
      ['ttc', ttcCell.preferred],
      ['citadel', citadelCell.preferred],
      ['vallejo', vallejoCell.preferred],
      ['ak', akCell.preferred],
    ]
    for (const [brand, preferred] of prefs) {
      if (preferred && slots[brand]) {
        ownedKeys.push(paintKey(paint.id, brand))
      }
    }
  }

  if (paintIds.length === 0) throw new Error('No hay colores en la paleta')
  return { name, paintIds, extraPaints, ownedKeys, matched, created }
}
