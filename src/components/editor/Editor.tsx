import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Undo2, Redo2, Play, Pause, Maximize2, Minimize2, Type, Smile, Sparkles, Palette, SlidersHorizontal, Crop, Trash2, Scissors, Copy, Gauge, Volume2, Wand2, Film, Layers, Music2, Mic, Square, ChevronLeft, ChevronRight, RotateCw, FlipHorizontal, FlipVertical, Pencil, Clapperboard, ImagePlus, Download, X, ZoomIn, ZoomOut, Check, Loader2, Camera, ArrowLeftRight } from 'lucide-react';
import Preview, { unlockMedia } from './Preview';
import Timeline from './Timeline';
import { createClock } from './clock';
import { importFile } from './media';
import { putProject } from './storage';
import { exportProject, exportSupport, captureFrame } from './export';
import {
  ASPECTS, EFFECTS, FILTERS, FONTS, STICKERS, SWATCHES, TEXT_PRESETS, TEXT_STYLES, TRANSITIONS, clamp, clipAt, formatClock, makeClip, makeText, neutralAdjust, placeClips, projectDuration, uid,
  type Adjust, type AnimIn, type AnimOut, type Clip, type EffectType, type Layer, type MediaAsset, type Motion, type Project, type Selection, type TextLayer,
} from './model';

type Sheet = null | 'text' | 'textEdit' | 'sticker' | 'effect' | 'filter' | 'adjust' | 'speed' | 'volume' | 'transform' | 'anim' | 'transition' | 'canvas' | 'export' | 'layer' | 'audio';
const base = (start: number, duration: number) => ({ start, duration, x: 50, y: 50, rotation: 0, opacity: 1, animIn: 'fade' as AnimIn, animOut: 'fade' as AnimOut });

