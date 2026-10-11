import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { aspectValue, clamp, clipAt, clipBox, effectState, effectiveTransition, fontWeight, isActive, layerAnim, lookCss, motionTransform, placeClips, temperatureTint, transitionFx, type Clip, type FrameFx, type Layer, type MediaAsset, type Project, type Selection, type VisualLayer } from './model';
import { useClock, type Clock } from './clock';
import { mediaUrl } from './storage';

// Media elements currently allowed to play; unlocked synchronously on the Play tap (mobile autoplay rules).
export const liveMedia = new Set<HTMLMediaElement>();
export function unlockMedia() { liveMedia.forEach(el => { void el.play().catch(() => undefined); }); }

type SyncOpts = { sourceTime: number; playing: boolean; rate: number; volume: number; muted: boolean };
function useMediaSync(ref: React.RefObject<HTMLMediaElement | null>, o: SyncOpts) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.playbackRate = o.rate; el.volume = clamp(o.volume / 100, 0, 1); el.muted = o.muted;
    if (o.playing) {
      liveMedia.add(el);
      if (Math.abs(el.currentTime - o.sourceTime) > 0.3) el.currentTime = o.sourceTime;
      if (el.paused) void el.play().catch(() => undefined);
    } else {
      liveMedia.delete(el);
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - o.sourceTime) > 0.04 && el.readyState >= 1) el.currentTime = o.sourceTime;
    }
  });
  useEffect(() => () => { const el = ref.current; if (el) { liveMedia.delete(el); el.pause(); } }, [ref]);
}

function Video({ src, className, style, ...sync }: SyncOpts & { src: string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null); useMediaSync(ref, sync);
  return <video ref={ref} src={src} className={className} style={style} playsInline preload="auto" />;
}
function AudioEl(props: SyncOpts & { src: string }) {
  const ref = useRef<HTMLAudioElement>(null); const { src, ...sync } = props; useMediaSync(ref, sync);
  return <audio ref={ref} src={src} preload="auto" />;
}

const idleFx: FrameFx = { opacity: 1, tx: 0, ty: 0, scale: 1, rotate: 0, clipRight: 0 };

function ClipView({ clip, asset, sourceTime, playing, fx, progress, size, hidden }: { clip: Clip; asset: MediaAsset; sourceTime: number; playing: boolean; fx: FrameFx; progress: number; size: { w: number; h: number }; hidden?: boolean | undefined }) {
  const { dw, dh, ox, oy } = clipBox(asset, clip, size.w, size.h);
  const m = motionTransform(clip.motion, progress);
  const sx = fx.scale * m.scale * (clip.flipH ? -1 : 1); const sy = fx.scale * m.scale * (clip.flipV ? -1 : 1);
  const style: CSSProperties = {
    width: dw, height: dh, opacity: hidden ? 0 : fx.opacity, filter: lookCss(clip.filter, clip.adjust),
    transform: `translate(-50%, -50%) translate(${(fx.tx / 100) * size.w + ox}px, ${(fx.ty / 100) * size.h + oy}px) rotate(${fx.rotate + clip.rotate}deg) scale(${sx}, ${sy}) translateX(${(m.tx / 100) * size.w}px)`,
  };
  const tint = temperatureTint(clip.adjust.temperature);
  return <div className="clip-frame" style={{ clipPath: fx.clipRight ? `inset(0 ${fx.clipRight}% 0 0)` : undefined, visibility: hidden ? 'hidden' : undefined }}>
    {clip.kind === 'video'
      ? <Video src={mediaUrl(clip.mediaId)} className="clip-el" style={style} sourceTime={sourceTime} playing={playing && !hidden} rate={clip.speed} volume={clip.volume} muted={clip.muted || !!hidden} />
      : <img src={mediaUrl(clip.mediaId)} className="clip-el" style={style} alt="" draggable={false} />}
    {tint && <div className="clip-tint" style={{ width: dw, height: dh, background: tint.replace(/[\d.]+\)$/, v => `${Math.min(1, parseFloat(v) * 3)})`), opacity: fx.opacity, transform: style.transform }} />}
    {clip.adjust.vignette > 0 && <div className="vignette" style={{ opacity: (clip.adjust.vignette / 100) * fx.opacity }} />}
  </div>;
}

