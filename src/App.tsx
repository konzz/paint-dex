import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
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
  createInventorySaver,
  fetchRemoteState,
  hydrateState,
  loadCachedState,
  newPaletteId,
  parseImport,
  serializeExport,
  stateFingerprint,
  type SavedState,
} from './lib/storage'

type FilterId = 'all' | 'missing' | 'owned'
type TransferMode = 'copy' | 'paste' | null

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
  const [transfer, setTransfer] = useState<TransferMode>(null)
  const [pasteText, setPasteText] = useState('')
  const [addMode, setAddMode] = useState(false)
  const [paletteDraft, setPaletteDraft] = useState('')
  const stateRef = useRef(state)
  const saverRef = useRef<ReturnType<typeof createInventorySaver> | null>(null)
  const owned = useMemo(() => new Set(state.owned), [state.owned])

  stateRef.current = state

  const activePalette = state.palettes.find((p) => p.id === state.activePaletteId) ?? null
  const palettePaintIds = useMemo(
    () => (activePalette ? new Set(activePalette.paintIds) : null),
    [activePalette],
  )

  useEffect(() => {
    const saver = createInventorySaver({
      onError: (message) => setSyncError(message),
      onSuccess: () => setSyncError(null),
    })
    saverRef.current = saver

    let cancelled = false
    ;(async () => {
      try {
        const remote = await hydrateState()
        if (cancelled) return
        saver.noteSynced(remote)
        setState(remote)
        setSyncError(null)
      } catch {
        if (!cancelled) setSyncError('No se pudo cargar el inventario en la nube')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    function onHide() {
      saver.flushNow(stateRef.current)
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') onHide()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      saver.flushNow(stateRef.current)
      saver.dispose()
      saverRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const id = window.setInterval(() => {
      const saver = saverRef.current
      if (!saver || !saver.isSynced(stateRef.current)) return
      void fetchRemoteState()
        .then((remote) => {
          if (!remote || !saverRef.current) return
          if (!saverRef.current.isSynced(stateRef.current)) return
          if (stateFingerprint(remote) === stateFingerprint(stateRef.current)) {
            saverRef.current.noteSynced(remote)
            return
          }
          saverRef.current.noteSynced(remote)
          cacheState(remote)
          setState(remote)
        })
        .catch(() => {
          /* ignore background poll errors */
        })
    }, 15000)
    return () => window.clearInterval(id)
  }, [ready])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 2800)
    return () => window.clearTimeout(id)
  }, [flash])

  useEffect(() => {
    if (!activePalette) setAddMode(false)
  }, [activePalette])

  const scopedPaints = useMemo(() => {
    if (!palettePaintIds) return PAINTS
    if (addMode) return PAINTS.filter((paint) => !palettePaintIds.has(paint.id))
    return PAINTS.filter((paint) => palettePaintIds.has(paint.id))
  }, [addMode, palettePaintIds])

  const ownedCount = PAINTS.filter((paint) => ownsPaint(owned, paint)).length
  const missingCount = PAINTS.length - ownedCount
  const percent = Math.round((ownedCount / PAINTS.length) * 100)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scopedPaints.filter((paint) => {
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
  }, [filter, owned, query, scopedPaints])

  function persist(next: SavedState) {
    setState(next)
    cacheState(next)
    saverRef.current?.schedule(next)
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

  function setActivePalette(id: string | null) {
    setAddMode(false)
    persist({ ...state, activePaletteId: id })
  }

  function createPalette() {
    const name = paletteDraft.trim()
    if (!name) return
    const id = newPaletteId()
    persist({
      ...state,
      palettes: [...state.palettes, { id, name, paintIds: [] }],
      activePaletteId: id,
    })
    setPaletteDraft('')
    setAddMode(true)
    setFlash(`Paleta “${name}” creada — añade colores`)
  }

  function deleteActivePalette() {
    if (!activePalette) return
    persist({
      ...state,
      palettes: state.palettes.filter((p) => p.id !== activePalette.id),
      activePaletteId: null,
    })
    setAddMode(false)
    setFlash(`Paleta “${activePalette.name}” eliminada`)
  }

  function addToPalette(paintId: string) {
    if (!activePalette) return
    if (activePalette.paintIds.includes(paintId)) return
    persist({
      ...state,
      palettes: state.palettes.map((p) =>
        p.id === activePalette.id ? { ...p, paintIds: [...p.paintIds, paintId] } : p,
      ),
    })
  }

  function removeFromPalette(paintId: string) {
    if (!activePalette) return
    persist({
      ...state,
      palettes: state.palettes.map((p) =>
        p.id === activePalette.id
          ? { ...p, paintIds: p.paintIds.filter((id) => id !== paintId) }
          : p,
      ),
    })
  }

  async function copyInventory() {
    const text = serializeExport(state)
    try {
      await navigator.clipboard.writeText(text)
      setFlash('Inventario copiado al portapapeles')
      setTransfer(null)
    } catch {
      setTransfer('copy')
    }
  }

  function openPaste() {
    setPasteText('')
    setTransfer('paste')
  }

  function applyPaste() {
    try {
      const next = parseImport(pasteText)
      persist({ ...next, activePaletteId: next.activePaletteId })
      setTransfer(null)
      setPasteText('')
      setFlash('Inventario pegado (los colores quedan compartidos entre paletas)')
    } catch {
      setFlash('Ese texto no es un inventario válido')
    }
  }

  const shoppingPool = palettePaintIds
    ? PAINTS.filter((paint) => palettePaintIds.has(paint.id))
    : PAINTS

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
              Paletas por ejército o proyecto. Lo que marques como “lo tengo” se guarda una sola
              vez y vale para todas las paletas.
            </p>
          </div>
          <Stats owned={ownedCount} total={PAINTS.length} percent={percent} missing={missingCount} />
        </header>

        <PaletteBar
          palettes={state.palettes}
          activeId={state.activePaletteId}
          onSelect={setActivePalette}
          draft={paletteDraft}
          onDraft={setPaletteDraft}
          onCreate={createPalette}
          onDelete={deleteActivePalette}
          addMode={addMode}
          onToggleAddMode={() => setAddMode((v) => !v)}
        />

        <Toolbar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          preferred={state.preferredBrand}
          onPreferred={(preferredBrand) => persist({ ...state, preferredBrand })}
          onCopy={() => void copyInventory()}
          onPaste={openPaste}
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

        {activePalette && addMode ? (
          <p className="mb-3 text-sm text-muted">
            Añadiendo a <span className="text-brass">{activePalette.name}</span> — pulsa + en un
            color. El inventario (lo tengo / me falta) no cambia.
          </p>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState
            query={query}
            filter={filter}
            onClear={() => {
              setQuery('')
              setFilter('all')
            }}
            paletteEmpty={Boolean(activePalette && !addMode && activePalette.paintIds.length === 0)}
            onAddColors={() => setAddMode(true)}
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <PaintTable
                paints={visible}
                owned={owned}
                preferred={state.preferredBrand}
                onToggleBrand={toggleBrand}
                onToggleRow={toggleRow}
                paletteAction={
                  activePalette
                    ? addMode
                      ? { kind: 'add', onClick: addToPalette }
                      : { kind: 'remove', onClick: removeFromPalette }
                    : null
                }
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
                  paletteAction={
                    activePalette
                      ? addMode
                        ? { kind: 'add', onClick: () => addToPalette(paint.id) }
                        : { kind: 'remove', onClick: () => removeFromPalette(paint.id) }
                      : null
                  }
                />
              ))}
            </div>
          </>
        )}

        {filter !== 'owned' ? (
          <ShoppingNote
            missing={shoppingPool.filter((paint) => !ownsPaint(owned, paint)).length}
            preferred={state.preferredBrand}
            sample={shoppingPool
              .filter((paint) => !ownsPaint(owned, paint))
              .slice(0, 3)
              .map((paint) => shoppingName(paint, state.preferredBrand))}
          />
        ) : null}
      </div>

      {transfer ? (
        <TransferModal
          mode={transfer}
          text={transfer === 'copy' ? serializeExport(state) : pasteText}
          onText={setPasteText}
          onClose={() => setTransfer(null)}
          onApplyPaste={applyPaste}
        />
      ) : null}
    </div>
  )
}

