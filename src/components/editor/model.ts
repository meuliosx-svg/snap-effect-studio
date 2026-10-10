// Browser-safe editor model: types, timeline math and shared look/feel helpers.

export type MediaKind = 'video' | 'image' | 'audio';
export type MediaAsset = { id: string; name: string; kind: MediaKind; duration: number; width: number; height: number; thumbs: string[]; peaks?: number[]; hasAudio?: boolean };

export type Adjust = { brightness: number; contrast: number; saturation: number; temperature: number; hue: number; vignette: number };
export type AnimIn = 'none' | 'fade' | 'pop' | 'slide' | 'zoom' | 'typewriter';
export type AnimOut = 'none' | 'fade' | 'pop' | 'slide' | 'zoom';
export type Motion = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
export type TransitionType = 'none' | 'fade' | 'dissolve' | 'slide' | 'push' | 'zoom' | 'wipe' | 'spin';
export type Transition = { type: TransitionType; duration: number };

export type Clip = {
  id: string; mediaId: string; kind: 'video' | 'image';
  in: number; out: number; speed: number; volume: number; muted: boolean;
  filter: string; adjust: Adjust; rotate: number; flipH: boolean; flipV: boolean; motion: Motion;
  transition: Transition;
  fit?: 'fit' | 'fill'; zoom?: number; panX?: number; panY?: number;
};

type LayerBase = { id: string; start: number; duration: number; x: number; y: number; rotation: number; opacity: number; animIn: AnimIn; animOut: AnimOut };
export type TextStyle = 'plain' | 'glow' | 'neon' | 'outline' | 'neon-outline' | 'shadow' | 'gradient' | 'box' | 'stroke' | 'extrude';
export type TextLayer = LayerBase & { type: 'text'; text: string; font: string; size: number; color: string; accent: string; style: TextStyle; bold: boolean; align: 'left' | 'center' | 'right'; italic?: boolean; lineHeight?: number; glow?: number; outline?: number; spacing?: number; caps?: boolean };
export type MediaLayer = LayerBase & { type: 'media'; mediaId: string; kind: 'video' | 'image'; in: number; width: number; volume: number; muted: boolean; filter: string; adjust: Adjust };
export type StickerLayer = LayerBase & { type: 'sticker'; emoji: string; size: number };
export type EffectLayer = LayerBase & { type: 'effect'; effect: EffectType; intensity: number };
export type AudioLayer = { id: string; type: 'audio'; start: number; duration: number; mediaId: string; in: number; volume: number; muted: boolean; fadeIn: number; fadeOut: number; name: string; voice?: boolean };
export type Layer = TextLayer | MediaLayer | StickerLayer | EffectLayer | AudioLayer;
export type VisualLayer = TextLayer | MediaLayer | StickerLayer;

export type EffectType = 'blur' | 'mono' | 'sepia' | 'invert' | 'shake' | 'pulse' | 'flash' | 'glitch' | 'vignette' | 'rainbow' | 'darken' | 'letterbox' | 'strobe' | 'punch' | 'dreamy' | 'push' | 'warm' | 'cool' | 'rgb' | 'zoomblur' | 'heartbeat' | 'vhs' | 'film' | 'bloom' | 'fadein' | 'fadeout' | 'bounce' | 'cyber' | 'golden' | 'noir' | 'overexpose' | 'retro' | 'swing' | 'blackflash' | 'dolly' | 'hazy' | 'chrome';
export type Aspect = '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
export type ProjectFont = { id: string; family: string; name: string };
export type Project = { id: string; name: string; aspect: Aspect; background: string; imageDuration: number; clips: Clip[]; layers: Layer[]; media: Record<string, MediaAsset>; fonts?: ProjectFont[]; createdAt: number; updatedAt: number };
export type Selection = { kind: 'clip' | 'layer' | 'transition'; id: string } | null;

export const ASPECTS: Aspect[] = ['16:9', '9:16', '1:1', '4:5', '4:3'];
export const aspectValue = (a: Aspect) => { const [w = 16, h = 9] = a.split(':').map(Number); return w / h; };
export const neutralAdjust = (): Adjust => ({ brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0, vignette: 0 });
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function newProject(aspect: Aspect = '16:9', name = 'My project'): Project {
  const now = Date.now();
  return { id: uid('proj'), name, aspect, background: '#000000', imageDuration: 4, clips: [], layers: [], media: {}, createdAt: now, updatedAt: now };
}

// Size/offset of a main clip inside the locked frame (fit or fill, plus user zoom and pan in % of frame).
export function clipBox(asset: { width: number; height: number }, clip: Clip, W: number, H: number) {
  const rotated = Math.abs(clip.rotate % 180) === 90;
  const aw = Math.max(1, rotated ? asset.height : asset.width); const ah = Math.max(1, rotated ? asset.width : asset.height);
  const base = clip.fit === 'fill' ? Math.max(W / aw, H / ah) : Math.min(W / aw, H / ah);
  const s = base * (clip.zoom ?? 1);
  return { dw: asset.width * s, dh: asset.height * s, ox: ((clip.panX ?? 0) / 100) * W, oy: ((clip.panY ?? 0) / 100) * H };
}

