import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { clamp, clipLength, formatShort, layerLabel, packLanes, placeClips, projectDuration, type Clip, type Layer, type Project, type Selection } from './model';
import type { Clock } from './clock';

type Props = {
  project: Project; clock: Clock; playing: boolean; pps: number; selection: Selection;
  onSelect: (s: Selection) => void; onScrub: (t: number) => void; onBeginGesture: () => void;
  onClipChange: (id: string, patch: Partial<Clip>) => void; onLayerChange: (id: string, patch: Partial<Layer>) => void;
  onAddMedia: () => void; onZoom: (factor: number) => void;
};

function drag(e: RPointerEvent, onMove: (dx: number) => void, onStart: () => void) {
  e.stopPropagation(); e.preventDefault();
  const sx = e.clientX; let started = false;
  const move = (ev: PointerEvent) => { const dx = ev.clientX - sx; if (!started) { if (Math.abs(dx) < 3) return; started = true; onStart(); } onMove(dx); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

export default function Timeline({ project, clock, playing, pps, selection, onSelect, onScrub, onBeginGesture, onClipChange, onLayerChange, onAddMedia, onZoom }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [half, setHalf] = useState(160);
  const lastSet = useRef(-1);
  const duration = projectDuration(project);
  const placed = placeClips(project.clips);
  const lanes = packLanes(project.layers);
  const width = Math.max(duration, 1) * pps;

  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const fit = () => setHalf(Math.floor(el.clientWidth / 2)); fit();
    const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const sync = () => { const el = scroller.current; if (!el) return; const left = clock.get() * pps; if (Math.abs(el.scrollLeft - left) > 0.5) { lastSet.current = left; el.scrollLeft = left; } };
    sync(); return clock.subscribe(sync);
  }, [clock, pps, half]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    if (Math.abs(el.scrollLeft - lastSet.current) < 1.5) return;
    lastSet.current = -1; onScrub(clamp(el.scrollLeft / pps, 0, duration));
  };
  const onWheel = (e: React.WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); onZoom(e.deltaY < 0 ? 1.15 : 0.87); } };

  // pinch-zoom on touch
  const pinch = useRef<{ d: number } | null>(null);
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) { pinch.current = null; return; }
    const [a, b] = [e.touches[0], e.touches[1]]; if (!a || !b) return;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch.current) onZoom(d / pinch.current.d);
    pinch.current = { d };
  };

  const ticks: number[] = []; const step = pps > 120 ? 0.5 : pps > 50 ? 1 : pps > 20 ? 2 : 5;
  for (let s = 0; s <= Math.max(duration, 1) + step; s += step) ticks.push(s);

  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;

  const clipBlock = (pc: (typeof placed)[number]) => {
    const { clip } = pc; const asset = project.media[clip.mediaId]; const w = (pc.end - pc.start) * pps; const sel = isSel('clip', clip.id);
    const rate = clip.kind === 'video' ? clip.speed : 1; const thumbs = asset?.thumbs ?? [];
    const n = Math.max(1, Math.ceil(w / 52));
    const trim = (side: 'l' | 'r') => (e: RPointerEvent) => {
      const in0 = clip.in; const out0 = clip.out; const max = clip.kind === 'video' ? asset?.duration ?? out0 : 600;
      drag(e, dx => {
        const d = (dx / pps) * rate;
        if (side === 'r' || clip.kind === 'image') onClipChange(clip.id, { out: side === 'r' ? clamp(out0 + d, in0 + 0.1 * rate, max) : clamp(out0 - d, in0 + 0.1, max) });
        else onClipChange(clip.id, { in: clamp(in0 + d, 0, out0 - 0.1 * rate) });
      }, onBeginGesture);
    };
    return <div key={clip.id} className={`tl-clip ${sel ? 'sel' : ''}`} style={{ left: pc.start * pps, width: w }} onPointerDown={e => { e.stopPropagation(); onSelect({ kind: 'clip', id: clip.id }); }}>
      <div className="tl-thumbs">{Array.from({ length: n }, (_, i) => { const src = thumbs[Math.min(thumbs.length - 1, Math.floor((i / n) * thumbs.length))]; return src ? <img key={i} src={src} alt="" draggable={false} /> : <span key={i} />; })}</div>
      {clip.kind === 'video' && clip.speed !== 1 && <span className="tl-badge">{clip.speed}x</span>}
      {sel && <><span className="tl-handle l" onPointerDown={trim('l')} /><span className="tl-handle r" onPointerDown={trim('r')} /><span className="tl-len">{formatShort(clipLength(clip))}</span></>}
    </div>;
  };

  const layerBlock = (l: Layer) => {
    const sel = isSel('layer', l.id);
    const move = (mode: 'move' | 'l' | 'r') => (e: RPointerEvent) => {
      if (mode === 'move') onSelect({ kind: 'layer', id: l.id });
      const s0 = l.start; const d0 = l.duration; const in0 = l.type === 'audio' || l.type === 'media' ? l.in : 0;
      const maxLen = l.type === 'audio' || (l.type === 'media' && l.kind === 'video') ? (project.media[l.mediaId]?.duration ?? 600) : 600;
      drag(e, dx => {
        const d = dx / pps;
        if (mode === 'move') onLayerChange(l.id, { start: Math.max(0, s0 + d) });
        else if (mode === 'r') onLayerChange(l.id, { duration: clamp(d0 + d, 0.2, maxLen - in0) });
        else { const nd = clamp(d, -Math.min(s0, in0 > 0 || maxLen < 600 ? in0 : s0), d0 - 0.2); const patch: Partial<Layer> = { start: s0 + nd, duration: d0 - nd }; if (l.type === 'audio' || l.type === 'media') (patch as { in: number }).in = in0 + nd; onLayerChange(l.id, patch); }
      }, () => { if (mode === 'move') onBeginGesture(); else onBeginGesture(); });
    };
    const peaks = l.type === 'audio' ? project.media[l.mediaId]?.peaks : undefined;
    return <div key={l.id} className={`tl-layer t-${l.type} ${sel ? 'sel' : ''}`} style={{ left: l.start * pps, width: Math.max(8, l.duration * pps) }} onPointerDown={move('move')}>
      {peaks && <div className="tl-wave">{peaks.filter((_, i) => i % Math.max(1, Math.round(peaks.length / Math.max(8, l.duration * pps / 3))) === 0).map((p, i) => <span key={i} style={{ height: `${Math.max(8, p * 100)}%` }} />)}</div>}
      <span className="tl-name">{l.type === 'audio' && l.voice ? '🎙 ' : ''}{layerLabel(l, project.media)}</span>
      {sel && <><span className="tl-handle l" onPointerDown={move('l')} /><span className="tl-handle r" onPointerDown={move('r')} /></>}
    </div>;
  };

  return <div className="tl" ref={scroller} onScroll={onScroll} onWheel={onWheel} onTouchMove={onTouchMove} onTouchEnd={() => { pinch.current = null; }} onPointerDown={() => onSelect(null)}>
    <div className="tl-inner" style={{ width: width + half * 2, paddingLeft: half, paddingRight: half }}>
      <div className="tl-ruler" style={{ width }}>{ticks.map(s => <span key={s} style={{ left: s * pps }}>{Number.isInteger(s) ? formatShort(s) : '·'}</span>)}</div>
      {lanes.visual.map((lane, i) => <div key={`v${i}`} className="tl-row small" style={{ width }}>{lane.map(layerBlock)}</div>)}
      <div className="tl-row main" style={{ width: width + 60 }}>
        {placed.map(clipBlock)}
        {placed.slice(1).map(pc => <button key={`t${pc.clip.id}`} className={`tl-trans ${pc.clip.transition.type !== 'none' ? 'on' : ''} ${isSel('transition', pc.clip.id) ? 'sel' : ''}`} style={{ left: pc.start * pps }} aria-label="Transition" onPointerDown={e => { e.stopPropagation(); onSelect({ kind: 'transition', id: pc.clip.id }); }}><ArrowLeftRight /></button>)}
        <button className="tl-add" style={{ left: mainEnd(placed) * pps + 8 }} aria-label="Add media" onPointerDown={e => e.stopPropagation()} onClick={onAddMedia}><Plus /></button>
      </div>
      {lanes.audio.map((lane, i) => <div key={`a${i}`} className="tl-row small" style={{ width }}>{lane.map(layerBlock)}</div>)}
      {!lanes.audio.length && <div className="tl-row small hint" style={{ width }}><span>{playing ? '' : '+ Add audio from the menu below'}</span></div>}
    </div>
  </div>;
}
const mainEnd = (placed: { end: number }[]) => placed.at(-1)?.end ?? 0;