export default function Editor({ initial, onExit }: { initial: Project; onExit: () => void }) {
  const [project, setProject] = useState(initial);
  const ref = useRef(initial); const past = useRef<Project[]>([]); const future = useRef<Project[]>([]);
  const [, force] = useState(0);
  const clock = useMemo(() => createClock(), []);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pps, setPps] = useState(48);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [rec, setRec] = useState<{ stop: () => void; start: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null); const importMode = useRef<'main' | 'overlay' | 'audio'>('main');

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(t => (t === m ? null : t)), 2200); };
  const apply = useCallback((fn: (p: Project) => Project, record = true) => {
    const cur = ref.current; if (record) { past.current.push(cur); if (past.current.length > 80) past.current.shift(); future.current = []; }
    const next = { ...fn(cur), updatedAt: Date.now() }; ref.current = next; setProject(next);
  }, []);
  const beginGesture = useCallback(() => { past.current.push(ref.current); future.current = []; force(n => n + 1); }, []);
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(ref.current); ref.current = p; setProject(p); };
  const redo = () => { const p = future.current.pop(); if (!p) return; past.current.push(ref.current); ref.current = p; setProject(p); };

  // autosave on device
  useEffect(() => { const id = window.setTimeout(() => { void putProject(project); }, 350); return () => window.clearTimeout(id); }, [project]);

  const duration = projectDuration(project);
  // playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const tick = (now: number) => { const dt = (now - last) / 1000; last = now; const t = clock.get() + dt; const end = projectDuration(ref.current); if (t >= end) { clock.set(end); setPlaying(false); return; } clock.set(t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, clock]);
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (duration <= 0) { flash('Add a video or photo first'); return; }
    if (clock.get() >= duration - 0.05) clock.set(0);
    setPlaying(true); window.setTimeout(unlockMedia, 0);
  };
  const scrub = useCallback((t: number) => { setPlaying(false); clock.set(t); }, [clock]);

  const patchClip = useCallback((id: string, patch: Partial<Clip>, record = false) => apply(p => ({ ...p, clips: p.clips.map(c => c.id === id ? { ...c, ...patch } : c) }), record), [apply]);
  const patchLayer = useCallback((id: string, patch: Partial<Layer>, record = false) => apply(p => ({ ...p, layers: p.layers.map(l => l.id === id ? { ...l, ...patch } as Layer : l) }), record), [apply]);

  const selClip = selection?.kind === 'clip' ? project.clips.find(c => c.id === selection.id) : undefined;
  const selLayer = selection?.kind === 'layer' ? project.layers.find(l => l.id === selection.id) : undefined;
  const selTrans = selection?.kind === 'transition' ? project.clips.find(c => c.id === selection.id) : undefined;
  useEffect(() => { if (selection && !selClip && !selLayer && !selTrans) setSelection(null); }, [selection, selClip, selLayer, selTrans]);
  const select = useCallback((s: Selection) => { setSelection(s); if (!s) setSheet(null); }, []);

  // ---------- media ----------
  const pickFiles = (mode: 'main' | 'overlay' | 'audio') => { importMode.current = mode; const el = fileRef.current; if (!el) return; el.accept = mode === 'audio' ? 'audio/*,video/*' : 'video/*,image/*'; el.value = ''; el.click(); };
  const addAssets = (assets: MediaAsset[], mode: 'main' | 'overlay' | 'audio', voice = false) => {
    const t = clock.get(); let selectId: Selection = null;
    apply(p => {
      const media = { ...p.media }; let clips = p.clips; let layers = p.layers;
      assets.forEach(a => {
        media[a.id] = a;
        if (mode === 'audio' || a.kind === 'audio') { const l: Layer = { id: uid('aud'), type: 'audio', start: t, duration: a.duration, mediaId: a.id, in: 0, volume: 100, muted: false, fadeIn: 0, fadeOut: 0, name: a.name, voice }; layers = [...layers, l]; selectId = { kind: 'layer', id: l.id }; }
        else if (mode === 'overlay') { const l: Layer = { ...base(t, a.kind === 'video' ? a.duration : 4), id: uid('ovl'), type: 'media', mediaId: a.id, kind: a.kind === 'video' ? 'video' : 'image', in: 0, width: 55, volume: 100, muted: false, filter: 'none', adjust: neutralAdjust() }; layers = [...layers, l]; selectId = { kind: 'layer', id: l.id }; }
        else { const c = makeClip(a, p.imageDuration); clips = [...clips, c]; }
      });
      return { ...p, media, clips, layers };
    });
    if (selectId) setSelection(selectId);
  };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return; const mode = importMode.current; setBusy(`Importing ${files.length} file${files.length > 1 ? 's' : ''}…`);
    const assets: MediaAsset[] = [];
    for (const f of Array.from(files)) { try { assets.push(await importFile(f)); } catch { flash(`Couldn't open ${f.name}`); } }
    setBusy(null); if (assets.length) { addAssets(assets, mode); flash(`Added ${assets.length} item${assets.length > 1 ? 's' : ''}`); }
  };

  // ---------- record voice ----------
  const startRec = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const chunks: Blob[] = []; const at = clock.get();
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(tr => tr.stop()); setRec(null); setPlaying(false);
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); if (!blob.size) return;
        setBusy('Saving voiceover…');
        try { const a = await importFile(blob, `Voiceover ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`); clock.set(at); addAssets([{ ...a, kind: 'audio' }], 'audio', true); flash('Voiceover added'); } catch { flash('Recording failed'); }
        setBusy(null);
      };
      mr.start(); setRec({ stop: () => mr.stop(), start: Date.now() });
      if (duration > 0) { setPlaying(true); window.setTimeout(unlockMedia, 0); }
    } catch { flash('Microphone access was blocked'); }
  };

  // ---------- edit ops ----------
  const t = () => clock.get();
  const deleteSelected = () => {
    if (selClip) apply(p => ({ ...p, clips: p.clips.filter(c => c.id !== selClip.id) }));
    else if (selLayer) apply(p => ({ ...p, layers: p.layers.filter(l => l.id !== selLayer.id) }));
    else if (selTrans) { patchClip(selTrans.id, { transition: { ...selTrans.transition, type: 'none' } }, true); }
    else return;
    setSelection(null); setSheet(null); flash('Deleted');
  };
  const splitSelected = () => {
    const now = t();
    if (selClip) {
      const pc = placeClips(project.clips).find(x => x.clip.id === selClip.id); if (!pc || now <= pc.start + 0.05 || now >= pc.end - 0.05) { flash('Move the playhead over the clip to split'); return; }
      const src = selClip.in + (now - pc.start) * (selClip.kind === 'video' ? selClip.speed : 1);
      const a: Clip = { ...selClip, out: src }; const b: Clip = { ...selClip, id: uid('clip'), in: src, transition: { type: 'none', duration: 0.6 } };
      apply(p => ({ ...p, clips: p.clips.flatMap(c => c.id === selClip.id ? [a, b] : [c]) })); setSelection({ kind: 'clip', id: b.id }); flash('Split');
    } else if (selLayer) {
      const l = selLayer; if (now <= l.start + 0.05 || now >= l.start + l.duration - 0.05) { flash('Move the playhead over the layer to split'); return; }
      const a = { ...l, duration: now - l.start } as Layer; const b = { ...l, id: uid('lyr'), start: now, duration: l.start + l.duration - now } as Layer;
      if ((b.type === 'audio' || b.type === 'media') && (l.type === 'audio' || l.type === 'media')) b.in = l.in + (now - l.start);
      apply(p => ({ ...p, layers: p.layers.flatMap(x => x.id === l.id ? [a, b] : [x]) })); setSelection({ kind: 'layer', id: b.id }); flash('Split');
    }
  };
  const duplicateSelected = () => {
    if (selClip) { const c = { ...selClip, id: uid('clip') }; apply(p => { const i = p.clips.findIndex(x => x.id === selClip.id); const clips = [...p.clips]; clips.splice(i + 1, 0, c); return { ...p, clips }; }); setSelection({ kind: 'clip', id: c.id }); }
    else if (selLayer) { const l = { ...selLayer, id: uid('lyr'), start: selLayer.start + selLayer.duration } as Layer; apply(p => ({ ...p, layers: [...p.layers, l] })); setSelection({ kind: 'layer', id: l.id }); }
    flash('Duplicated');
  };
  const moveClip = (dir: -1 | 1) => { if (!selClip) return; apply(p => { const i = p.clips.findIndex(c => c.id === selClip.id); const j = i + dir; if (j < 0 || j >= p.clips.length) return p; const clips = [...p.clips]; const [c] = clips.splice(i, 1); if (c) clips.splice(j, 0, c); return { ...p, clips }; }); };

  const addText = (patch: Partial<TextLayer>) => { const l = makeText(t(), patch); apply(p => ({ ...p, layers: [...p.layers, l] })); setSelection({ kind: 'layer', id: l.id }); setSheet('textEdit'); };
  const addSticker = (emoji: string) => {
    if (selLayer?.type === 'sticker') { patchLayer(selLayer.id, { emoji }, true); return; }
    const l: Layer = { ...base(t(), 3), animIn: 'pop', animOut: 'pop', id: uid('stk'), type: 'sticker', emoji, size: 18 }; apply(p => ({ ...p, layers: [...p.layers, l] })); setSelection({ kind: 'layer', id: l.id }); setSheet(null);
  };
  const addEffect = (effect: EffectType) => {
    if (selLayer?.type === 'effect') { patchLayer(selLayer.id, { effect }, true); return; }
    const l: Layer = { ...base(t(), 2), id: uid('fx'), type: 'effect', effect, intensity: 70 }; apply(p => ({ ...p, layers: [...p.layers, l] })); setSelection({ kind: 'layer', id: l.id });
  };

  // look target: selected clip / overlay, else the clip under the playhead
  const lookTarget = (): { kind: 'clip'; c: Clip } | { kind: 'layer'; l: Extract<Layer, { type: 'media' }> } | null => {
    if (selClip) return { kind: 'clip', c: selClip };
    if (selLayer?.type === 'media') return { kind: 'layer', l: selLayer };
    const cur = clipAt(placeClips(project.clips), t()); return cur ? { kind: 'clip', c: cur.clip } : null;
  };
  const openLook = (s: 'filter' | 'adjust') => { const lt = lookTarget(); if (!lt) { flash('Add a video or photo first'); return; } if (lt.kind === 'clip' && !selClip) setSelection({ kind: 'clip', id: lt.c.id }); setSheet(s); };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) splitSelected();
      else if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const hasSel = !!(selClip || selLayer || selTrans);
  const toolBtn = (label: string, Icon: typeof Type, onClick: () => void, cls = '') => <button key={label} className={`opt ${cls}`} onClick={onClick}><Icon /><span>{label}</span></button>;

  const options = () => {
    const common = [toolBtn('Delete', Trash2, deleteSelected, 'danger')];
    if (selTrans) return [...common, toolBtn('Transition', ArrowLeftRight, () => setSheet('transition'))];
    if (selClip) return [...common, toolBtn('Split', Scissors, splitSelected), toolBtn('Duplicate', Copy, duplicateSelected),
      ...(selClip.kind === 'video' ? [toolBtn('Speed', Gauge, () => setSheet('speed')), toolBtn('Volume', Volume2, () => setSheet('volume'))] : []),
      toolBtn('Filters', Palette, () => setSheet('filter')), toolBtn('Adjust', SlidersHorizontal, () => setSheet('adjust')), toolBtn('Transform', Crop, () => setSheet('transform')),
      toolBtn('Move left', ChevronLeft, () => moveClip(-1)), toolBtn('Move right', ChevronRight, () => moveClip(1))];
    if (!selLayer) return [];
    const rest = [toolBtn('Split', Scissors, splitSelected), toolBtn('Duplicate', Copy, duplicateSelected)];
    if (selLayer.type === 'text') return [...common, toolBtn('Edit', Pencil, () => setSheet('textEdit')), toolBtn('Animate', Wand2, () => setSheet('anim')), ...rest];
    if (selLayer.type === 'sticker') return [...common, toolBtn('Sticker', Smile, () => setSheet('sticker')), toolBtn('Animate', Wand2, () => setSheet('anim')), ...rest];
    if (selLayer.type === 'effect') return [...common, toolBtn('Effect', Sparkles, () => setSheet('effect')), ...rest];
    if (selLayer.type === 'audio') return [...common, toolBtn('Volume', Volume2, () => setSheet('volume')), ...rest];
    return [...common, toolBtn('Filters', Palette, () => setSheet('filter')), toolBtn('Adjust', SlidersHorizontal, () => setSheet('adjust')), ...(selLayer.kind === 'video' ? [toolBtn('Volume', Volume2, () => setSheet('volume'))] : []), toolBtn('Animate', Wand2, () => setSheet('anim')), toolBtn('Opacity', Layers, () => setSheet('transform')), ...rest];
  };

  return <div className={`ed ${full ? 'is-full' : ''}`}>
    <input ref={fileRef} type="file" multiple hidden onChange={e => void onFiles(e.target.files)} />
    <header className="ed-top">
      <button className="ic" aria-label="Back to projects" onClick={onExit}><ArrowLeft /></button>
      <input className="ed-name" value={project.name} onChange={e => apply(p => ({ ...p, name: e.target.value }), false)} aria-label="Project name" />
      <div className="ed-top-r">
        <button className="ic" aria-label="Undo" disabled={!past.current.length} onClick={undo}><Undo2 /></button>
        <button className="ic" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 /></button>
        <button className="pill" onClick={() => setSheet('canvas')}>{project.aspect}</button>
        <button className="export-btn" onClick={() => setSheet('export')}><Download /> Export</button>
      </div>
    </header>

    <section className="ed-stage">
      <aside className="ed-rail">
        {hasSel && <button className="rail del" onClick={deleteSelected} aria-label="Delete selected"><Trash2 /><span>Delete</span></button>}
        <button className="rail" onClick={() => setSheet('text')}><Type /><span>Text</span></button>
        <button className="rail" onClick={() => { if (selLayer?.type !== 'sticker') select(null); setSheet('sticker'); }}><Smile /><span>Sticker</span></button>
        <button className="rail" onClick={() => { if (selLayer?.type !== 'effect') select(null); setSheet('effect'); }}><Sparkles /><span>Effects</span></button>
        <button className="rail" onClick={() => openLook('filter')}><Palette /><span>Filters</span></button>
        <button className="rail" onClick={() => openLook('adjust')}><SlidersHorizontal /><span>Color</span></button>
        <button className="rail" onClick={() => setSheet('canvas')}><Crop /><span>Canvas</span></button>
      </aside>
      <div className="ed-preview">
        <Preview project={project} clock={clock} playing={playing} selection={selection} onSelect={s => { setSelection(s); }} onBeginGesture={beginGesture} onLayerChange={(id, patch) => patchLayer(id, patch)} onEditText={id => { setSelection({ kind: 'layer', id }); setSheet('textEdit'); }} />
      </div>
    </section>

    <div className="ed-transport">
      <TimeLabel clock={clock} duration={duration} />
      <button className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause /> : <Play />}</button>
      <div className="ed-tr-r">
        <button className="ic" aria-label="Zoom out timeline" onClick={() => setPps(v => clamp(v * 0.75, 8, 300))}><ZoomOut /></button>
        <button className="ic" aria-label="Zoom in timeline" onClick={() => setPps(v => clamp(v * 1.33, 8, 300))}><ZoomIn /></button>
        <button className="ic" aria-label="Full screen preview" onClick={() => setFull(f => !f)}>{full ? <Minimize2 /> : <Maximize2 />}</button>
      </div>
    </div>

    <div className="ed-timeline">
      <Timeline project={project} clock={clock} playing={playing} pps={pps} selection={selection} onSelect={select} onScrub={scrub} onBeginGesture={beginGesture}
        onClipChange={(id, patch) => patchClip(id, patch)} onLayerChange={(id, patch) => patchLayer(id, patch)} onAddMedia={() => pickFiles('main')} onZoom={f => setPps(v => clamp(v * f, 8, 300))} />
      <div className="tl-playhead" />
    </div>

    <nav className="ed-bottom">
      {hasSel ? <div className="opts">
        <button className="opt back" onClick={() => select(null)} aria-label="Done"><Check /><span>Done</span></button>
        {options()}
      </div> : <div className="dial">
        <button className="dial-btn" onClick={() => pickFiles('main')}><span className="dial-ring"><Film /></span>Media</button>
        <button className="dial-btn" onClick={() => setSheet('layer')}><span className="dial-ring"><Layers /></span>Layer</button>
        <button className="dial-btn" onClick={() => setSheet('audio')}><span className="dial-ring"><Music2 /></span>Audio</button>
        <button className={`dial-btn ${rec ? 'rec-on' : ''}`} onClick={() => void startRec()}><span className="dial-ring rec">{rec ? <Square /> : <Mic />}</span>{rec ? 'Stop' : 'REC'}</button>
      </div>}
    </nav>

    {sheet && <div className="sheet-shade" onPointerDown={() => setSheet(null)} />}
    {sheet && <div className="sheet" role="dialog">
      <div className="sheet-head"><b>{SHEET_TITLES[sheet]}</b><button className="ic" aria-label="Close" onClick={() => setSheet(null)}><X /></button></div>
      <div className="sheet-body">
        <SheetBody sheet={sheet} project={project} selClip={selClip} selLayer={selLayer} selTrans={selTrans} lookTarget={lookTarget()}
          patchClip={patchClip} patchLayer={patchLayer} beginGesture={beginGesture} apply={apply} addText={addText} addSticker={addSticker} addEffect={addEffect}
          pickFiles={m => { setSheet(null); pickFiles(m); }} startRec={() => { setSheet(null); void startRec(); }} clockTime={t} flash={flash} setBusy={setBusy} />
      </div>
    </div>}
    {rec && <div className="rec-badge"><span /> Recording… tap Stop</div>}
    {busy && <div className="busy"><Loader2 className="spin" /> {busy}</div>}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function TimeLabel({ clock, duration }: { clock: ReturnType<typeof createClock>; duration: number }) {
  const [t, setT] = useState(clock.get());
  useEffect(() => clock.subscribe(() => setT(clock.get())), [clock]);
  return <div className="time"><b>{formatClock(t).slice(3, 10)}</b> / {formatClock(duration).slice(3, 10)}</div>;
}

