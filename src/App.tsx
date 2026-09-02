import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Download,
  Minus,
  Search,
  ShoppingBag,
  Upload,
  X,
} from 'lucide-react'
import {
  BRANDS,
  KIND_LABEL,
  PAINTS,
  isLightHex,
  paintKey,
  type BrandId,
  type Paint,
} from './data/paints'
import {
  cacheState,
  hydrateState,
  loadCachedState,
  parseImport,
  saveRemoteState,
  serializeExport,
  stateFingerprint,
  subscribeInventory,
  type SavedState,
} from './lib/storage'

type FilterId = 'all' | 'missing' | 'owned'

function ownsPaint(owned: Set<string>, paint: Paint) {
  if (owned.has(paintKey(paint.id, 'any'))) return true
  return BRANDS.some((brand) => owned.has(paintKey(paint.id, brand.id)))
}

function ownedBrands(owned: Set<string>, paint: Paint): BrandId[] {
  return BRANDS.filter((brand) => owned.has(paintKey(paint.id, brand.id))).map((b) => b.id)
}

function shoppingName(paint: Paint, preferred: BrandId) {
  return paint.names[preferred] ?? paint.names.citadel ?? paint.original
}

export default function App() {
  const [state, setState] = useState<SavedState>(() => loadCachedState())
  const [ready, setReady] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [flash, setFlash] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef(state)
  const dirtyRef = useRef(false)
  const lastSyncedFpRef = useRef(stateFingerprint(loadCachedState()))
  const saveTimerRef = useRef<number | null>(null)
  const owned = useMemo(() => new Set(state.owned), [state.owned])

  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const remote = await hydrateState()
        if (cancelled) return
        lastSyncedFpRef.current = stateFingerprint(remote)
        dirtyRef.current = false
        setState(remote)
        setSyncError(null)
      } catch {
        if (!cancelled) setSyncError('No se pudo cargar el inventario en la nube')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    return subscribeInventory((next) => {
      const fp = stateFingerprint(next)
      if (fp === lastSyncedFpRef.current) return
      if (fp === stateFingerprint(stateRef.current)) {
        lastSyncedFpRef.current = fp
        return
      }
      // Don't clobber in-progress local edits with a remote echo/race.
      if (dirtyRef.current) return
      lastSyncedFpRef.current = fp
      setState(next)
    })
  }, [ready])

  useEffect(() => {
    cacheState(state)
    if (!ready) return

    const fp = stateFingerprint(state)
    if (fp === lastSyncedFpRef.current) {
      dirtyRef.current = false
      return
    }

    dirtyRef.current = true
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      const toSave = stateRef.current
      const saveFp = stateFingerprint(toSave)
      if (saveFp === lastSyncedFpRef.current) {
        dirtyRef.current = false
        return
      }
      void saveRemoteState(toSave)
        .then(() => {
          lastSyncedFpRef.current = saveFp
          if (stateFingerprint(stateRef.current) === saveFp) {
            dirtyRef.current = false
          }
          setSyncError(null)
        })
        .catch(() => {
          setSyncError('No se pudo guardar en la nube')
        })
    }, 500)

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [state, ready])

  useEffect(() => {
    function flush() {
      if (!dirtyRef.current) return
      const toSave = stateRef.current
      const saveFp = stateFingerprint(toSave)
      if (saveFp === lastSyncedFpRef.current) return
      void saveRemoteState(toSave).then(() => {
        lastSyncedFpRef.current = saveFp
        dirtyRef.current = false
      })
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 2800)
    return () => window.clearTimeout(id)
  }, [flash])

  const ownedCount = PAINTS.filter((paint) => ownsPaint(owned, paint)).length
  const missingCount = PAINTS.length - ownedCount
  const percent = Math.round((ownedCount / PAINTS.length) * 100)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PAINTS.filter((paint) => {
      const isOwned = ownsPaint(owned, paint)
      if (filter === 'owned' && !isOwned) return false
      if (filter === 'missing' && isOwned) return false
      if (!q) return true
      const hay = [
        paint.original,
        KIND_LABEL[paint.kind],
        ...BRANDS.map((b) => paint.names[b.id] ?? ''),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [filter, owned, query])

  function persist(next: SavedState) {
    setState(next)
  }

  function toggleBrand(paint: Paint, brand: BrandId) {
    if (!paint.names[brand]) return
    const key = paintKey(paint.id, brand)
    const next = new Set(owned)
    if (next.has(key)) next.delete(key)
    else {
      next.add(key)
      next.delete(paintKey(paint.id, 'any'))
    }
    persist({ ...state, owned: [...next] })
  }

  function toggleRow(paint: Paint) {
    const next = new Set(owned)
    if (ownsPaint(next, paint)) {
      next.delete(paintKey(paint.id, 'any'))
      for (const brand of BRANDS) next.delete(paintKey(paint.id, brand.id))
    } else {
      next.add(paintKey(paint.id, 'any'))
    }
    persist({ ...state, owned: [...next] })
  }

  function exportJson() {
    const blob = new Blob([serializeExport(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pinturas-minis.json'
    a.click()
    URL.revokeObjectURL(url)
    setFlash('Copia de seguridad descargada')
  }

  function importJson(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        persist(parseImport(String(reader.result)))
        setFlash('Inventario restaurado')
      } catch {
        setFlash('Ese archivo no es un inventario válido')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="min-h-svh bg-desk text-parchment">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,168,75,0.12),_transparent_42%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.22em] text-brass uppercase">
              Miniaturas
            </p>
            <h1 className="font-display text-4xl leading-none text-parchment sm:text-5xl">
              Armario de pinturas
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Lista de compra y equivalencias. Marca el bote que tengas — Citadel, Vallejo,
              AK o Two Thin Coats — y se sincroniza en la nube (inventario compartido).
            </p>
          </div>
          <Stats owned={ownedCount} total={PAINTS.length} percent={percent} missing={missingCount} />
        </header>

        <Toolbar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          preferred={state.preferredBrand}
          onPreferred={(preferredBrand) => persist({ ...state, preferredBrand })}
          onExport={exportJson}
          onImportClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) importJson(file)
            event.target.value = ''
          }}
        />

        {syncError ? (
          <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {syncError}
          </p>
        ) : null}

        {flash ? (
          <p className="mb-4 rounded-lg border border-brass/40 bg-brass/10 px-3 py-2 text-sm text-brass">
            {flash}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState query={query} filter={filter} onClear={() => { setQuery(''); setFilter('all') }} />
        ) : (
          <>
            <div className="hidden lg:block">
              <PaintTable
                paints={visible}
                owned={owned}
                preferred={state.preferredBrand}
                onToggleBrand={toggleBrand}
                onToggleRow={toggleRow}
              />
            </div>
            <div className="grid gap-3 lg:hidden">
              {visible.map((paint) => (
                <PaintCard
                  key={paint.id}
                  paint={paint}
                  owned={owned}
                  preferred={state.preferredBrand}
                  onToggleBrand={toggleBrand}
                  onToggleRow={toggleRow}
                />
              ))}
            </div>
          </>
        )}

        {filter !== 'owned' ? (
          <ShoppingNote
            missing={PAINTS.filter((paint) => !ownsPaint(owned, paint)).length}
            preferred={state.preferredBrand}
            sample={PAINTS.filter((paint) => !ownsPaint(owned, paint))
              .slice(0, 3)
              .map((paint) => shoppingName(paint, state.preferredBrand))}
          />
        ) : null}
      </div>
    </div>
  )
}

