import { removeBackground } from './removeBg';
import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext, type CSSProperties } from 'react';
import { Crosshair, Eraser, ArrowLeft, Undo2, Redo2, Play, Pause, Maximize2, Minimize2, Type, Smile, Sparkles, Palette, SlidersHorizontal, Crop, Trash2, Scissors, Copy, Gauge, Volume2, Wand2, Film, Layers, Music2, Mic, Square, ChevronLeft, ChevronRight, RotateCw, FlipHorizontal, FlipVertical, Pencil, Clapperboard, ImagePlus, Download, X, ZoomIn, ZoomOut, Check, Loader2, Camera, ArrowLeftRight } from 'lucide-react';
import Preview, { unlockMedia } from './Preview';
import Timeline from './Timeline';
import { createClock, type Clock } from './clock';
import AssetLibrary, { type LibrarySample } from './AssetLibrary';
const ClockCtx = createContext<Clock | null>(null);
import { importFile } from './media';
import type { BlendMode } from './model';
import { BLEND_MODES } from './model';
const OVERLAY_FILES = import.meta.glob('@/assets/overlays/*.asset.json', { eager: true, import: 'default' }) as Record<string, { url: string; original_filename: string }>;
const SAMPLE_OVERLAYS = Object.values(OVERLAY_FILES).map(a => ({ url: a.url, name: a.original_filename.replace(/_Ripple_Overlay\.mp4$/, '').replace(/_/g, ' ') + ' ripple' }));
import { putProject } from './storage';
import { importFont } from './fonts';
import { Button } from '@/components/ui/button';
import { exportProject, exportSupport, captureFrame } from './export';
import {
  type TrackPoint, CC_PRESETS, trackPos, setTrackPoint, ANIMATIONS, LOOP_ANIMATIONS, ASPECTS, EFFECTS, EFFECT_GROUPS, FILTERS, FONTS, STICKERS, SWATCHES, TEXT_PRESETS, TEXT_STYLES, TRANSITIONS, clamp, clipAt, formatClock, makeClip, makeText, neutralAdjust, packLanes, placeClips, projectDuration, uid,
  type Adjust, type AnimLoop, type AnimIn, type AnimOut, type Clip, type EffectType, type Layer, type MediaAsset, type Motion, type Project, type Selection, type TextLayer,
} from './model';