type PaletteAction =
  | { kind: 'add'; onClick: (paintId: string) => void }
  | { kind: 'remove'; onClick: (paintId: string) => void }
  | null

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

function PaletteBar({
  palettes,
  activeId,
  onSelect,
  draft,
  onDraft,
  onCreate,
  onDelete,
  addMode,
  onToggleAddMode,
}: {
  palettes: SavedState['palettes']
  activeId: string | null
  onSelect: (id: string | null) => void
  draft: string
  onDraft: (value: string) => void
  onCreate: () => void
  onDelete: () => void
  addMode: boolean
  onToggleAddMode: () => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            activeId == null ? 'bg-brass text-desk' : 'bg-panel-2 text-muted hover:text-parchment'
          }`}
        >
          Todas
        </button>
        {palettes.map((palette) => (
          <button
            key={palette.id}
            type="button"
            onClick={() => onSelect(palette.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeId === palette.id
                ? 'bg-brass text-desk'
                : 'bg-panel-2 text-muted hover:text-parchment'
            }`}
          >
            {palette.name}
            <span className="ml-1.5 opacity-70">({palette.paintIds.length})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onCreate()
          }}
        >
          <input
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            placeholder="Nueva paleta (ej. Pallid Hands)…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-parchment outline-none placeholder:text-muted focus:border-brass"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 text-sm text-brass hover:bg-brass/25"
          >
            <Plus className="size-4" />
            Crear
          </button>
        </form>
        {activeId ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleAddMode}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${
                addMode
                  ? 'border-brass bg-brass text-desk'
                  : 'border-line bg-panel-2 text-muted hover:text-parchment'
              }`}
            >
              <Plus className="size-4" />
              {addMode ? 'Listo' : 'Añadir colores'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-muted hover:border-red-400/40 hover:text-red-200"
            >
              <Trash2 className="size-4" />
              Borrar
            </button>
          </div>
        ) : null}
      </div>
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
  onCopy,
  onPaste,
}: {
  query: string
  onQuery: (value: string) => void
  filter: FilterId
  onFilter: (value: FilterId) => void
  preferred: BrandId
  onPreferred: (value: BrandId) => void
  onCopy: () => void
  onPaste: () => void
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
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted hover:text-parchment"
          >
            <ClipboardCopy className="size-4" />
            Copiar
          </button>
          <button
            type="button"
            onClick={onPaste}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted hover:text-parchment"
          >
            <ClipboardPaste className="size-4" />
            Pegar
          </button>
        </div>
      </div>
    </div>
  )
}

const PASTE_EXAMPLE = `{
  "v": 2,
  "owned": ["wraithbone::citadel", "leadbelcher::any"],
  "preferredBrand": "citadel",
  "palettes": [
    {
      "id": "pal_example",
      "name": "Pallid Hands",
      "paintIds": ["wraithbone", "leadbelcher", "guilliman-flesh"]
    }
  ]
}`

function TransferModal({
  mode,
  text,
  onText,
  onClose,
  onApplyPaste,
}: {
  mode: 'copy' | 'paste'
  text: string
  onText: (value: string) => void
  onClose: () => void
  onApplyPaste: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'copy' ? 'Copiar inventario' : 'Pegar inventario'}
        className="w-full max-w-lg rounded-2xl border border-line bg-panel p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-parchment">
              {mode === 'copy' ? 'Copia manual' : 'Pegar inventario'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === 'copy'
                ? 'El portapapeles no estaba disponible. Selecciona y copia el texto.'
                : 'Pega aquí el JSON del inventario. Los colores (lo tengo) se comparten entre paletas.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-parchment"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <textarea
          value={text}
          readOnly={mode === 'copy'}
          onChange={(event) => onText(event.target.value)}
          rows={10}
          placeholder={mode === 'paste' ? PASTE_EXAMPLE : undefined}
          className="w-full resize-y rounded-xl border border-line bg-panel-2 px-3 py-2 font-mono text-xs text-parchment outline-none placeholder:text-muted/70 focus:border-brass"
          spellCheck={false}
        />
        {mode === 'paste' ? (
          <div className="mt-3 rounded-xl border border-line bg-panel-2/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Ejemplo mínimo</p>
              <button
                type="button"
                onClick={() => onText(PASTE_EXAMPLE)}
                className="rounded-md border border-brass/40 px-2 py-1 text-xs text-brass hover:bg-brass/15"
              >
                Usar ejemplo
              </button>
            </div>
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
              {PASTE_EXAMPLE}
            </pre>
          </div>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-parchment"
          >
            Cerrar
          </button>
          {mode === 'paste' ? (
            <button
              type="button"
              onClick={onApplyPaste}
              className="rounded-lg bg-brass px-3 py-2 text-sm font-medium text-desk"
            >
              Aplicar
            </button>
          ) : null}
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
  paletteAction,
}: {
  paints: Paint[]
  owned: Set<string>
  preferred: BrandId
  onToggleBrand: (paint: Paint, brand: BrandId) => void
  onToggleRow: (paint: Paint) => void
  paletteAction: PaletteAction
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
            {paletteAction ? <th className="px-3 py-3 font-medium">Paleta</th> : null}
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
                {paletteAction ? (
                  <td className="px-3 py-2 align-middle">
                    <PaletteActionButton
                      action={paletteAction}
                      paintId={paint.id}
                    />
                  </td>
                ) : null}
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
  paletteAction,
}: {
  paint: Paint
  owned: Set<string>
  preferred: BrandId
  onToggleBrand: (paint: Paint, brand: BrandId) => void
  onToggleRow: (paint: Paint) => void
  paletteAction: { kind: 'add' | 'remove'; onClick: () => void } | null
}) {
  const got = ownsPaint(owned, paint)
  const brands = ownedBrands(owned, paint)
  return (
    <article className={`rounded-2xl border p-4 ${got ? 'border-owned/50 bg-owned/10' : 'border-line bg-panel'}`}>
      <div className="flex items-start justify-between gap-2">
        <RowIdentity paint={paint} owned={got} onToggle={() => onToggleRow(paint)} />
        {paletteAction ? (
          <button
            type="button"
            onClick={paletteAction.onClick}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
              paletteAction.kind === 'add'
                ? 'border-brass/40 text-brass hover:bg-brass/15'
                : 'border-line text-muted hover:text-parchment'
            }`}
          >
            {paletteAction.kind === 'add' ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
            {paletteAction.kind === 'add' ? 'Añadir' : 'Quitar'}
          </button>
        ) : null}
      </div>
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