// ---------- timeline math ----------
export const clipLength = (c: Clip) => Math.max(0.1, (c.out - c.in) / (c.kind === 'video' ? c.speed : 1));
export type PlacedClip = { clip: Clip; start: number; end: number; index: number };
export function placeClips(clips: Clip[]): PlacedClip[] {
  let t = 0;
  return clips.map((clip, index) => { const start = t; t += clipLength(clip); return { clip, start, end: t, index }; });
}
export const mainDuration = (clips: Clip[]) => clips.reduce((sum, c) => sum + clipLength(c), 0);
export const projectDuration = (p: Project) => Math.max(mainDuration(p.clips), ...p.layers.map(l => l.start + l.duration), 0);
export const clipAt = (placed: PlacedClip[], t: number) => placed.find(p => t >= p.start && t < p.end) ?? (placed.length && t >= (placed.at(-1)?.end ?? 0) - 1e-6 ? placed.at(-1) : undefined);
export const clipSourceTime = (p: PlacedClip, t: number) => clamp(p.clip.in + (t - p.start) * (p.clip.kind === 'video' ? p.clip.speed : 1), p.clip.in, Math.max(p.clip.in, p.clip.out - 0.03));
export const transitionLimit = (placed: PlacedClip[], index: number) => {
  const a = placed[index - 1]; const b = placed[index];
  if (!a || !b) return 0;
  return Math.max(0, Math.min(2, (a.end - a.start) / 2, (b.end - b.start) / 2));
};
export const effectiveTransition = (placed: PlacedClip[], index: number): Transition | null => {
  const b = placed[index];
  if (!b || index === 0 || b.clip.transition.type === 'none') return null;
  return { type: b.clip.transition.type, duration: Math.min(b.clip.transition.duration, transitionLimit(placed, index)) };
};
export const isActive = (l: { start: number; duration: number }, t: number) => t >= l.start && t < l.start + l.duration;

// Pack layers into lanes so that non-overlapping layers share a row.
export function packLanes(layers: Layer[]) {
  const visual = layers.filter(l => l.type !== 'audio' && l.type !== 'text');
  const text = layers.filter(l => l.type === 'text');
  const audio = layers.filter(l => l.type === 'audio');
  const pack = (list: Layer[]) => {
    const lanes: Layer[][] = [];
    [...list].sort((a, b) => a.start - b.start).forEach(layer => {
      const lane = lanes.find(row => row.every(o => layer.start >= o.start + o.duration - 1e-6 || layer.start + layer.duration <= o.start + 1e-6));
      if (lane) lane.push(layer); else lanes.push([layer]);
    });
    return lanes;
  };
  return { visual: pack(visual), text: pack(text), audio: pack(audio) };
}

// ---------- look ----------
export const FILTERS: { id: string; name: string; css: string }[] = [
  { id: 'none', name: 'Original', css: '' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.45) contrast(1.08)' },
  { id: 'warm', name: 'Warm', css: 'sepia(.25) saturate(1.25) hue-rotate(-8deg)' },
  { id: 'cool', name: 'Cool', css: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)' },
  { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.5) brightness(.9)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.5) contrast(.9) brightness(1.05) saturate(.85)' },
  { id: 'faded', name: 'Faded', css: 'contrast(.8) brightness(1.1) saturate(.7)' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.35) saturate(1.2) brightness(.92)' },
  { id: 'teal', name: 'Teal & Orange', css: 'sepia(.25) saturate(1.5) hue-rotate(-12deg) contrast(1.15)' },
  { id: 'dream', name: 'Dream', css: 'brightness(1.1) saturate(1.3) contrast(.9) blur(.4px)' },
  { id: 'night', name: 'Night', css: 'brightness(.75) saturate(.8) hue-rotate(18deg) contrast(1.2)' },
];
export const filterCss = (id: string) => FILTERS.find(f => f.id === id)?.css ?? '';
export function adjustCss(a: Adjust) {
  return [`brightness(${1 + a.brightness / 200})`, `contrast(${1 + a.contrast / 100})`, `saturate(${1 + a.saturation / 100})`, a.hue ? `hue-rotate(${a.hue}deg)` : ''].filter(Boolean).join(' ');
}
export const lookCss = (filter: string, a: Adjust, extra = '') => [filterCss(filter), adjustCss(a), extra].filter(Boolean).join(' ').trim() || 'none';
export const temperatureTint = (t: number) => t > 0 ? `rgba(255,140,30,${t / 250})` : t < 0 ? `rgba(40,130,255,${-t / 250})` : '';