type Props = {
  project: Project; clock: Clock; playing: boolean; selection: Selection;
  onSelect: (s: Selection) => void; onBeginGesture: () => void; onClipChange: (id: string, patch: Partial<Clip>) => void; onLayerChange: (id: string, patch: Partial<Layer>) => void; onEditText: (id: string) => void;
};

export default function Preview({ project, clock, playing, selection, onSelect, onBeginGesture, onClipChange, onLayerChange, onEditText }: Props) {
  const t = useClock(clock);
  const wrapRef = useRef<HTMLDivElement>(null); const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 180 });
  const [guides, setGuides] = useState({ v: false, h: false });
  // The frame is locked to the ratio. Pinch / ctrl+wheel / drag reframe the current clip inside it.
  const curRef = useRef<Clip | null>(null);
  const zoomClip = (f: number) => { const c = curRef.current; if (!c) return; onClipChange(c.id, { zoom: clamp((c.zoom ?? 1) * f, 0.3, 5) }); };
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomClip(Math.exp(-e.deltaY * 0.004)); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  });
  const touch = useRef<{ d: number } | null>(null);
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) { touch.current = null; return; }
    const a = e.touches[0]; const b = e.touches[1]; if (!a || !b) return;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (touch.current) zoomClip(d / touch.current.d); else onBeginGesture();
    touch.current = { d };
  };
  const panClip = (e: RPointerEvent, c: Clip) => {
    const stage = stageRef.current?.getBoundingClientRect(); if (!stage) return;
    const sx = e.clientX; const sy = e.clientY; const x0 = c.panX ?? 0; const y0 = c.panY ?? 0; let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!moved) { moved = true; onBeginGesture(); }
      let x = x0 + ((ev.clientX - sx) / stage.width) * 100; let y = y0 + ((ev.clientY - sy) / stage.height) * 100;
      if (Math.abs(x) < 1.5) x = 0; if (Math.abs(y) < 1.5) y = 0; setGuides({ v: x === 0, h: y === 0 });
      onClipChange(c.id, { panX: clamp(x, -100, 100), panY: clamp(y, -100, 100) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); setGuides({ v: false, h: false }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const aspect = aspectValue(project.aspect);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const fit = () => { const W = el.clientWidth; const H = el.clientHeight; const w = Math.min(W, H * aspect); setSize({ w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(w / aspect)) }); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [aspect]);

  const placed = placeClips(project.clips); const cur = clipAt(placed, t);
  const fx = effectState(project.layers, t); curRef.current = cur?.clip ?? null;
  const mounted: { key: string; node: React.ReactNode }[] = [];
  if (cur) {
    const tr = effectiveTransition(placed, cur.index); const local = t - cur.start; const prev = placed[cur.index - 1]; const next = placed[cur.index + 1];
    const inTr = !!(tr && prev && local < tr.duration); const fxs = inTr && tr ? transitionFx(tr.type, local / tr.duration) : { a: idleFx, b: idleFx };
    const view = (pc: typeof cur, sourceTime: number, f: FrameFx, active: boolean, hidden?: boolean) => {
      const asset = project.media[pc.clip.mediaId]; if (!asset) return;
      mounted.push({ key: pc.clip.id, node: <ClipView key={pc.clip.id} clip={pc.clip} asset={asset} sourceTime={sourceTime} playing={playing && active} fx={f} progress={(t - pc.start) / Math.max(0.1, pc.end - pc.start)} size={size} hidden={hidden} /> });
    };
    if (prev) view(prev, Math.max(prev.clip.in, prev.clip.out - 0.04), fxs.a, false, !inTr);
    view(cur, cur.clip.in + clamp(local, 0, cur.end - cur.start) * (cur.clip.kind === 'video' ? cur.clip.speed : 1), fxs.b, true);
    if (next) view(next, next.clip.in, idleFx, false, true);
  }

  const startDrag = (e: RPointerEvent, l: VisualLayer) => {
    e.stopPropagation(); onSelect({ kind: 'layer', id: l.id });
    const stage = stageRef.current?.getBoundingClientRect(); if (!stage) return;
    const sx = e.clientX; const sy = e.clientY; const x0 = l.x; const y0 = l.y; let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / stage.width) * 100; const dy = ((ev.clientY - sy) / stage.height) * 100;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      if (!moved) { moved = true; onBeginGesture(); }
      let x = x0 + dx; let y = y0 + dy; const v = Math.abs(x - 50) < 1.5; const h = Math.abs(y - 50) < 1.5;
      if (v) x = 50; if (h) y = 50; setGuides({ v, h });
      onLayerChange(l.id, { x: clamp(x, -20, 120), y: clamp(y, -20, 120) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); setGuides({ v: false, h: false }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const startScale = (e: RPointerEvent, l: VisualLayer) => {
    e.stopPropagation(); e.preventDefault();
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); const cx = box.left + box.width / 2; const cy = box.top + box.height / 2;
    const d0 = Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)); const a0 = Math.atan2(e.clientY - cy, e.clientX - cx); const r0 = l.rotation;
    const s0 = l.type === 'text' ? l.size : l.type === 'sticker' ? l.size : l.width; onBeginGesture();
    const move = (ev: PointerEvent) => {
      const k = Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0; let r = r0 + ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180) / Math.PI;
      r = ((r + 540) % 360) - 180; for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(r - snap) < 4) r = snap;
      const size = clamp(s0 * k, 1, l.type === 'media' ? 300 : 120);
      onLayerChange(l.id, l.type === 'media' ? { width: size, rotation: r } : { size, rotation: r } as Partial<Layer>);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const renderVisual = (l: VisualLayer) => {
    const active = isActive(l, t); const selected = selection?.kind === 'layer' && selection.id === l.id;
    if (!active && !(l.type === 'media' && l.kind === 'video' && t >= l.start - 1.5 && t < l.start)) return null;
    const a = layerAnim(l, t, l.type === 'text' ? l.text.length : 0);
    const style: CSSProperties = { mixBlendMode: l.blend && l.blend !== 'normal' ? l.blend : undefined, left: `${l.x}%`, top: `${l.y}%`, opacity: active ? a.opacity : 0, transform: `translate(-50%, -50%) translate(${a.dx}cqw, ${a.dy}cqh) rotate(${l.rotation + a.rotation}deg) scale(${a.scale})` };
    let body: React.ReactNode = null;
    if (l.type === 'text') {
      const shown = l.animIn === 'typewriter' ? l.text.slice(0, a.chars) : l.text;
      body = <div className={`txt txt-${l.style}`} style={{ fontFamily: `"${l.font}"`, fontWeight: fontWeight(l.font, l.bold), fontStyle: l.italic ? 'italic' : 'normal', lineHeight: l.lineHeight ?? 1.12, fontSize: `${l.size}cqh`, textAlign: l.align, letterSpacing: `${(l.spacing ?? 0) / 100}em`, textTransform: l.caps ? 'uppercase' : undefined, ['--glow' as string]: `${(l.glow ?? 100) / 200}em`, ['--outline' as string]: `${(l.outline ?? 4.5) / 100}em`, ['--c' as string]: l.color, ['--a' as string]: l.accent }}>
        <span className="txt-ghost">{l.text}</span><span className="txt-live">{shown}</span>
      </div>;
    } else if (l.type === 'sticker') body = <div className="sticker" style={{ fontSize: `${l.size}cqh` }}>{l.emoji}</div>;
    else {
      const asset = project.media[l.mediaId]; if (!asset) return null;
      const w = (l.width / 100) * size.w; const h = w * (asset.height / Math.max(1, asset.width));
      const look = { width: w, height: h, filter: lookCss(l.filter, l.adjust), display: 'block' };
      body = l.kind === 'video'
        ? <Video src={mediaUrl(l.mediaId)} style={look} sourceTime={l.in + clamp(t - l.start, 0, l.duration)} playing={playing && active} rate={1} volume={l.volume} muted={l.muted || !active} />
        : <img src={mediaUrl(l.mediaId)} style={look} alt="" draggable={false} />;
    }
    return <div key={l.id} className={`layer-box ${selected ? 'is-selected' : ''}`} style={style}
      onPointerDown={e => startDrag(e, l)} onDoubleClick={() => l.type === 'text' && onEditText(l.id)}>
      {body}
      {selected && !playing && <button className="scale-handle" aria-label="Resize and rotate" onPointerDown={e => startScale(e, l)}><RotateCw /></button>}
    </div>;
  };

  return <div ref={wrapRef} className="stage-wrap" onTouchMove={onTouchMove} onTouchEnd={() => { touch.current = null; }}>
    {cur && selection?.kind === 'clip' && selection.id === cur.clip.id && !playing && <div className="zoom-pill">
      <button aria-label="Zoom out clip" onClick={() => { onBeginGesture(); zoomClip(0.9); }}><ZoomOut /></button>
      <button aria-label="Reset framing" onClick={() => { onBeginGesture(); onClipChange(cur.clip.id, { zoom: 1, panX: 0, panY: 0 }); }}>{Math.round((cur.clip.zoom ?? 1) * 100)}%</button>
      <button aria-label="Zoom in clip" onClick={() => { onBeginGesture(); zoomClip(1.1); }}><ZoomIn /></button>
    </div>}
    <div ref={stageRef} className="stage" style={{ width: size.w, height: size.h, background: project.background }}
      onPointerDown={e => { if ((e.target as HTMLElement).closest('.layer-box')) return; if (cur) { onSelect({ kind: 'clip', id: cur.clip.id }); if (!playing) panClip(e, cur.clip); } else onSelect(null); }}>
      <div className="stage-base" style={{ transform: `translate(${fx.dx}%, ${fx.dy}%) scale(${fx.scale})`, filter: fx.filter || undefined }}>
        {mounted.map(m => m.node)}
        {project.layers.map(l => l.type === 'media' ? renderVisual(l) : null)}
      </div>
      {fx.vignette > 0 && <div className="vignette" style={{ opacity: fx.vignette }} />}
      {fx.darken > 0 && <div className="fx-fill" style={{ background: 'black', opacity: fx.darken }} />}
      {project.layers.map(l => l.type === 'text' || l.type === 'sticker' ? renderVisual(l) : null)}
      {fx.letterbox > 0 && <><div className="lbox top" style={{ height: `${fx.letterbox}%` }} /><div className="lbox bot" style={{ height: `${fx.letterbox}%` }} /></>}
      {fx.flash > 0 && <div className="fx-fill" style={{ background: 'white', opacity: fx.flash }} />}
      {guides.v && <div className="guide guide-v" />}{guides.h && <div className="guide guide-h" />}
      {project.layers.map(l => l.type === 'audio' && t >= l.start - 1.5 && t < l.start + l.duration
        ? <AudioEl key={l.id} src={mediaUrl(l.mediaId)} sourceTime={l.in + clamp(t - l.start, 0, l.duration)} playing={playing && isActive(l, t)} rate={1} volume={l.volume * fade(l, t)} muted={l.muted} /> : null)}
      {!project.clips.length && !project.layers.length && <div className="stage-empty">Tap <b>Media</b> to add videos and photos</div>}
    </div>
  </div>;
}
const fade = (l: { start: number; duration: number; fadeIn: number; fadeOut: number }, t: number) => {
  let v = 1; if (l.fadeIn > 0) v *= clamp((t - l.start) / l.fadeIn, 0, 1); if (l.fadeOut > 0) v *= clamp((l.start + l.duration - t) / l.fadeOut, 0, 1); return v;
};