type Sheet = null | 'text' | 'textEdit' | 'sticker' | 'effect' | 'filter' | 'adjust' | 'speed' | 'volume' | 'transform' | 'anim' | 'transition' | 'canvas' | 'export' | 'layer' | 'audio' | 'library' | 'track';
const base = (start: number, duration: number) => ({ start, duration, x: 50, y: 50, rotation: 0, opacity: 1, animIn: 'none' as AnimIn, animOut: 'none' as AnimOut });

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
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved');
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
  useEffect(() => { setSaveState('saving'); const id = window.setTimeout(() => { void putProject(project).then(() => setSaveState('saved')).catch(() => setSaveState('error')); }, 350); return () => window.clearTimeout(id); }, [project]);
  const exit = async () => { try { await putProject(ref.current); onExit(); } catch { setSaveState('error'); flash('Could not save project — device storage may be full'); } };

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
  const patchLayer = useCallback((id: string, patch: Partial<Layer>, record = false) => apply(p => ({ ...p, layers: p.layers.map(l => {
    if (l.id !== id) return l;
    // When a layer is tracked, dragging it edits the track point at the playhead instead of its base position.
    if (l.type !== 'audio' && l.track?.length && ('x' in patch || 'y' in patch) && !('track' in patch)) { const cur = trackPos(l, clock.get()); return { ...l, ...patch, track: setTrackPoint(l.track, clock.get() - l.start, patch.x ?? cur.x, patch.y ?? cur.y) } as Layer; }
    return { ...l, ...patch } as Layer;
  }) }), record), [apply, clock]);

  const selClip = selection?.kind === 'clip' ? project.clips.find(c => c.id === selection.id) : undefined;
  const selLayer = selection?.kind === 'layer' ? project.layers.find(l => l.id === selection.id) : undefined;
  const selTrans = selection?.kind === 'transition' ? project.clips.find(c => c.id === selection.id) : undefined;
  useEffect(() => { if (selection && !selClip && !selLayer && !selTrans) setSelection(null); }, [selection, selClip, selLayer, selTrans]);
  const select = useCallback((s: Selection) => { setSelection(s); if (!s) setSheet(null); }, []);

  // ---------- media ----------
  const pickFiles = (mode: 'main' | 'overlay' | 'audio') => { importMode.current = mode; const el = fileRef.current; if (!el) return; el.accept = mode === 'audio' ? 'audio/*,video/*' : 'video/*,image/*'; el.value = ''; el.click(); };
  const addAssets = (assets: MediaAsset[], mode: 'main' | 'overlay' | 'audio', voice = false, blend?: BlendMode) => {
    const t = clock.get(); let selectId: Selection = null;
    apply(p => {
      const media = { ...p.media }; let clips = p.clips; let layers = p.layers;
      assets.forEach(a => {
        media[a.id] = a;
        if (mode === 'audio' || a.kind === 'audio') { const l: Layer = { id: uid('aud'), type: 'audio', start: t, duration: a.duration, mediaId: a.id, in: 0, volume: 100, muted: false, fadeIn: 0, fadeOut: 0, name: a.name, voice }; layers = [...layers, l]; selectId = { kind: 'layer', id: l.id }; }
        else if (mode === 'overlay') { const l: Layer = { ...base(t, a.kind === 'video' ? a.duration : 4), id: uid('ovl'), type: 'media', mediaId: a.id, kind: a.kind === 'video' ? 'video' : 'image', in: 0, width: 55, volume: 100, muted: false, filter: 'none', adjust: neutralAdjust(), ...(blend ? { blend, width: 100 } : {}) }; layers = [...layers, l]; selectId = { kind: 'layer', id: l.id }; }
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

  const addSample = async (s: { url: string; name: string; kind?: 'video' | 'image'; blend?: BlendMode }) => {
    setBusy('Adding overlay…');
    try { const blob = await (await fetch(s.url)).blob(); const img = s.kind === 'image'; const a = await importFile(new File([blob], s.name + (img ? '.jpg' : '.mp4'), { type: img ? (blob.type || 'image/jpeg') : 'video/mp4' })); addAssets([a], 'overlay', false, s.blend ?? 'screen'); flash(`Added ${s.name}`); }
    catch { flash("Couldn't load that overlay"); } finally { setBusy(null); }
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
    const l: Layer = { ...base(t(), 3), animIn: 'none', animOut: 'none', id: uid('stk'), type: 'sticker', emoji, size: 18 }; apply(p => ({ ...p, layers: [...p.layers, l] })); setSelection({ kind: 'layer', id: l.id }); setSheet(null);
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

  const lanes = packLanes(project.layers);
  const timelineHeight = Math.min(300, Math.max(190, 112 + 48 * (Math.max(1, lanes.text.length) + lanes.visual.length + Math.max(1, lanes.audio.length))));
  const hasSel = !!(selClip || selLayer || selTrans);
  const toolBtn = (label: string, Icon: typeof Type, onClick: () => void, cls = '') => <Button variant="ghost" key={label} className={`opt ${cls}`} title={label} onClick={onClick}><Icon /><span>{label}</span></Button>;

  const options = () => {
    const common = [toolBtn('Delete', Trash2, deleteSelected, 'danger')];
    if (selTrans) return [...common, toolBtn('Transition', ArrowLeftRight, () => setSheet('transition'))];
    if (selClip) return [...common, toolBtn('Split', Scissors, splitSelected), toolBtn('Duplicate', Copy, duplicateSelected),
      ...(selClip.kind === 'video' ? [toolBtn('Speed', Gauge, () => setSheet('speed')), toolBtn('Volume', Volume2, () => setSheet('volume'))] : []),
      toolBtn('Filters', Palette, () => setSheet('filter')), toolBtn('Adjust', SlidersHorizontal, () => setSheet('adjust')), toolBtn('Transform', Crop, () => setSheet('transform')),
      toolBtn('Move left', ChevronLeft, () => moveClip(-1)), toolBtn('Move right', ChevronRight, () => moveClip(1))];
    if (!selLayer) return [];
    const rest = [toolBtn('Split', Scissors, splitSelected), toolBtn('Duplicate', Copy, duplicateSelected)];
    if (selLayer.type === 'text') return [...common, toolBtn('Edit', Pencil, () => setSheet('textEdit')), toolBtn('Animate', Wand2, () => setSheet('anim')), toolBtn('Keyframes', Crosshair, () => setSheet('track')), ...rest];
    if (selLayer.type === 'sticker') return [...common, toolBtn('Sticker', Smile, () => setSheet('sticker')), toolBtn('Animate', Wand2, () => setSheet('anim')), toolBtn('Keyframes', Crosshair, () => setSheet('track')), ...rest];
    if (selLayer.type === 'effect') return [...common, toolBtn('Effect', Sparkles, () => setSheet('effect')), ...rest];
    if (selLayer.type === 'audio') return [...common, toolBtn('Volume', Volume2, () => setSheet('volume')), ...rest];
    return [...common, toolBtn('Filters', Palette, () => setSheet('filter')), toolBtn('Adjust', SlidersHorizontal, () => setSheet('adjust')), ...(selLayer.kind === 'video' ? [toolBtn('Volume', Volume2, () => setSheet('volume'))] : []), toolBtn('Animate', Wand2, () => setSheet('anim')), toolBtn('Keyframes', Crosshair, () => setSheet('track')), toolBtn('Splice', Layers, () => setSheet('transform')), ...rest];
  };

  return <div className={`ed ${full ? 'is-full' : ''}`}>
    <input ref={fileRef} type="file" multiple hidden onChange={e => void onFiles(e.target.files)} />
    <header className="ed-top">
      <Button variant="ghost" className="ic" aria-label="Back to projects" onClick={() => void exit()}><ArrowLeft /></Button>
      <input className="ed-name" value={project.name} onChange={e => apply(p => ({ ...p, name: e.target.value }), false)} aria-label="Project name" />
      <div className="ed-top-r">
        <Button variant="ghost" className="ic" aria-label="Undo" disabled={!past.current.length} onClick={undo}><Undo2 /></Button>
        <Button variant="ghost" className="ic" aria-label="Redo" disabled={!future.current.length} onClick={redo}><Redo2 /></Button>
        <span className={`save-state ${saveState}`} role="status">{saveState === 'saved' ? 'Saved on device' : saveState === 'saving' ? 'Saving…' : 'Save failed'}</span>
        <Button variant="ghost" className="pill" aria-label="Aspect ratio" onClick={() => setSheet('canvas')}>{project.aspect}</Button>
        <Button variant="ghost" className="export-btn" onClick={() => setSheet('export')}><Download /> Export</Button>
      </div>
    </header>

    <div className="ed-workspace" style={{ ['--timeline-height' as string]: `${timelineHeight}px` } as CSSProperties}>
    <section className="ed-stage">

      <div className="ed-preview">
        <Preview project={project} clock={clock} playing={playing} selection={selection} onSelect={s => { setSelection(s); }} onBeginGesture={beginGesture} onClipChange={(id, patch) => patchClip(id, patch)} onLayerChange={(id, patch) => patchLayer(id, patch)} onEditText={id => { setSelection({ kind: 'layer', id }); setSheet('textEdit'); }} />
      </div>
    </section>

    <div className="ed-transport">
      <TimeLabel clock={clock} duration={duration} />
      <Button variant="ghost" className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause /> : <Play />}</Button>
      <div className="ed-tr-r">
        <Button variant="ghost" className="ic" aria-label="Zoom out timeline" onClick={() => setPps(v => clamp(v * 0.75, 8, 300))}><ZoomOut /></Button>
        <Button variant="ghost" className="ic" aria-label="Zoom in timeline" onClick={() => setPps(v => clamp(v * 1.33, 8, 300))}><ZoomIn /></Button>
        <Button variant="ghost" className="ic" aria-label="Full screen preview" onClick={() => setFull(f => !f)}>{full ? <Minimize2 /> : <Maximize2 />}</Button>
      </div>
    </div>

    <div className="ed-timeline">
      <Timeline project={project} clock={clock} playing={playing} pps={pps} selection={selection} onSelect={select} onScrub={scrub} onBeginGesture={beginGesture}
        onClipChange={(id, patch) => patchClip(id, patch)} onLayerChange={(id, patch) => patchLayer(id, patch)} onAddMedia={() => pickFiles('main')} onAddText={() => { select(null); setSheet('text'); }} onAddAudio={() => { select(null); setSheet('audio'); }} onZoom={f => setPps(v => clamp(v * f, 8, 300))} />
      <div className="tl-playhead" />
    </div>

    </div>

    <nav className="ed-dock" aria-label="Editing tools">
      {hasSel ? <>{toolBtn('Done', Check, () => select(null), 'back')}<span className="dock-sep" />{options()}</> : <>
        {toolBtn('Media', Film, () => pickFiles('main'))}
        {toolBtn('Text', Type, () => setSheet('text'))}
        {toolBtn('Audio', Music2, () => setSheet('audio'))}
        {toolBtn('Overlay', Layers, () => setSheet('layer'))}
        {toolBtn('Library', Film, () => { select(null); setSheet('library'); })}
        {toolBtn('Effects', Sparkles, () => { select(null); setSheet('effect'); })}
        {toolBtn('Filters', Palette, () => openLook('filter'))}
        {toolBtn('Adjust', SlidersHorizontal, () => openLook('adjust'))}
        {toolBtn('Speed', Gauge, () => { const c = selClip ?? clipAt(placeClips(project.clips), t())?.clip; if (!c || c.kind !== 'video') { flash('Select a video to change speed'); return; } setSelection({ kind: 'clip', id: c.id }); setSheet('speed'); })}
        {toolBtn('Stickers', Smile, () => { select(null); setSheet('sticker'); })}
        {toolBtn('Ratio', Crop, () => setSheet('canvas'))}
        {toolBtn(rec ? 'Stop' : 'Record', rec ? Square : Mic, () => void startRec(), rec ? 'danger' : '')}
      </>}
    </nav>

    {sheet && <div className="sheet-shade" onPointerDown={() => setSheet(null)} />}
    {sheet && <div className="sheet" role="dialog">
      <div className="sheet-head"><b>{SHEET_TITLES[sheet]}</b><Button variant="ghost" className="ic" aria-label="Close" onClick={() => setSheet(null)}><X /></Button></div>
      <div className="sheet-body">
        <ClockCtx.Provider value={clock}><SheetBody sheet={sheet} project={project} selClip={selClip} selLayer={selLayer} selTrans={selTrans} lookTarget={lookTarget()}
          patchClip={patchClip} patchLayer={patchLayer} beginGesture={beginGesture} apply={apply} addText={addText} addSticker={addSticker} addSample={addSample} addEffect={addEffect}
          pickFiles={m => { setSheet(null); pickFiles(m); }} startRec={() => { setSheet(null); void startRec(); }} clockTime={t} flash={flash} setBusy={setBusy} /></ClockCtx.Provider>
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

const SHEET_TITLES: Record<Exclude<Sheet, null>, string> = { text: 'Add text', textEdit: 'Edit text', sticker: 'Stickers', effect: 'Effects', filter: 'Filters', adjust: 'Color correction', speed: 'Speed', volume: 'Volume', transform: 'Transform', anim: 'Animation', track: 'Keyframes & tracking', transition: 'Transition', canvas: 'Canvas', export: 'Export', layer: 'Add layer', library: 'Library', audio: 'Audio' };

type BodyProps = {
  sheet: Exclude<Sheet, null>; project: Project; selClip?: Clip | undefined; selLayer?: Layer | undefined; selTrans?: Clip | undefined;
  lookTarget: { kind: 'clip'; c: Clip } | { kind: 'layer'; l: Extract<Layer, { type: 'media' }> } | null;
  patchClip: (id: string, p: Partial<Clip>, record?: boolean) => void; patchLayer: (id: string, p: Partial<Layer>, record?: boolean) => void; beginGesture: () => void;
  apply: (fn: (p: Project) => Project, record?: boolean) => void; addText: (p: Partial<TextLayer>) => void; addSticker: (e: string) => void; addSample: (s: LibrarySample) => void; addEffect: (e: EffectType) => void;
  pickFiles: (m: 'main' | 'overlay' | 'audio') => void; startRec: () => void; clockTime: () => number; flash: (m: string) => void; setBusy: (m: string | null) => void;
};

function Slider({ label, value, min, max, step = 1, unit = '', onStart, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onStart: () => void; onChange: (v: number) => void }) {
  return <label className="sl"><span>{label}<em>{Math.round(value * 100) / 100}{unit}</em></span>
    <input type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onKeyDown={onStart} onChange={e => onChange(Number(e.target.value))} /></label>;
}
const Chips = <T extends string>({ items, value, onPick }: { items: { id: T; name: string }[]; value: T; onPick: (v: T) => void }) =>
  <div className="chips">{items.map(i => <Button variant="ghost" key={i.id} className={`chip ${i.id === value ? 'on' : ''}`} onClick={() => onPick(i.id)}>{i.name}</Button>)}</div>;

function SheetBody(b: BodyProps) {
  const { sheet, project, selClip, selLayer, selTrans, lookTarget, patchClip, patchLayer, beginGesture, apply } = b;
  if (sheet === 'library') return <><p className="lbl">Tap to add over your video. Change the look in Splice.</p><AssetLibrary onAdd={b.addSample} /></>;
  if (sheet === 'layer') return <div className="grid-tiles">
    <Button variant="ghost" className="tile" onClick={() => b.pickFiles('overlay')}><ImagePlus /><span>Overlay photo / video</span></Button>
    <Button variant="ghost" className="tile" onClick={() => b.addText({})}><Type /><span>Text</span></Button>
    <Button variant="ghost" className="tile" onClick={() => b.addSticker('🔥')}><Smile /><span>Sticker</span></Button>
    <Button variant="ghost" className="tile" onClick={() => b.addEffect('glitch')}><Sparkles /><span>Effect</span></Button>
  </div>;
  if (sheet === 'audio') return <div className="grid-tiles">
    <Button variant="ghost" className="tile" onClick={() => b.pickFiles('audio')}><Music2 /><span>Import music / sound</span></Button>
    <Button variant="ghost" className="tile" onClick={b.startRec}><Mic /><span>Record voiceover</span></Button>
    <Button variant="ghost" className="tile" onClick={() => b.pickFiles('audio')}><Clapperboard /><span>Extract audio from video</span></Button>
  </div>;
  if (sheet === 'text') return <div className="text-template-list"><Button variant="ghost" className="text-add-row" onClick={() => b.addText({})}><Type /> Blank text<ChevronRight /></Button><div className="presets">{TEXT_PRESETS.map(p => <Button variant="ghost" key={p.name} className="preset" onClick={() => b.addText(p.patch)}>
    <span className={`txt txt-${p.patch.style ?? 'plain'}`} style={{ fontFamily: `"${p.patch.font}"`, ['--c' as string]: p.patch.color, ['--a' as string]: p.patch.accent }}><span className="txt-live static">{p.patch.text}</span></span><small>{p.name}</small></Button>)}</div></div>;
  if (sheet === 'sticker') return <div className="stickers">{STICKERS.map(s => <Button variant="ghost" key={s} onClick={() => b.addSticker(s)}>{s}</Button>)}</div>;
  if (sheet === 'effect') { const thumb = project.clips[0] ? project.media[project.clips[0].mediaId]?.thumbs[0] : undefined; return <>
    <p className="lbl">Haze & flare overlays</p><AssetLibrary only="Haze & flare" onAdd={b.addSample} />
    {selLayer?.type === 'effect' && <Slider label="Intensity" value={selLayer.intensity} min={5} max={100} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { intensity: v })} />}
    <EffectBrowser thumb={thumb} activeId={selLayer?.type === 'effect' ? selLayer.effect : undefined} onPick={b.addEffect} />
  </>; }
  if (sheet === 'filter' || sheet === 'adjust') {
    if (!lookTarget) return <p className="muted">Add a video or photo first.</p>;
    const filter = lookTarget.kind === 'clip' ? lookTarget.c.filter : lookTarget.l.filter; const adj = lookTarget.kind === 'clip' ? lookTarget.c.adjust : lookTarget.l.adjust;
    const thumb = project.media[lookTarget.kind === 'clip' ? lookTarget.c.mediaId : lookTarget.l.mediaId]?.thumbs[0];
    const set = (patch: { filter?: string; adjust?: Adjust }, record = false) => lookTarget.kind === 'clip' ? patchClip(lookTarget.c.id, patch, record) : patchLayer(lookTarget.l.id, patch, record);
    if (sheet === 'filter') return <div className="filters">{FILTERS.map(f => <Button variant="ghost" key={f.id} className={`flt ${f.id === filter ? 'on' : ''}`} onClick={() => set({ filter: f.id }, true)}>
      <span style={{ backgroundImage: thumb ? `url(${thumb})` : undefined, filter: f.css || undefined }} /><small>{f.name}</small></Button>)}</div>;
    const keys: [keyof Adjust, string, number, number][] = [['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100], ['temperature', 'Temperature', -100, 100], ['hue', 'Hue', -180, 180], ['vignette', 'Vignette', 0, 100]];
    return <><p className="lbl">CC presets</p><div className="chips">{CC_PRESETS.map(c => <Button variant="ghost" key={c.name} className="chip" onClick={() => set({ adjust: { ...c.adjust } }, true)}>{c.name}</Button>)}</div>
      <p className="lbl">CC overlays</p><AssetLibrary only="CC overlays" onAdd={b.addSample} />
      <p className="lbl">Manual</p>{keys.map(([k, label, min, max]) => <Slider key={k} label={label} value={adj[k]} min={min} max={max} onStart={beginGesture} onChange={v => set({ adjust: { ...adj, [k]: v } })} />)}
      <Button variant="ghost" className="ghost" onClick={() => set({ adjust: neutralAdjust() }, true)}>Reset color</Button></>;
  }
  if (sheet === 'speed' && selClip) return <>
    <p className="lbl">Playback</p><div className="chips">{[{name: 'Slow motion', speed: 0.5}, {name: 'Normal', speed: 1}, {name: 'Fast', speed: 2}].map(mode => <Button variant="ghost" key={mode.name} className={`chip ${(mode.speed < 1 ? selClip.speed < 1 : mode.speed === 1 ? selClip.speed === 1 : selClip.speed > 1) ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { speed: mode.speed }, true)}>{mode.name}</Button>)}</div>
    <Slider label="Speed" value={selClip.speed} min={0.25} max={4} step={0.05} unit="x" onStart={beginGesture} onChange={v => patchClip(selClip.id, { speed: v })} />
    <div className="chips">{[0.25, 0.5, 1, 1.5, 2, 3, 4].map(s => <Button variant="ghost" key={s} className={`chip ${selClip.speed === s ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { speed: s }, true)}>{s}x</Button>)}</div>
  </>;
  if (sheet === 'volume') {
    if (selClip) return <><Slider label="Volume" value={selClip.volume} min={0} max={200} unit="%" onStart={beginGesture} onChange={v => patchClip(selClip.id, { volume: v })} />
      <Button variant="ghost" className={`chip ${selClip.muted ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { muted: !selClip.muted }, true)}>{selClip.muted ? 'Muted' : 'Mute clip'}</Button></>;
    if (selLayer?.type === 'audio' || selLayer?.type === 'media') return <><Slider label="Volume" value={selLayer.volume} min={0} max={200} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { volume: v })} />
      {selLayer.type === 'audio' && <><Slider label="Fade in" value={selLayer.fadeIn} min={0} max={5} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { fadeIn: v })} />
        <Slider label="Fade out" value={selLayer.fadeOut} min={0} max={5} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { fadeOut: v })} /></>}
      <Button variant="ghost" className={`chip ${selLayer.muted ? 'on' : ''}`} onClick={() => patchLayer(selLayer.id, { muted: !selLayer.muted }, true)}>{selLayer.muted ? 'Muted' : 'Mute'}</Button></>;
  }
  if (sheet === 'transform') {
    if (selClip) return <>
      <div className="chips">
        <Button variant="ghost" className="chip" onClick={() => patchClip(selClip.id, { rotate: (selClip.rotate + 90) % 360 }, true)}><RotateCw /> Rotate</Button>
        <Button variant="ghost" className={`chip ${selClip.flipH ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { flipH: !selClip.flipH }, true)}><FlipHorizontal /> Flip</Button>
        <Button variant="ghost" className={`chip ${selClip.flipV ? 'on' : ''}`} onClick={() => patchClip(selClip.id, { flipV: !selClip.flipV }, true)}><FlipVertical /> Mirror</Button>
      </div>
      <p className="lbl">Motion</p>
      <Chips<Motion> items={[{ id: 'none', name: 'None' }, { id: 'zoom-in', name: 'Zoom in' }, { id: 'zoom-out', name: 'Zoom out' }, { id: 'pan-left', name: 'Pan left' }, { id: 'pan-right', name: 'Pan right' }]} value={selClip.motion} onPick={v => patchClip(selClip.id, { motion: v }, true)} />
      <p className="lbl">Frame</p>
      <Chips<'fit' | 'fill'> items={[{ id: 'fit', name: 'Fit' }, { id: 'fill', name: 'Fill frame' }]} value={selClip.fit ?? 'fit'} onPick={v => patchClip(selClip.id, { fit: v, zoom: 1, panX: 0, panY: 0 }, true)} />
      <Slider label="Zoom" value={Math.round((selClip.zoom ?? 1) * 100)} min={30} max={500} unit="%" onStart={beginGesture} onChange={v => patchClip(selClip.id, { zoom: v / 100 })} />
      <Slider label="Position X" value={Math.round(selClip.panX ?? 0)} min={-100} max={100} onStart={beginGesture} onChange={v => patchClip(selClip.id, { panX: v })} />
      <Slider label="Position Y" value={Math.round(selClip.panY ?? 0)} min={-100} max={100} onStart={beginGesture} onChange={v => patchClip(selClip.id, { panY: v })} />
      {selClip.kind === 'image' && <RemoveBgButton asset={project.media[selClip.mediaId]} onDone={a => apply(p => ({ ...p, media: { ...p.media, [a.id]: a }, clips: p.clips.map(c => c.id === selClip.id ? { ...c, mediaId: a.id } : c) }))} flash={b.flash} />}
      {selClip.kind === 'image' && <Slider label="Duration" value={selClip.out} min={0.5} max={30} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchClip(selClip.id, { out: v })} />}
    </>;
    if (selLayer && selLayer.type !== 'audio') return <>
      <Slider label="Opacity" value={Math.round(selLayer.opacity * 100)} min={0} max={100} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { opacity: v / 100 })} />
      {selLayer.type === 'media' && <><p className="lbl">Splice</p><Chips<BlendMode> items={BLEND_MODES} value={selLayer.blend ?? 'normal'} onPick={v => patchLayer(selLayer.id, { blend: v }, true)} /></>}
 {selLayer.type === 'media' && selLayer.kind === 'image' && <RemoveBgButton asset={project.media[selLayer.mediaId]} onDone={a => apply(p => ({ ...p, media: { ...p.media, [a.id]: a }, layers: p.layers.map(l => l.id === selLayer.id ? { ...l, mediaId: a.id } as Layer : l) }))} flash={b.flash} />}
      {selLayer.type === 'media' && <Slider label="Size" value={selLayer.width} min={5} max={300} unit="%" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { width: v })} />}
      <Slider label="Rotation" value={selLayer.rotation} min={-180} max={180} unit="°" onStart={beginGesture} onChange={v => patchLayer(selLayer.id, { rotation: v })} />
    </>;
  }
  if (sheet === 'track' && selLayer && selLayer.type !== 'audio' && selLayer.type !== 'effect') return <TrackPanel layer={selLayer} patchLayer={patchLayer} />;
  if (sheet === 'anim' && selLayer && selLayer.type !== 'audio' && selLayer.type !== 'effect') return <AnimationPanel layer={selLayer} patchLayer={patchLayer} beginGesture={beginGesture} />;
  if (sheet === 'textEdit' && selLayer?.type === 'text') { const l = selLayer; return <div className="text-menu">
    <textarea aria-label="Text content" className="txt-input" value={l.text} autoFocus rows={2} onFocus={beginGesture} onChange={e => patchLayer(l.id, { text: e.target.value })} />
    <TextSection title="Style & templates"><div className="style-grid">{TEXT_STYLES.map(st => <Button variant="ghost" key={st.id} className={`style-tile ${l.style === st.id ? 'on' : ''}`} onClick={() => patchLayer(l.id, { style: st.id }, true)}>
      <span className={`txt txt-${st.id}`} style={{ fontFamily: `"${l.font}"`, ['--c' as string]: l.color, ['--a' as string]: l.accent, ['--outline' as string]: '.06em', ['--glow' as string]: '.4em' }}><span className="txt-live static">Aa</span></span><small>{st.name}</small></Button>)}</div>
    </TextSection><TextSection title="Fonts" value={l.font}><FontUpload project={project} apply={apply} onPick={font => patchLayer(l.id, { font }, true)} flash={b.flash} /><div className="chips">{[...FONTS, ...(project.fonts ?? []).map(f => ({ id: f.family, name: f.name }))].map(f => <Button variant="ghost" key={f.id} className={`chip ${l.font === f.id ? 'on' : ''}`} style={{ fontFamily: `"${f.id}"` }} onClick={() => patchLayer(l.id, { font: f.id }, true)}>{f.name}</Button>)}</div>
    </TextSection><TextSection title="Colors & glow"><div className="swatches">{SWATCHES.map(c => <Button variant="ghost" key={c} aria-label={c} className={l.color === c ? 'on' : ''} style={{ background: c }} onClick={() => patchLayer(l.id, { color: c }, true)} />)}<input type="color" value={l.color} onChange={e => patchLayer(l.id, { color: e.target.value })} /></div>
    <p className="lbl">Glow / outline / box color</p><div className="swatches">{SWATCHES.map(c => <Button variant="ghost" key={c} aria-label={c} className={l.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => patchLayer(l.id, { accent: c }, true)} />)}<input type="color" value={l.accent} onChange={e => patchLayer(l.id, { accent: e.target.value })} /></div>
    <Slider label="Glow strength" value={l.glow ?? 100} min={0} max={200} unit="%" onStart={beginGesture} onChange={v => patchLayer(l.id, { glow: v })} />
    <Slider label="Outline thickness" value={l.outline ?? 4.5} min={1} max={12} step={0.5} onStart={beginGesture} onChange={v => patchLayer(l.id, { outline: v })} />
    </TextSection><TextSection title="Size & layout">
    <Slider label="Letter spacing" value={l.spacing ?? 0} min={-10} max={80} onStart={beginGesture} onChange={v => patchLayer(l.id, { spacing: v })} />
    <Slider label="Line height" value={l.lineHeight ?? 1.12} min={0.8} max={2} step={0.05} onStart={beginGesture} onChange={v => patchLayer(l.id, { lineHeight: v })} />
    </TextSection><TextSection title="Timing & opacity">
    <Slider label="Opacity" value={l.opacity * 100} min={0} max={100} unit="%" onStart={beginGesture} onChange={v => patchLayer(l.id, { opacity: v / 100 })} />
    <Slider label="Duration" value={l.duration} min={0.2} max={60} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchLayer(l.id, { duration: v })} />
    </TextSection><TextSection title="Formatting">
    <Slider label="Size" value={l.size} min={3} max={40} step={0.5} onStart={beginGesture} onChange={v => patchLayer(l.id, { size: v })} />
    <div className="chips"><Button variant="ghost" className={`chip ${l.bold ? 'on' : ''}`} onClick={() => patchLayer(l.id, { bold: !l.bold }, true)}><b>B</b> Bold</Button>
      <Button variant="ghost" className={`chip ${l.caps ? 'on' : ''}`} onClick={() => patchLayer(l.id, { caps: !l.caps }, true)}>AA Caps</Button>
      <Button variant="ghost" className={`chip ${l.italic ? 'on' : ''}`} onClick={() => patchLayer(l.id, { italic: !l.italic }, true)}><i>I</i> Italic</Button>
      {(['left', 'center', 'right'] as const).map(a => <Button variant="ghost" key={a} className={`chip ${l.align === a ? 'on' : ''}`} onClick={() => patchLayer(l.id, { align: a }, true)}>{a}</Button>)}</div>
    </TextSection><TextSection title="Animations" value={l.animIn === 'none' && l.animOut === 'none' && (!l.animLoop || l.animLoop === 'none') ? 'None' : 'Custom'}><AnimationPanel layer={l} patchLayer={patchLayer} beginGesture={beginGesture} /></TextSection>
  </div>; }
  if (sheet === 'transition' && selTrans) return <>
    <Chips items={TRANSITIONS} value={selTrans.transition.type} onPick={v => patchClip(selTrans.id, { transition: { ...selTrans.transition, type: v } }, true)} />
    <Slider label="Duration" value={selTrans.transition.duration} min={0.2} max={2} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchClip(selTrans.id, { transition: { ...selTrans.transition, duration: v } })} />
    <Button variant="ghost" className="ghost" onClick={() => apply(p => ({ ...p, clips: p.clips.map((c, i) => i === 0 ? c : { ...c, transition: { ...selTrans.transition } }) }))}>Apply to all cuts</Button>
  </>;
  if (sheet === 'canvas') return <>
    <p className="lbl">Size</p><div className="chips">{ASPECTS.map(a => <Button variant="ghost" key={a} className={`chip ${project.aspect === a ? 'on' : ''}`} onClick={() => apply(p => ({ ...p, aspect: a }))}>{a}{a === '9:16' ? ' TikTok' : a === '16:9' ? ' YouTube' : a === '1:1' ? ' Square' : a === '4:5' ? ' Post' : ''}</Button>)}</div>
    <p className="lbl">Background</p><div className="swatches">{['#000000', '#ffffff', '#111827', '#ff2d92', '#0a84ff', '#32d74b', '#ffd60a'].map(c => <Button variant="ghost" key={c} aria-label={c} className={project.background === c ? 'on' : ''} style={{ background: c }} onClick={() => apply(p => ({ ...p, background: c }))} />)}</div>
    <Slider label="Default photo length" value={project.imageDuration} min={1} max={15} step={0.5} unit="s" onStart={() => undefined} onChange={v => apply(p => ({ ...p, imageDuration: v }), false)} />
  </>;
  if (sheet === 'export') return <ExportPanel project={project} at={b.clockTime} flash={b.flash} />;
  return <p className="muted">Select something on the timeline first.</p>;
}