const SHEET_TITLES: Record<Exclude<Sheet, null>, string> = { text: 'Add text', textEdit: 'Edit text', sticker: 'Stickers', effect: 'Effects', filter: 'Filters', adjust: 'Color correction', speed: 'Speed', volume: 'Volume', transform: 'Transform', anim: 'Animation', transition: 'Transition', canvas: 'Canvas', export: 'Export', layer: 'Add layer', audio: 'Audio' };

type BodyProps = {
  sheet: Exclude<Sheet, null>; project: Project; selClip?: Clip | undefined; selLayer?: Layer | undefined; selTrans?: Clip | undefined;
  lookTarget: { kind: 'clip'; c: Clip } | { kind: 'layer'; l: Extract<Layer, { type: 'media' }> } | null;
  patchClip: (id: string, p: Partial<Clip>, record?: boolean) => void; patchLayer: (id: string, p: Partial<Layer>, record?: boolean) => void; beginGesture: () => void;
  apply: (fn: (p: Project) => Project, record?: boolean) => void; addText: (p: Partial<TextLayer>) => void; addSticker: (e: string) => void; addEffect: (e: EffectType) => void;
  pickFiles: (m: 'main' | 'overlay' | 'audio') => void; startRec: () => void; clockTime: () => number; flash: (m: string) => void; setBusy: (m: string | null) => void;
};