export type EffectGroup = 'Cinematic' | 'Motion' | 'Color' | 'Glitch & Light';
export const EFFECTS: { id: EffectType; name: string; group: EffectGroup; css: string }[] = [
  { id: 'letterbox', name: 'Cinema Bars', group: 'Cinematic', css: '' }, { id: 'dreamy', name: 'Dreamy', group: 'Cinematic', css: 'blur(1.5px) brightness(1.15) saturate(1.2)' },
  { id: 'punch', name: 'Punch', group: 'Cinematic', css: 'contrast(1.4) saturate(1.4)' }, { id: 'vignette', name: 'Vignette', group: 'Cinematic', css: 'brightness(.85)' }, { id: 'darken', name: 'Darken', group: 'Cinematic', css: 'brightness(.5)' },
  { id: 'shake', name: 'Shake', group: 'Motion', css: '' }, { id: 'pulse', name: 'Zoom Pulse', group: 'Motion', css: '' }, { id: 'push', name: 'Slow Push', group: 'Motion', css: '' }, { id: 'blur', name: 'Blur', group: 'Motion', css: 'blur(3px)' },
  { id: 'mono', name: 'Black & White', group: 'Color', css: 'grayscale(1)' }, { id: 'sepia', name: 'Sepia', group: 'Color', css: 'sepia(1)' }, { id: 'warm', name: 'Warm Tone', group: 'Color', css: 'sepia(.35) saturate(1.4) hue-rotate(-10deg)' },
  { id: 'cool', name: 'Cool Tone', group: 'Color', css: 'saturate(1.2) hue-rotate(20deg)' }, { id: 'invert', name: 'Invert', group: 'Color', css: 'invert(1)' }, { id: 'rainbow', name: 'Color Cycle', group: 'Color', css: 'hue-rotate(120deg) saturate(1.6)' },
  { id: 'glitch', name: 'Glitch', group: 'Glitch & Light', css: 'hue-rotate(90deg) saturate(2)' }, { id: 'rgb', name: 'RGB Split', group: 'Glitch & Light', css: 'saturate(1.8) contrast(1.2)' },
  { id: 'flash', name: 'Flash', group: 'Glitch & Light', css: 'brightness(1.8)' },
  { id: 'zoomblur', name: 'Zoom Blur In', group: 'Motion', css: 'blur(2px)' }, { id: 'heartbeat', name: 'Heartbeat', group: 'Motion', css: '' }, { id: 'bounce', name: 'Bounce', group: 'Motion', css: '' },
  { id: 'swing', name: 'Swing', group: 'Motion', css: '' }, { id: 'dolly', name: 'Dolly Zoom', group: 'Motion', css: 'blur(.6px)' },
  { id: 'film', name: 'Film Grain', group: 'Cinematic', css: 'sepia(.25) contrast(1.1)' }, { id: 'noir', name: 'Noir', group: 'Cinematic', css: 'grayscale(1) contrast(1.6)' },
  { id: 'fadein', name: 'Fade In', group: 'Cinematic', css: 'brightness(.5)' }, { id: 'fadeout', name: 'Fade Out', group: 'Cinematic', css: 'brightness(.4)' }, { id: 'hazy', name: 'Hazy', group: 'Cinematic', css: 'contrast(.7) brightness(1.15) blur(.8px)' },
  { id: 'golden', name: 'Golden Hour', group: 'Color', css: 'sepia(.4) saturate(1.5) hue-rotate(-15deg)' }, { id: 'cyber', name: 'Cyberpunk', group: 'Color', css: 'hue-rotate(200deg) saturate(1.8)' },
  { id: 'retro', name: 'Retro 70s', group: 'Color', css: 'sepia(.5) hue-rotate(-20deg) saturate(1.4)' }, { id: 'chrome', name: 'Chrome', group: 'Color', css: 'saturate(2.2) contrast(1.35)' },
  { id: 'vhs', name: 'VHS', group: 'Glitch & Light', css: 'saturate(1.6) blur(.6px)' }, { id: 'bloom', name: 'Bloom', group: 'Glitch & Light', css: 'brightness(1.25) saturate(1.2)' },
  { id: 'overexpose', name: 'Overexpose', group: 'Glitch & Light', css: 'brightness(1.6) contrast(.8)' }, { id: 'blackflash', name: 'Black Flash', group: 'Glitch & Light', css: 'brightness(.3)' }, { id: 'strobe', name: 'Strobe', group: 'Glitch & Light', css: 'brightness(1.5) contrast(1.3)' },
];
export const EFFECT_GROUPS: EffectGroup[] = ['Cinematic', 'Motion', 'Color', 'Glitch & Light'];
export const effectName = (id: EffectType) => EFFECTS.find(e => e.id === id)?.name ?? id;
// Returns CSS filter + transform (in % of frame / deg) + overlay for the active effect layers.
export function effectState(layers: Layer[], t: number) {
  const filters: string[] = []; let dx = 0; let dy = 0; let scale = 1; let flash = 0; let vignette = 0; let darken = 0; let letterbox = 0;
  layers.forEach(l => {
    if (l.type !== 'effect' || !isActive(l, t)) return;
    const k = l.intensity / 100; const local = t - l.start;
    switch (l.effect) {
      case 'blur': filters.push(`blur(${(k * 12).toFixed(2)}px)`); break;
      case 'mono': filters.push(`grayscale(${k})`); break;
      case 'sepia': filters.push(`sepia(${k})`); break;
      case 'invert': filters.push(`invert(${k})`); break;
      case 'rainbow': filters.push(`hue-rotate(${Math.round(local * 180 * (0.3 + k))}deg)`); break;
      case 'shake': dx += Math.sin(local * 47) * 1.6 * k; dy += Math.cos(local * 61) * 1.6 * k; break;
      case 'pulse': scale *= 1 + (Math.sin(local * Math.PI * 2) * 0.5 + 0.5) * 0.12 * k; break;
      case 'flash': flash = Math.max(flash, Math.max(0, 1 - ((local * 2) % 1) * 2.5) * k); break;
      case 'glitch': { const s = Math.floor(local * 14); const r = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1; if (r > 0.55) { dx += (r - 0.75) * 6 * k; filters.push(`hue-rotate(${Math.round(r * 160)}deg) saturate(${1 + k})`); } break; }
      case 'vignette': vignette = Math.max(vignette, k); break;
      case 'darken': darken = Math.max(darken, k * 0.85); break;
      case 'letterbox': letterbox = Math.max(letterbox, k * 12 * Math.min(1, local / 0.4)); break;
      case 'strobe': flash = Math.max(flash, Math.floor(local * 8) % 2 ? 0 : 0.7 * k); break;
      case 'punch': filters.push(`contrast(${1 + 0.4 * k}) saturate(${1 + 0.5 * k})`); break;
      case 'dreamy': filters.push(`blur(${(k * 2).toFixed(2)}px) brightness(${1 + 0.15 * k}) saturate(${1 + 0.25 * k})`); break;
      case 'push': scale *= 1 + Math.min(1, local / Math.max(0.5, l.duration)) * 0.15 * k; break;
      case 'warm': filters.push(`sepia(${0.35 * k}) saturate(${1 + 0.3 * k}) hue-rotate(${-10 * k}deg)`); break;
      case 'cool': filters.push(`saturate(${1 + 0.2 * k}) hue-rotate(${20 * k}deg)`); break;
      case 'zoomblur': { const q = Math.max(0, 1 - local / 0.6); scale *= 1 + q * 0.25 * k; filters.push(`blur(${(q * 6 * k).toFixed(2)}px)`); break; }
      case 'heartbeat': { const ph = (local * 1.2) % 1; scale *= 1 + (ph < 0.12 ? Math.sin(ph / 0.12 * Math.PI) : ph > 0.2 && ph < 0.32 ? Math.sin((ph - 0.2) / 0.12 * Math.PI) * 0.6 : 0) * 0.08 * k; break; }
      case 'vhs': { dx += Math.sin(local * 90) * 0.35 * k; filters.push(`saturate(${1 + 0.6 * k}) contrast(${1 + 0.15 * k}) hue-rotate(${Math.round(Math.sin(local * 3) * 12 * k)}deg) blur(${(0.6 * k).toFixed(2)}px)`); break; }
      case 'film': filters.push(`sepia(${0.25 * k}) contrast(${1 + 0.1 * k}) brightness(${1 - 0.05 * k + Math.sin(local * 40) * 0.03 * k})`); vignette = Math.max(vignette, 0.5 * k); break;
      case 'bloom': filters.push(`brightness(${1 + 0.25 * k}) saturate(${1 + 0.2 * k}) contrast(${1 - 0.1 * k})`); break;
      case 'fadein': darken = Math.max(darken, k * Math.max(0, 1 - local / Math.max(0.2, l.duration))); break;
      case 'fadeout': darken = Math.max(darken, k * Math.min(1, local / Math.max(0.2, l.duration))); break;
      case 'bounce': dy += -Math.abs(Math.sin(local * Math.PI * 2)) * 3 * k; break;
      case 'cyber': filters.push(`hue-rotate(${Math.round(200 * k)}deg) saturate(${1 + 0.8 * k}) contrast(${1 + 0.2 * k})`); break;
      case 'golden': filters.push(`sepia(${0.4 * k}) saturate(${1 + 0.5 * k}) brightness(${1 + 0.08 * k}) hue-rotate(${-15 * k}deg)`); break;
      case 'noir': filters.push(`grayscale(${k}) contrast(${1 + 0.6 * k}) brightness(${1 - 0.1 * k})`); vignette = Math.max(vignette, 0.6 * k); break;
      case 'overexpose': filters.push(`brightness(${1 + 0.6 * k * (0.6 + 0.4 * Math.sin(local * 6))}) contrast(${1 - 0.2 * k})`); break;
      case 'retro': filters.push(`sepia(${0.5 * k}) hue-rotate(${-20 * k}deg) saturate(${1 + 0.4 * k}) contrast(${1 - 0.1 * k})`); break;
      case 'swing': dx += Math.sin(local * Math.PI * 1.5) * 2.5 * k; break;
      case 'blackflash': darken = Math.max(darken, Math.floor(local * 6) % 2 ? 0.9 * k : 0); break;
      case 'dolly': scale *= 1 + (Math.sin(local * 2) * 0.5 + 0.5) * 0.2 * k; filters.push(`blur(${(Math.abs(Math.cos(local * 2)) * 0.8 * k).toFixed(2)}px)`); break;
      case 'hazy': filters.push(`contrast(${1 - 0.3 * k}) brightness(${1 + 0.15 * k}) saturate(${1 - 0.3 * k}) blur(${(0.8 * k).toFixed(2)}px)`); break;
      case 'chrome': filters.push(`saturate(${1 + 1.2 * k}) contrast(${1 + 0.35 * k})`); break;
      case 'rgb': { const s = Math.sin(local * 30); dx += s * 0.6 * k; filters.push(`saturate(${1 + 0.8 * k}) hue-rotate(${Math.round(s * 25 * k)}deg)`); break; }
    }
  });
  return { filter: filters.join(' '), dx, dy, scale, flash, vignette, darken, letterbox };
}