function FontUpload({ project, apply, onPick, flash }: { project: Project; apply: BodyProps['apply']; onPick: (font: string) => void; flash: BodyProps['flash'] }) {
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    try {
      const font = await importFont(file);
      apply(p => ({ ...p, fonts: [...(p.fonts ?? []), font] }));
      onPick(font.family);
      flash('Font added and saved on this device');
    } catch (e) { flash(e instanceof Error ? e.message : 'Could not load font'); }
    finally { setLoading(false); }
  };
  return <>
    <input ref={input} type="file" hidden accept=".ttf,.otf,.woff,.woff2" aria-label="Upload font file" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
    <Button variant="outline" className="font-upload" disabled={loading} onClick={() => input.current?.click()}>{loading ? <Loader2 className="spin" /> : <ImagePlus />}{loading ? 'Loading font…' : 'Upload font'}<small>{project.fonts?.length ?? 0} custom</small></Button>
  </>;
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
    <p className="lbl">Quality</p><div className="chips">{[480, 720, 1080].map(r => <Button variant="ghost" key={r} className={`chip ${res === r ? 'on' : ''}`} onClick={() => setRes(r)}>{r}p</Button>)}</div>
    <p className="muted">Saves as {support.ext.toUpperCase()} with sound, 30 fps. Export plays your video in real time ({Math.ceil(dur)}s) — keep this tab open.</p>
    {pct !== null ? <><div className="bar"><span style={{ width: `${pct}%` }} /></div><Button variant="ghost" className="ghost" onClick={() => ctrl.current?.abort()}>Cancel</Button></>
      : out ? <a className="export-btn big" href={out.url} download={out.name}><Download /> Save video</a>
      : <Button variant="ghost" className="export-btn big" onClick={() => void run()}><Download /> Export video</Button>}
    <Button variant="ghost" className="ghost" onClick={() => void frame()}><Camera /> Save current frame as photo</Button>
  </>;
}