function Slider({ label, value, min, max, step = 1, unit = '', onStart, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onStart: () => void; onChange: (v: number) => void }) {
  return <label className="sl"><span>{label}<em>{Math.round(value * 100) / 100}{unit}</em></span>
    <input type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onKeyDown={onStart} onChange={e => onChange(Number(e.target.value))} /></label>;
}
const Chips = <T extends string>({ items, value, onPick }: { items: { id: T; name: string }[]; value: T; onPick: (v: T) => void }) =>
  <div className="chips">{items.map(i => <button key={i.id} className={`chip ${i.id === value ? 'on' : ''}`} onClick={() => onPick(i.id)}>{i.name}</button>)}</div>;

function SheetBody(b: BodyProps) {
  const { sheet, project, selClip, selLayer, selTrans, lookTarget, patchClip, patchLayer, beginGesture, apply } = b;
  if (sheet === 'layer') return <div className="grid-tiles">
    <button className="tile" onClick={() => b.pickFiles('overlay')}><ImagePlus /><span>Overlay photo / video</span></button>
    <button className="tile" onClick={() => b.addText({})}><Type /><span>Text</span></button>
    <button className="tile" onClick={() => b.addSticker('🔥')}><Smile /><span>Sticker</span></button>
    <button className="tile" onClick={() => b.addEffect('glitch')}><Sparkles /><span>Effect</span></button>
  </div>;
  if (sheet === 'audio') return <div className="grid-tiles">
    <button className="tile" onClick={() => b.pickFiles('audio')}><Music2 /><span>Import music / sound</span></button>
    <button className="tile" onClick={b.startRec}><Mic /><span>Record voiceover</span></button>
    <button className="tile" onClick={() => b.pickFiles('audio')}><Clapperboard /><span>Extract audio from video</span></button>
  </div>;
  if (sheet === 'text') return <div className="presets">{TEXT_PRESETS.map(p => <button key={p.name} className="preset" onClick={() => b.addText(p.patch)}>
    <span className={`txt txt-${p.patch.style ?? 'plain'}`} style={{ fontFamily: `"${p.patch.font}"`, ['--c' as string]: p.patch.color, ['--a' as string]: p.patch.accent }}><span className="txt-live static">{p.patch.text}</span></span><small>{p.name}</small></button>)}</div>;
  if (sheet === 'sticker') return <div className="stickers">{STICKERS.map(s => <button key={s} onClick={() => b.addSticker(s)}>{s}</button>)}</div>;
  if (sheet === 'effect') return <>
    <div className="grid-tiles">{EFFECTS.map(e => <button key={e.id} className={`tile small ${selLayer?.type === 'effect' && selLayer.effect === e.id ? 'on' : ''}`} onClick={() => b.addEffect(e.id)}><Sparkles /><span>{e.name}</span></button>)}</div>
    {selLayer?.type === 'effect' && <Slider label="Intensity" value={selLayer.intensity} min={5} max={100} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { intensity: v })} />}
  </>;
  if (sheet === 'filter' || sheet === 'adjust') {
    if (!lookTarget) return <p className="muted">Add a video or photo first.</p>;
    const filter = lookTarget.kind === 'clip' ? lookTarget.c.filter : lookTarget.l.filter; const adj = lookTarget.kind === 'clip' ? lookTarget.c.adjust : lookTarget.l.adjust;
    const thumb = project.media[lookTarget.kind === 'clip' ? lookTarget.c.mediaId : lookTarget.l.mediaId]?.thumbs[0];
    const set = (patch: { filter?: string; adjust?: Adjust }, record = false) => lookTarget.kind === 'clip' ? patchClip(lookTarget.c.id, patch, record) : patchLayer(lookTarget.l.id, patch, record);
    if (sheet === 'filter') return <div className="filters">{FILTERS.map(f => <button key={f.id} className={`flt ${f.id === filter ? 'on' : ''}`} onClick={() => set({ filter: f.id }, true)}>
      <span style={{ backgroundImage: thumb ? `url(${thumb})` : undefined, filter: f.css || undefined }} /><small>{f.name}</small></button>)}</div>;
    const keys: [keyof Adjust, string, number, number][] = [['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100], ['temperature', 'Temperature', -100, 100], ['hue', 'Hue', -180, 180], ['vignette', 'Vignette', 0, 100]];
    return <>{keys.map(([k, label, min, max]) => <Slider key={k} label={label} value={adj[k]} min={min} max={max} onStart={beginGesture} onChange={v => set({ adjust: { ...adj, [k]: v } })} />)}
      <button className="ghost" onClick={() => set({ adjust: neutralAdjust() }, true)}>Reset color</button></>;
  }
  if (sheet === 'speed' && selClip) return <>
    <Slider label="Speed" value={selClip.speed} min={0.25} max={4} step={0.05} unit="x" onStart={beginGesture} onChange={v => patchClip(selClip.id, { speed: v })} />
    <div className="chips">{[0.25, 0.5, 1, 1.5, 2, 3, 4].map(s => <button key={s} className={`chip ${selClip.speed === s ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { speed: s }, true)}>{s}x</button>)}</div>
  </>;
  if (sheet === 'volume') {
    if (selClip) return <><Slider label="Volume" value={selClip.volume} min={0} max={200} unit="%" onStart={beginGesture} onChange={v => patchClip(selClip.id, { volume: v })} />
      <button className={`chip ${selClip.muted ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { muted: !selClip.muted }, true)}>{selClip.muted ? 'Muted' : 'Mute clip'}</button></>;
    if (selLayer?.type === 'audio' || selLayer?.type === 'media') return <><Slider label="Volume" value={selLayer.volume} min={0} max={200} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { volume: v })} />
      {selLayer.type === 'audio' && <><Slider label="Fade in" value={selLayer.fadeIn} min={0} max={5} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { fadeIn: v })} />
        <Slider label="Fade out" value={selLayer.fadeOut} min={0} max={5} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { fadeOut: v })} /></>}
      <button className={`chip ${selLayer.muted ? 'on' : ''}`} onClick={() => patchLayer(selLayer.id, { muted: !selLayer.muted }, true)}>{selLayer.muted ? 'Muted' : 'Mute'}</button></>;
  }
  if (sheet === 'transform') {
    if (selClip) return <>
      <div className="chips">
        <button className="chip" onClick={() => patchClip(selClip.id, { rotate: (selClip.rotate + 90) % 360 }, true)}><RotateCw /> Rotate</button>
        <button className={`chip ${selClip.flipH ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { flipH: !selClip.flipH }, true)}><FlipHorizontal /> Flip</button>
        <button className={`chip ${selClip.flipV ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { flipV: !selClip.flipV }, true)}><FlipVertical /> Mirror</button>
      </div>
      <p className="lbl">Motion</p>
      <Chips<Motion> items={[{ id: 'none', name: 'None' }, { id: 'zoom-in', name: 'Zoom in' }, { id: 'zoom-out', name: 'Zoom out' }, { id: 'pan-left', name: 'Pan left' }, { id: 'pan-right', name: 'Pan right' }]} value={selClip.motion} onPick={v => patchClip(selClip.id, { motion: v }, true)} />
      {selClip.kind === 'image' && <Slider label="Duration" value={selClip.out} min={0.5} max={30} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchClip(selClip.id, { out: v })} />}
    </>;
    if (selLayer && selLayer.type !== 'audio') return <>
      <Slider label="Opacity" value={Math.round(selLayer.opacity * 100)} min={0} max={100} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { opacity: v / 100 })} />
      {selLayer.type === 'media' && <Slider label="Size" value={selLayer.width} min={5} max={300} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { width: v })} />}
      <Slider label="Rotation" value={selLayer.rotation} min={-180} max={180} unit="°" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { rotation: v })} />
    </>;
  }
  if (sheet === 'anim' && selLayer && selLayer.type !== 'audio' && selLayer.type !== 'effect') return <>
    <p className="lbl">In</p><Chips<AnimIn> items={[{ id: 'none', name: 'None' }, { id: 'fade', name: 'Fade' }, { id: 'pop', name: 'Pop' }, { id: 'slide', name: 'Slide up' }, { id: 'zoom', name: 'Zoom' }, ...(selLayer.type === 'text' ? [{ id: 'typewriter' as AnimIn, name: 'Typewriter' }] : [])]} value={selLayer.animIn} onPick={v => patchLayer(selLayer.id, { animIn: v }, true)} />
    <p className="lbl">Out</p><Chips<AnimOut> items={[{ id: 'none', name: 'None' }, { id: 'fade', name: 'Fade' }, { id: 'pop', name: 'Pop' }, { id: 'slide', name: 'Slide' }, { id: 'zoom', name: 'Zoom' }]} value={selLayer.animOut} onPick={v => patchLayer(selLayer.id, { animOut: v }, true)} />
  </>;
  if (sheet === 'textEdit' && selLayer?.type === 'text') { const l = selLayer; return <>
    <textarea className="txt-input" value={l.text} autoFocus rows={2} onFocus={beginGesture} onChange={e => patchLayer(l.id, { text: e.target.value })} />
    <p className="lbl">Style</p><Chips items={TEXT_STYLES} value={l.style} onPick={v => patchLayer(l.id, { style: v }, true)} />
    <p className="lbl">Font</p><div className="chips">{FONTS.map(f => <button key={f.id} className={`chip ${l.font === f.id ? 'on' : ''}`} style={{ fontFamily: `"${f.id}"` }} onClick={() => patchLayer(l.id, { font: f.id }, true)}>{f.name}</button>)}</div>
    <p className="lbl">Color</p><div className="swatches">{SWATCHES.map(c => <button key={c} aria-label={c} className={l.color === c ? 'on' : ''} style={{ background: c }} onClick={() => patchLayer(l.id, { color: c }, true)} />)}<input type="color" value={l.color} onChange={e => patchLayer(l.id, { color: e.target.value })} /></div>
    <p className="lbl">Glow / outline / box color</p><div className="swatches">{SWATCHES.map(c => <button key={c} aria-label={c} className={l.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => patchLayer(l.id, { accent: c }, true)} />)}<input type="color" value={l.accent} onChange={e => patchLayer(l.id, { accent: e.target.value })} /></div>
    <Slider label="Size" value={l.size} min={3} max={40} step={0.5} onStart={beginGesture} onChange={v => patchLayer(l.id, { size: v })} />
    <div className="chips"><button className={`chip ${l.bold ? 'on' : ''}`} onClick={() => patchLayer(l.id, { bold: !l.bold }, true)}><b>B</b> Bold</button>
      {(['left', 'center', 'right'] as const).map(a => <button key={a} className={`chip ${l.align === a ? 'on' : ''}`} onClick={() => patchLayer(l.id, { align: a }, true)}>{a}</button>)}</div>
  </>; }
  if (sheet === 'transition' && selTrans) return <>
    <Chips items={TRANSITIONS} value={selTrans.transition.type} onPick={v => patchClip(selTrans.id, { transition: { ...selTrans.transition, type: v } }, true)} />
    <Slider label="Duration" value={selTrans.transition.duration} min={0.2} max={2} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchClip(selTrans.id, { transition: { ...selTrans.transition, duration: v } })} />
    <button className="ghost" onClick={() => apply(p => ({ ...p, clips: p.clips.map((c, i) => i === 0 ? c : { ...c, transition: { ...selTrans.transition } }) }))}>Apply to all cuts</button>
  </>;
  if (sheet === 'canvas') return <>
    <p className="lbl">Size</p><div className="chips">{ASPECTS.map(a => <button key={a} className={`chip ${project.aspect === a ? 'on' : ''}`} onClick={() => apply(p => ({ ...p, aspect: a }))}>{a}{a === '9:16' ? ' TikTok' : a === '16:9' ? ' YouTube' : a === '1:1' ? ' Square' : a === '4:5' ? ' Post' : ''}</button>)}</div>
    <p className="lbl">Background</p><div className="swatches">{['#000000', '#ffffff', '#111827', '#ff2d92', '#0a84ff', '#32d74b', '#ffd60a'].map(c => <button key={c} aria-label={c} className={project.background === c ? 'on' : ''} style={{ background: c }} onClick={() => apply(p => ({ ...p, background: c }))} />)}</div>
    <Slider label="Default photo length" value={project.imageDuration} min={1} max={15} step={0.5} unit="s" onStart={() => undefined} onChange={v => apply(p => ({ ...p, imageDuration: v }), false)} />
  </>;
  if (sheet === 'export') return <ExportPanel project={project} at={b.clockTime} flash={b.flash} />;
  return <p className="muted">Select something on the timeline first.</p>;
}