// Animation in/out for visual layers.
export function layerAnim(l: LayerBase, t: number, textLength = 0) {
  const local = t - l.start; const left = l.start + l.duration - t; const d = Math.min(0.5, l.duration / 3);
  let opacity = 1; let scale = 1; let dy = 0; let chars = textLength;
  if (local < d && l.animIn !== 'none') {
    const p = easeOut(local / d);
    if (l.animIn === 'fade') opacity = p;
    if (l.animIn === 'pop') { scale = 0.4 + 0.6 * backOut(local / d); opacity = Math.min(1, p * 2); }
    if (l.animIn === 'slide') { dy = (1 - p) * 12; opacity = p; }
    if (l.animIn === 'zoom') { scale = 1.8 - 0.8 * p; opacity = p; }
  }
  if (l.animIn === 'typewriter') chars = Math.floor(clamp(local / Math.min(l.duration * 0.6, Math.max(0.6, textLength * 0.06)), 0, 1) * textLength);
  if (left < d && l.animOut !== 'none') {
    const p = easeOut(clamp(left / d, 0, 1));
    if (l.animOut === 'fade') opacity *= p;
    if (l.animOut === 'pop') { scale *= 0.4 + 0.6 * p; opacity *= p; }
    if (l.animOut === 'slide') { dy -= (1 - p) * 12; opacity *= p; }
    if (l.animOut === 'zoom') { scale *= 1 + (1 - p) * 0.8; opacity *= p; }
  }
  return { opacity: opacity * l.opacity, scale, dy, chars };
}
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
const backOut = (p: number) => { const c = 1.70158; const x = clamp(p, 0, 1) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

export function motionTransform(m: Motion, p: number) {
  const q = clamp(p, 0, 1);
  if (m === 'zoom-in') return { scale: 1 + 0.18 * q, tx: 0 };
  if (m === 'zoom-out') return { scale: 1.18 - 0.18 * q, tx: 0 };
  if (m === 'pan-left') return { scale: 1.15, tx: 6 - 12 * q };
  if (m === 'pan-right') return { scale: 1.15, tx: -6 + 12 * q };
  return { scale: 1, tx: 0 };
}

// Transition progress → visual state for outgoing (a) and incoming (b) frames. tx/ty in % of frame.
export type FrameFx = { opacity: number; tx: number; ty: number; scale: number; rotate: number; clipRight: number };
const idle = (): FrameFx => ({ opacity: 1, tx: 0, ty: 0, scale: 1, rotate: 0, clipRight: 0 });
export function transitionFx(type: TransitionType, p: number): { a: FrameFx; b: FrameFx } {
  const a = idle(); const b = idle(); const q = easeInOut(p);
  switch (type) {
    case 'fade': a.opacity = Math.max(0, 1 - q * 2); b.opacity = Math.max(0, q * 2 - 1); break;
    case 'dissolve': b.opacity = q; break;
    case 'slide': b.tx = (1 - q) * 100; break;
    case 'push': a.tx = -q * 100; b.tx = (1 - q) * 100; break;
    case 'zoom': b.scale = 0.4 + 0.6 * q; b.opacity = q; a.scale = 1 + q * 0.3; break;
    case 'wipe': b.clipRight = (1 - q) * 100; break;
    case 'spin': b.rotate = (1 - q) * -120; b.scale = q; b.opacity = Math.min(1, q * 1.5); break;
    default: break;
  }
  return { a, b };
}
const easeInOut = (p: number) => { const x = clamp(p, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const TRANSITIONS: { id: TransitionType; name: string }[] = [
  { id: 'none', name: 'None' }, { id: 'fade', name: 'Fade to black' }, { id: 'dissolve', name: 'Dissolve' }, { id: 'slide', name: 'Slide' },
  { id: 'push', name: 'Push' }, { id: 'zoom', name: 'Zoom' }, { id: 'wipe', name: 'Wipe' }, { id: 'spin', name: 'Spin' },
];

export const FONTS = [
  { id: 'Manrope', name: 'Modern', weight: 800 }, { id: 'Bebas Neue', name: 'Bebas', weight: 400 }, { id: 'Anton', name: 'Anton', weight: 400 },
  { id: 'Playfair Display', name: 'Playfair', weight: 800 }, { id: 'Permanent Marker', name: 'Marker', weight: 400 }, { id: 'Pacifico', name: 'Script', weight: 400 },
  { id: 'Space Mono', name: 'Mono', weight: 700 }, { id: 'Righteous', name: 'Retro', weight: 400 },
  { id: 'Montserrat', name: 'Montserrat', weight: 800 }, { id: 'Oswald', name: 'Oswald', weight: 700 }, { id: 'Poppins', name: 'Poppins', weight: 800 },
  { id: 'Archivo Black', name: 'Archivo', weight: 400 }, { id: 'Black Ops One', name: 'Black Ops', weight: 400 }, { id: 'Bangers', name: 'Bangers', weight: 400 },
  { id: 'Lobster', name: 'Lobster', weight: 400 }, { id: 'Dancing Script', name: 'Dancing', weight: 700 }, { id: 'Great Vibes', name: 'Vibes', weight: 400 },
  { id: 'Satisfy', name: 'Satisfy', weight: 400 }, { id: 'Caveat', name: 'Caveat', weight: 700 }, { id: 'Shadows Into Light', name: 'Handwrite', weight: 400 },
  { id: 'Orbitron', name: 'Orbitron', weight: 800 }, { id: 'Audiowide', name: 'Audiowide', weight: 400 }, { id: 'Monoton', name: 'Monoton', weight: 400 },
  { id: 'Press Start 2P', name: 'Pixel', weight: 400 }, { id: 'Bungee', name: 'Bungee', weight: 400 }, { id: 'Russo One', name: 'Russo', weight: 400 },
  { id: 'Teko', name: 'Teko', weight: 700 }, { id: 'Staatliches', name: 'Staatliches', weight: 400 }, { id: 'Alfa Slab One', name: 'Slab', weight: 400 },
  { id: 'Abril Fatface', name: 'Fatface', weight: 400 }, { id: 'Cinzel', name: 'Cinzel', weight: 800 }, { id: 'Cormorant Garamond', name: 'Garamond', weight: 700 },
  { id: 'Rubik Mono One', name: 'Rubik Mono', weight: 400 }, { id: 'Syne', name: 'Syne', weight: 800 }, { id: 'Unbounded', name: 'Unbounded', weight: 800 },
  { id: 'Kanit', name: 'Kanit', weight: 800 }, { id: 'Fredoka', name: 'Fredoka', weight: 700 }, { id: 'Creepster', name: 'Creepster', weight: 400 },
];
export const fontWeight = (font: string, bold: boolean) => (FONTS.find(f => f.id === font)?.weight ?? 700) >= 700 ? (bold ? 800 : 600) : 400;
export const TEXT_STYLES: { id: TextStyle; name: string }[] = [
  { id: 'plain', name: 'Plain' }, { id: 'glow', name: 'Glow' }, { id: 'neon', name: 'Neon' }, { id: 'outline', name: 'Outline' },
  { id: 'neon-outline', name: 'Outline glow' }, { id: 'shadow', name: 'Shadow' }, { id: 'gradient', name: 'Gradient' }, { id: 'box', name: 'Label' }, { id: 'stroke', name: 'Stroke' }, { id: 'extrude', name: '3D' },
];
export const SWATCHES = ['#ffffff', '#111111', '#ffd60a', '#ff3b30', '#ff2d92', '#bf5af2', '#0a84ff', '#30d5ff', '#32d74b', '#ff9f0a'];
export const STICKERS = ['🔥', '✨', '❤️', '😂', '😍', '👀', '💯', '⭐', '🎉', '👑', '💥', '⚡', '🌈', '☀️', '🌙', '🎵', '📍', '✅', '👉', '🙌', '😎', '🤯', '🥳', '💀'];

export const TEXT_PRESETS: { name: string; patch: Partial<TextLayer> }[] = [
  { name: 'Cinematic Blue', patch: { text: 'THE NEXT CHAPTER', font: 'Bebas Neue', style: 'neon-outline', color: '#30d5ff', accent: '#30d5ff', size: 12, y: 72, animIn: 'none', animOut: 'none' } },
  { name: 'Ember Outline', patch: { text: 'MEMES ABOUT ME?', font: 'Anton', style: 'neon-outline', color: '#ff9f0a', accent: '#ff3b30', size: 10, y: 65, animIn: 'none', animOut: 'none' } },
  { name: 'Clean Caption', patch: { text: 'WHAT ARE YOU?', font: 'Manrope', style: 'glow', color: '#ffffff', accent: '#ff9f0a', size: 7, y: 58, glow: 35, animIn: 'none', animOut: 'none' } },
  { name: 'Hero Stroke', patch: { text: 'LEGENDARY', font: 'Anton', style: 'stroke', color: '#ffffff', accent: '#111111', outline: 8, size: 12, animIn: 'pop' } },
  { name: '3D Title', patch: { text: 'NEXT LEVEL', font: 'Bebas Neue', style: 'extrude', color: '#ffd60a', accent: '#ff3b30', size: 13, animIn: 'zoom' } },
  { name: 'Wide Cinema', patch: { text: 'A FILM BY YOU', font: 'Manrope', style: 'glow', color: '#ffffff', accent: '#ffffff', glow: 25, spacing: 40, size: 5, animIn: 'fade' } },
  { name: 'Neon Glow', patch: { text: 'NEON', font: 'Righteous', style: 'neon', color: '#ffffff', accent: '#ff2d92', animIn: 'fade' } },
  { name: 'Bold Title', patch: { text: 'BIG MOMENT', font: 'Anton', style: 'shadow', color: '#ffffff', accent: '#000000', animIn: 'pop' } },
  { name: 'Golden Glow', patch: { text: 'Golden hour', font: 'Playfair Display', style: 'glow', color: '#fff4d6', accent: '#ffb000', animIn: 'zoom' } },
  { name: 'Outline Pop', patch: { text: 'OUTLINE', font: 'Bebas Neue', style: 'outline', color: '#ffd60a', accent: '#ffd60a', animIn: 'pop' } },
  { name: 'Gradient', patch: { text: 'Vibes', font: 'Pacifico', style: 'gradient', color: '#30d5ff', accent: '#bf5af2', animIn: 'slide' } },
  { name: 'Label', patch: { text: 'SUBSCRIBE', font: 'Manrope', style: 'box', color: '#111111', accent: '#ffd60a', animIn: 'slide' } },
  { name: 'Typewriter', patch: { text: 'once upon a time…', font: 'Space Mono', style: 'plain', color: '#ffffff', accent: '#000000', animIn: 'typewriter' } },
  { name: 'Marker', patch: { text: 'wow!!', font: 'Permanent Marker', style: 'glow', color: '#32d74b', accent: '#32d74b', animIn: 'pop' } },
  { name: 'Red Alert', patch: { text: 'WAIT FOR IT', font: 'Bebas Neue', style: 'neon-outline', color: '#ff3b30', accent: '#ff3b30', size: 12, animIn: 'zoom' } },
  { name: 'Purple Haze', patch: { text: 'MIDNIGHT', font: 'Orbitron', style: 'neon', color: '#ffffff', accent: '#bf5af2', size: 10, animIn: 'fade' } },
  { name: 'Comic Pop', patch: { text: 'BOOM!', font: 'Bangers', style: 'stroke', color: '#ffd60a', accent: '#111111', outline: 7, size: 16, animIn: 'pop' } },
  { name: 'Retro Arcade', patch: { text: 'GAME OVER', font: 'Press Start 2P', style: 'extrude', color: '#30d5ff', accent: '#ff2d92', size: 6, animIn: 'typewriter' } },
  { name: 'Wedding', patch: { text: 'Forever', font: 'Great Vibes', style: 'glow', color: '#fff4d6', accent: '#ffd60a', glow: 50, size: 14, animIn: 'fade' } },
  { name: 'Luxury', patch: { text: 'COLLECTION', font: 'Cinzel', style: 'plain', color: '#ffd60a', accent: '#000000', spacing: 30, size: 6, animIn: 'fade' } },
  { name: 'Vlog Title', patch: { text: 'day in my life', font: 'Caveat', style: 'shadow', color: '#ffffff', accent: '#000000', size: 11, animIn: 'slide' } },
  { name: 'Sport Hype', patch: { text: 'GAME DAY', font: 'Teko', style: 'stroke', color: '#ffffff', accent: '#ff3b30', outline: 6, size: 15, animIn: 'zoom', italic: true } },
  { name: 'Horror', patch: { text: 'DON\'T LOOK', font: 'Creepster', style: 'glow', color: '#ff3b30', accent: '#000000', size: 13, animIn: 'fade' } },
  { name: 'Minimal', patch: { text: 'less is more', font: 'Syne', style: 'plain', color: '#ffffff', accent: '#000000', spacing: 10, size: 6, animIn: 'fade' } },
  { name: 'Subtitle', patch: { text: 'and that\'s when it happened…', font: 'Poppins', style: 'shadow', color: '#ffffff', accent: '#000000', size: 5, y: 85, animIn: 'none', animOut: 'none' } },
  { name: 'Yellow Caption', patch: { text: 'NO WAY', font: 'Montserrat', style: 'stroke', color: '#ffd60a', accent: '#000000', outline: 6, size: 9, y: 78, animIn: 'pop' } },
  { name: 'Neon Sign', patch: { text: 'OPEN', font: 'Monoton', style: 'neon', color: '#ffffff', accent: '#30d5ff', size: 14, animIn: 'fade' } },
  { name: 'Cyber Glow', patch: { text: 'SYSTEM ONLINE', font: 'Audiowide', style: 'neon-outline', color: '#32d74b', accent: '#32d74b', size: 8, animIn: 'typewriter' } },
  { name: 'Chunky 3D', patch: { text: 'EPIC', font: 'Bungee', style: 'extrude', color: '#ffffff', accent: '#0a84ff', size: 15, animIn: 'pop' } },
  { name: 'Magazine', patch: { text: 'Vogue Mood', font: 'Abril Fatface', style: 'plain', color: '#ffffff', accent: '#000000', size: 12, animIn: 'slide' } },
  { name: 'Pink Label', patch: { text: 'NEW VIDEO', font: 'Archivo Black', style: 'box', color: '#ffffff', accent: '#ff2d92', size: 7, animIn: 'slide' } },
  { name: 'Ice Outline', patch: { text: 'FROZEN', font: 'Staatliches', style: 'outline', color: '#30d5ff', accent: '#30d5ff', size: 14, animIn: 'zoom' } },
  { name: 'Sunset Gradient', patch: { text: 'Summer', font: 'Lobster', style: 'gradient', color: '#ffd60a', accent: '#ff2d92', size: 14, animIn: 'pop' } },
  { name: 'Fire', patch: { text: 'ON FIRE', font: 'Russo One', style: 'glow', color: '#ffd60a', accent: '#ff3b30', glow: 140, size: 11, animIn: 'zoom' } },
  { name: 'Handwritten', patch: { text: 'thank you', font: 'Dancing Script', style: 'plain', color: '#ffffff', accent: '#000000', size: 11, animIn: 'typewriter' } },
  { name: 'Bold Box Dark', patch: { text: 'CHAPTER 1', font: 'Oswald', style: 'box', color: '#ffffff', accent: '#111111', spacing: 15, size: 6, animIn: 'fade' } },
  { name: 'Rounded Cute', patch: { text: 'so cute!', font: 'Fredoka', style: 'stroke', color: '#ffffff', accent: '#ff2d92', outline: 6, size: 11, animIn: 'pop' } },
  { name: 'Massive', patch: { text: 'HUGE', font: 'Unbounded', style: 'shadow', color: '#ffffff', accent: '#000000', size: 20, animIn: 'zoom' } },
];

export function makeText(start: number, patch: Partial<TextLayer> = {}): TextLayer {
  return { id: uid('text'), type: 'text', start, duration: 4, x: 50, y: 50, rotation: 0, opacity: 1, animIn: 'fade', animOut: 'fade', text: 'Your text', font: 'Manrope', size: 11, color: '#ffffff', accent: '#ff2d92', style: 'plain', bold: true, align: 'center', ...patch };
}
export function makeClip(asset: MediaAsset, imageDuration: number): Clip {
  return { id: uid('clip'), mediaId: asset.id, kind: asset.kind === 'video' ? 'video' : 'image', in: 0, out: asset.kind === 'video' ? asset.duration : imageDuration, speed: 1, volume: 100, muted: false, filter: 'none', adjust: neutralAdjust(), rotate: 0, flipH: false, flipV: false, motion: 'none', transition: { type: 'none', duration: 0.6 } };
}

export const formatClock = (s: number) => {
  const v = Math.max(0, s); const h = Math.floor(v / 3600); const m = Math.floor((v % 3600) / 60); const sec = Math.floor(v % 60); const ms = Math.floor((v % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};
export const formatShort = (s: number) => { const v = Math.max(0, s); return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`; };
export const layerLabel = (l: Layer, media: Record<string, MediaAsset>) => l.type === 'text' ? l.text : l.type === 'sticker' ? l.emoji : l.type === 'effect' ? `Effect - ${effectName(l.effect)}`  : l.type === 'audio' ? l.name : media[l.mediaId]?.name ?? 'Media';