function RemoveBgButton({ asset, onDone, flash }: { asset: MediaAsset | undefined; onDone: (a: MediaAsset) => void; flash: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  if (!asset) return null;
  return <Button variant="ghost" className="chip wide" disabled={busy} onClick={async () => {
    setBusy(true); flash('Removing background… first time takes a moment');
    try { onDone(await removeBackground(asset)); flash('Background removed'); }
    catch (e) { flash(e instanceof Error ? e.message : 'Could not remove background'); }
    finally { setBusy(false); }
  }}><Eraser /> {busy ? 'Removing background…' : 'Remove background'}</Button>;
}

const TRENDING: EffectType[] = ['neonaura', 'handheld', 'chromatic', 'letterbox', 'velocity', 'vhs', 'dreamy', 'earthquake', 'golden', 'flicker', 'zoomblur', 'noir'];
function EffectBrowser({ thumb, activeId, onPick }: { thumb: string | undefined; activeId: EffectType | undefined; onPick: (e: EffectType) => void }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState<string>('Trending');
  const list = q.trim() ? EFFECTS.filter(e => e.name.toLowerCase().includes(q.trim().toLowerCase())) : cat === 'Trending' ? TRENDING.map(id => EFFECTS.find(e => e.id === id)!).filter(Boolean) : EFFECTS.filter(e => e.group === cat);
  return <div className="fx-browser">
    <input className="fx-search" type="search" placeholder="Search effects (e.g. Shake, Glow, Chromatic)" value={q} onChange={e => setQ(e.target.value)} aria-label="Search effects" />
    {!q && <div className="fx-cats" role="tablist">{['Trending', ...EFFECT_GROUPS].map(c => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c === 'Trending' ? 'Trending 🔥' : c}</button>)}</div>}
    <div className="fx-grid">{list.map(e => <button key={e.id} className={`fx-tile fx-${e.id} ${activeId === e.id ? 'on' : ''}`} onClick={() => onPick(e.id)}>
      <span className="fx-thumb" style={{ backgroundImage: thumb ? `url(${thumb})` : undefined, filter: e.css || undefined }} /><small>{e.name}</small></button>)}
      {!list.length && <p className="muted">No effects match.</p>}</div>
  </div>;
}
function TrackPanel({ layer, patchLayer }: { layer: Exclude<Layer, { type: 'audio' } | { type: 'effect' }>; patchLayer: BodyProps['patchLayer'] }) {
  const clock = useContext(ClockCtx); const pts = layer.track ?? [];
  const [now, setNow] = useState(() => clock?.get() ?? 0);
  useEffect(() => clock?.subscribe(() => setNow(clock.get())), [clock]);
  const lt = now - layer.start; const here = pts.find(p => Math.abs(p.t - lt) <= 0.04); const cur = trackPos(layer, now);
  const put = (extra: Partial<TrackPoint> = {}, record = true) => patchLayer(layer.id, { track: setTrackPoint(layer.track, lt, cur.x, cur.y, { s: cur.s, r: cur.r, o: cur.o, ...extra }) }, record);
  return <div className="animation-menu">
    <p className="lbl">Move the playhead, then drag the layer or change the sliders. Each change saves a keyframe; the layer glides between them in preview and export.</p>
    <Button onClick={() => put()}><Crosshair /> {here ? 'Keyframe saved here' : pts.length ? 'Add keyframe at playhead' : 'Start keyframes here'}</Button>
    {pts.length > 0 && <>
      <Slider label="Scale" value={Math.round(cur.s * 100)} min={10} max={400} unit="%" onStart={() => undefined} onChange={v => put({ s: v / 100 }, false)} />
      <Slider label="Rotation" value={Math.round(cur.r)} min={-360} max={360} unit="°" onStart={() => undefined} onChange={v => put({ r: v }, false)} />
      <Slider label="Opacity" value={Math.round(cur.o * 100)} min={0} max={100} unit="%" onStart={() => undefined} onChange={v => put({ o: v / 100 }, false)} />
      <div className="animation-list">{pts.map((p, i) => <Button variant="ghost" key={i} aria-pressed={p === here} className={`animation-row ${p === here ? 'on' : ''}`} onClick={() => clock?.set(layer.start + p.t)}><span>Keyframe {i + 1}</span><small>{p.t.toFixed(2)}s</small></Button>)}</div>
      {here && <Button variant="ghost" onClick={() => patchLayer(layer.id, { track: pts.filter(p => p !== here) }, true)}><Trash2 /> Delete this keyframe</Button>}
      <Button variant="ghost" onClick={() => patchLayer(layer.id, { track: undefined, ...(pts[0] ? { x: pts[0].x, y: pts[0].y } : {}) }, true)}><Trash2 /> Remove all keyframes</Button>
    </>}
  </div>;
}
function TextSection({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return <details className="text-section"><summary>{title}<small>{value}</small><ChevronRight /></summary><div className="text-section-body">{children}</div></details>;
}
function AnimationPanel({ layer, patchLayer, beginGesture }: { layer: Exclude<Layer, { type: 'audio' } | { type: 'effect' }>; patchLayer: BodyProps['patchLayer']; beginGesture: () => void }) {
  const [tab, setTab] = useState<'in' | 'out' | 'loop'>('in');
  const set = (patch: Partial<Layer>) => patchLayer(layer.id, patch, true);
  const items = tab === 'loop' ? LOOP_ANIMATIONS : [...ANIMATIONS, ...(tab === 'in' && layer.type === 'text' ? [{ id: 'typewriter', name: 'Typewriter' }] : [])];
  const value = tab === 'in' ? layer.animIn : tab === 'out' ? layer.animOut : layer.animLoop ?? 'none';
  const active = layer.animIn !== 'none' || layer.animOut !== 'none' || (!!layer.animLoop && layer.animLoop !== 'none');
  return <div className="animation-menu">
    <div className="animation-tabs" role="tablist" aria-label="Animation phase">{(['in', 'out', 'loop'] as const).map(t => <Button variant="ghost" key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'in' ? 'Entrance' : t === 'out' ? 'Exit' : 'Loop'}</Button>)}</div>
    <div className="animation-list">{items.map(i => <Button variant="ghost" key={i.id} aria-pressed={value === i.id} className={`animation-row ${value === i.id ? 'on' : ''}`} onClick={() => set(tab === 'in' ? { animIn: i.id as AnimIn } : tab === 'out' ? { animOut: i.id as AnimOut } : { animLoop: i.id as AnimLoop })}><span>{i.name}</span>{value === i.id && <Check />}</Button>)}</div>
    {active && <>
      {tab !== 'loop' && value !== 'none' && <Slider label="Animation duration" value={layer.animDuration ?? 0.5} min={0.1} max={Math.max(0.1, Math.min(5, layer.duration / 2))} step={0.1} unit="s" onStart={beginGesture} onChange={v => patchLayer(layer.id, { animDuration: v })} />}
      {tab === 'loop' && value !== 'none' && <Slider label="Loop speed" value={layer.animLoopSpeed ?? 1} min={0.25} max={4} step={0.25} unit="x" onStart={beginGesture} onChange={v => patchLayer(layer.id, { animLoopSpeed: v })} />}
      <Slider label="Animation strength" value={layer.animAmount ?? 100} min={10} max={200} unit="%" onStart={beginGesture} onChange={v => patchLayer(layer.id, { animAmount: v })} />
      {tab !== 'loop' && <><p className="lbl">Easing</p><Chips items={[{id: 'linear', name: 'Linear'}, {id: 'smooth', name: 'Smooth'}, {id: 'bounce', name: 'Bounce'}]} value={layer.animEasing ?? 'smooth'} onPick={v => set({ animEasing: v })} /></>}
    </>}
    <Button variant="ghost" className="ghost" disabled={!active} onClick={() => set({ animIn: 'none', animOut: 'none', animLoop: 'none' })}>Remove all animations</Button>
  </div>;
}