function ExportPanel({ project, at, flash }: { project: Project; at: () => number; flash: (m: string) => void }) {
  const [res, setRes] = useState(1080); const [pct, setPct] = useState<number | null>(null); const [out, setOut] = useState<{ url: string; name: string } | null>(null);
  const ctrl = useRef<AbortController | null>(null); const support = useMemo(() => exportSupport(), []);
  const dur = projectDuration(project);
  const run = async () => {
    if (dur <= 0) { flash('Nothing to export yet'); return; }
    ctrl.current = new AbortController(); setPct(0); setOut(null);
    try { const r = await exportProject(project, { resolution: res, fps: 30, onProgress: setPct, signal: ctrl.current.signal }); setOut({ url: URL.createObjectURL(r.blob), name: `${project.name || 'video'}.${r.ext}` }); }
    catch (e) { if (!ctrl.current?.signal.aborted) flash(e instanceof Error ? e.message : 'Export failed'); }
    setPct(null);
  };
  const frame = async () => { try { const blob = await captureFrame(project, at()); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${project.name || 'frame'}.png`; a.click(); } catch { flash('Could not save frame'); } };
  if (!support) return <p className="muted">This browser can't record video. Try Chrome, Edge or a recent Safari.</p>;
  return <>
    <p className="lbl">Quality</p><div className="chips">{[480, 720, 1080].map(r => <button key={r} className={`chip ${res === r ? 'on' : ''}`} onClick={() => setRes(r)}>{r}p</button>)}</div>
    <p className="muted">Saves as {support.ext.toUpperCase()} with sound, 30 fps. Export plays your video in real time ({Math.ceil(dur)}s) — keep this tab open.</p>
    {pct !== null ? <><div className="bar"><span style={{ width: `${pct}%` }} /></div><button className="ghost" onClick={() => ctrl.current?.abort()}>Cancel</button></>
      : out ? <a className="export-btn big" href={out.url} download={out.name}><Download /> Save video</a>
      : <button className="export-btn big" onClick={() => void run()}><Download /> Export video</button>}
    <button className="ghost" onClick={() => void frame()}><Camera /> Save current frame as photo</button>
  </>;
}