function Stats({
  owned,
  total,
  percent,
  missing,
}: {
  owned: number
  total: number
  percent: number
  missing: number
}) {
  return (
    <div className="grid w-full grid-cols-3 gap-2 rounded-2xl border border-line bg-panel p-3 sm:w-auto sm:min-w-80">
      <Stat label="Tengo" value={`${owned}`} />
      <Stat label="Me faltan" value={`${missing}`} />
      <Stat label="Completado" value={`${percent}%`} />
      <div className="col-span-3 mt-1 h-2 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-owned transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="col-span-3 text-center text-[11px] text-muted">
        {owned} de {total} colores cubiertos
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-3 py-2 text-center">
      <div className="font-display text-xl text-parchment">{value}</div>
      <div className="text-[11px] tracking-wide text-muted uppercase">{label}</div>
    </div>
  )
}

function Toolbar({
  query,
  onQuery,
  filter,
  onFilter,
  preferred,
  onPreferred,
  onExport,
  onImportClick,
}: {
  query: string
  onQuery: (value: string) => void
  filter: FilterId
  onFilter: (value: FilterId) => void
  preferred: BrandId
  onPreferred: (value: BrandId) => void
  onExport: () => void
  onImportClick: () => void
}) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar color o equivalente…"
            className="w-full rounded-xl border border-line bg-panel py-2.5 pr-3 pl-10 text-sm text-parchment outline-none placeholder:text-muted focus:border-brass"
          />
        </label>
        <div className="flex rounded-xl border border-line bg-panel p-1 text-sm">
          {(
            [
              ['all', 'Todas'],
              ['missing', 'Me faltan'],
              ['owned', 'Las tengo'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onFilter(id)}
              className={`flex-1 rounded-lg px-3 py-2 font-medium transition md:flex-none ${
                filter === id ? 'bg-brass text-desk' : 'text-muted hover:text-parchment'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-muted">
          <ShoppingBag className="size-4 text-brass" />
          Si voy a comprar, muéstrame
          <select
            value={preferred}
            onChange={(event) => onPreferred(event.target.value as BrandId)}
            className="rounded-lg border border-line bg-panel px-2 py-1.5 text-parchment outline-none focus:border-brass"
          >
            {BRANDS.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted hover:text-parchment"
          >
            <Download className="size-4" />
            Exportar
          </button>
          <button
            type="button"
            onClick={onImportClick}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted hover:text-parchment"
          >
            <Upload className="size-4" />
            Importar
          </button>
        </div>
      </div>
    </div>
  )
}

function PaintTable({
  paints,
  owned,
  preferred,
  onToggleBrand,
  onToggleRow,
}: {
  paints: Paint[]
  owned: Set<string>
  preferred: BrandId
  onToggleBrand: (paint: Paint, brand: BrandId) => void
  onToggleRow: (paint: Paint) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-panel-2 text-[11px] tracking-wider text-muted uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Color</th>
            {BRANDS.map((brand) => (
              <th key={brand.id} className="px-3 py-3 font-medium">
                {brand.label}
                {preferred === brand.id ? (
                  <span className="ml-2 rounded-full bg-brass/20 px-1.5 py-0.5 text-[10px] text-brass">
                    compra
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paints.map((paint) => {
            const got = ownsPaint(owned, paint)
            return (
              <tr
                key={paint.id}
                className={`border-t border-line ${got ? 'bg-owned/10' : 'hover:bg-white/5'}`}
              >
                <td className="px-4 py-3">
                  <RowIdentity paint={paint} owned={got} onToggle={() => onToggleRow(paint)} />
                </td>
                {BRANDS.map((brand) => (
                  <td key={brand.id} className="px-3 py-2 align-middle">
                    <BrandCell
                      paint={paint}
                      brand={brand.id}
                      checked={owned.has(paintKey(paint.id, brand.id))}
                      preferred={preferred === brand.id}
                      onToggle={() => onToggleBrand(paint, brand.id)}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PaintCard({
  paint,
  owned,
  preferred,
  onToggleBrand,
  onToggleRow,
}: {
  paint: Paint
  owned: Set<string>
  preferred: BrandId
  onToggleBrand: (paint: Paint, brand: BrandId) => void
  onToggleRow: (paint: Paint) => void
}) {
  const got = ownsPaint(owned, paint)
  const brands = ownedBrands(owned, paint)
  return (
    <article className={`rounded-2xl border p-4 ${got ? 'border-owned/50 bg-owned/10' : 'border-line bg-panel'}`}>
      <RowIdentity paint={paint} owned={got} onToggle={() => onToggleRow(paint)} />
      {got && brands.length === 0 ? (
        <p className="mt-2 text-xs text-owned">Marcado como lo tienes, sin marca concreta.</p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {BRANDS.map((brand) => (
          <BrandCell
            key={brand.id}
            paint={paint}
            brand={brand.id}
            checked={owned.has(paintKey(paint.id, brand.id))}
            preferred={preferred === brand.id}
            onToggle={() => onToggleBrand(paint, brand.id)}
            compact
          />
        ))}
      </div>
    </article>
  )
}

function RowIdentity({
  paint,
  owned,
  onToggle,
}: {
  paint: Paint
  owned: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={owned}
        title={owned ? 'Quitar de lo que tengo' : 'Marcar que ya tengo este color'}
        className={`relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 shadow-inner ${
          owned ? 'border-owned' : 'border-line'
        }`}
        style={{ backgroundColor: paint.hex }}
      >
        <span
          className={`size-full ${paint.metallic ? 'swatch-metallic' : ''} ${
            paint.kind === 'shade' || paint.kind === 'contrast' ? 'swatch-wash' : ''
          }`}
        />
        {owned ? (
          <Check
            className={`absolute size-5 drop-shadow ${isLightHex(paint.hex) ? 'text-desk' : 'text-white'}`}
          />
        ) : null}
      </button>
      <div className="min-w-0">
        <div className="truncate font-medium text-parchment">{paint.original}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span>{KIND_LABEL[paint.kind]}</span>
          {paint.metallic ? <span>· Metálico</span> : null}
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-full px-2 py-0.5 ${
              owned ? 'bg-owned/20 text-owned' : 'bg-panel-2 text-muted'
            }`}
          >
            {owned ? 'Lo tengo' : 'Me falta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BrandCell({
  paint,
  brand,
  checked,
  preferred,
  onToggle,
  compact = false,
}: {
  paint: Paint
  brand: BrandId
  checked: boolean
  preferred: boolean
  onToggle: () => void
  compact?: boolean
}) {
  const name = paint.names[brand]
  if (!name) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border border-dashed border-line/80 px-3 py-2 text-muted/60 ${
          compact ? 'min-h-14' : 'min-h-12'
        }`}
      >
        <Minus className="size-3.5" />
        <div>
          {compact ? <div className="text-[10px] tracking-wide uppercase">{labelFor(brand)}</div> : null}
          <div className="text-xs">Sin equivalente</div>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex w-full min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
        checked
          ? 'border-owned bg-owned/15 text-parchment'
          : preferred
            ? 'border-brass/50 bg-brass/8 hover:border-brass'
            : 'border-line bg-panel-2/60 hover:border-muted'
      } ${compact ? 'min-h-14' : ''}`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
          checked ? 'border-owned bg-owned text-desk' : 'border-line bg-desk'
        }`}
      >
        {checked ? <Check className="size-3.5" /> : null}
      </span>
      <span className="min-w-0">
        {compact ? (
          <span className="block text-[10px] tracking-wide text-muted uppercase">{labelFor(brand)}</span>
        ) : null}
        <span className="block truncate text-sm">{name}</span>
      </span>
    </button>
  )
}

function labelFor(brand: BrandId) {
  return BRANDS.find((item) => item.id === brand)?.short ?? brand
}

function EmptyState({
  query,
  filter,
  onClear,
}: {
  query: string
  filter: FilterId
  onClear: () => void
}) {
  const message =
    filter === 'owned'
      ? 'Todavía no has marcado ninguna pintura.'
      : filter === 'missing'
        ? 'Lista completa: no te falta ningún color de esta tabla.'
        : `No hay resultados para “${query}”.`
  return (
    <div className="rounded-2xl border border-dashed border-line bg-panel px-6 py-16 text-center">
      <p className="text-parchment">{message}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-parchment"
      >
        <X className="size-4" />
        Ver todas
      </button>
    </div>
  )
}

function ShoppingNote({
  missing,
  preferred,
  sample,
}: {
  missing: number
  preferred: BrandId
  sample: string[]
}) {
  if (missing === 0) {
    return (
      <p className="mt-6 text-center text-sm text-owned">
        Tienes cubiertos los 23 colores de la lista.
      </p>
    )
  }
  const brand = BRANDS.find((item) => item.id === preferred)?.label
  return (
    <p className="mt-6 text-center text-sm text-muted">
      Te faltan {missing} {missing === 1 ? 'color' : 'colores'}. En {brand} empieza por{' '}
      {sample.join(', ')}
      {missing > sample.length ? '…' : '.'}
    </p>
  )
}