function PaletteActionButton({
  action,
  paintId,
}: {
  action: Exclude<PaletteAction, null>
  paintId: string
}) {
  return (
    <button
      type="button"
      onClick={() => action.onClick(paintId)}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${
        action.kind === 'add'
          ? 'border-brass/40 text-brass hover:bg-brass/15'
          : 'border-line text-muted hover:text-parchment'
      }`}
    >
      {action.kind === 'add' ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
      {action.kind === 'add' ? 'Añadir' : 'Quitar'}
    </button>
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
  paletteEmpty,
  onAddColors,
}: {
  query: string
  filter: FilterId
  onClear: () => void
  paletteEmpty?: boolean
  onAddColors?: () => void
}) {
  const message = paletteEmpty
    ? 'Esta paleta está vacía. Añade colores; lo que ya tengas marcado sigue contando.'
    : filter === 'owned'
      ? 'Todavía no has marcado ninguna pintura.'
      : filter === 'missing'
        ? 'Lista completa: no te falta ningún color de esta tabla.'
        : `No hay resultados para “${query}”.`
  return (
    <div className="rounded-2xl border border-dashed border-line bg-panel px-6 py-16 text-center">
      <p className="text-parchment">{message}</p>
      {paletteEmpty && onAddColors ? (
        <button
          type="button"
          onClick={onAddColors}
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brass px-3 py-2 text-sm font-medium text-desk"
        >
          <Plus className="size-4" />
          Añadir colores
        </button>
      ) : (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-parchment"
        >
          <X className="size-4" />
          Ver todas
        </button>
      )}
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
