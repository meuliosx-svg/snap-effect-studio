// Canvas renderer used for export and frame capture. Mirrors the on-screen preview.
import { aspectValue, clipAt, effectState, effectiveTransition, fontWeight, isActive, layerAnim, lookCss, motionTransform, placeClips, temperatureTint, transitionFx, type Clip, type FrameFx, type MediaLayer, type PlacedClip, type Project, type TextLayer } from './model';

export type SourceGetter = (key: string) => CanvasImageSource | null;
const idleFx: FrameFx = { opacity: 1, tx: 0, ty: 0, scale: 1, rotate: 0, clipRight: 0 };

export function frameSize(p: Project, resolution: number) {
  const a = aspectValue(p.aspect);
  const w = a >= 1 ? Math.round(resolution * a) : resolution; const h = a >= 1 ? resolution : Math.round(resolution / a);
  return { width: w - (w % 2), height: h - (h % 2) };
}

function drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
  if (k <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, k)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawClip(ctx: CanvasRenderingContext2D, p: Project, placed: PlacedClip, t: number, fx: FrameFx, effectFilter: string, get: SourceGetter, W: number, H: number) {
  const clip: Clip = placed.clip; const asset = p.media[clip.mediaId]; const el = get(clip.kind === 'video' ? clip.id : clip.mediaId);
  if (!asset || !el || fx.opacity <= 0) return;
  const rotated = Math.abs(clip.rotate % 180) === 90;
  const aw = rotated ? asset.height : asset.width; const ah = rotated ? asset.width : asset.height;
  const s = Math.min(W / aw, H / ah); const dw = asset.width * s; const dh = asset.height * s;
  const m = motionTransform(clip.motion, (t - placed.start) / Math.max(0.1, placed.end - placed.start));
  ctx.save(); ctx.globalAlpha = fx.opacity;
  if (fx.clipRight > 0) { ctx.beginPath(); ctx.rect(0, 0, W * (1 - fx.clipRight / 100), H); ctx.clip(); }
  ctx.translate(W / 2 + (fx.tx / 100) * W, H / 2 + (fx.ty / 100) * H);
  ctx.rotate(((fx.rotate + clip.rotate) * Math.PI) / 180);
  ctx.scale(fx.scale * m.scale * (clip.flipH ? -1 : 1), fx.scale * m.scale * (clip.flipV ? -1 : 1));
  ctx.translate((m.tx / 100) * W, 0);
  ctx.filter = lookCss(clip.filter, clip.adjust, effectFilter);
  ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = 'none';
  const tint = temperatureTint(clip.adjust.temperature);
  if (tint) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = tint.replace(/[\d.]+\)$/, v => `${Math.min(1, parseFloat(v) * 3)})`); ctx.fillRect(-dw / 2, -dh / 2, dw, dh); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  if (clip.adjust.vignette > 0) { ctx.save(); ctx.globalAlpha = fx.opacity; drawVignette(ctx, W, H, clip.adjust.vignette / 100); ctx.restore(); }
}

function drawMedia(ctx: CanvasRenderingContext2D, p: Project, l: MediaLayer, t: number, effectFilter: string, get: SourceGetter, W: number, H: number) {
  const asset = p.media[l.mediaId]; const el = get(l.kind === 'video' ? l.id : l.mediaId);
  if (!asset || !el) return;
  const a = layerAnim(l, t); const dw = (l.width / 100) * W; const dh = dw * (asset.height / Math.max(1, asset.width));
  ctx.save(); ctx.globalAlpha = a.opacity; ctx.translate((l.x / 100) * W, (l.y / 100) * H + (a.dy / 100) * H); ctx.rotate((l.rotation * Math.PI) / 180); ctx.scale(a.scale, a.scale);
  ctx.filter = lookCss(l.filter, l.adjust, effectFilter); ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh); ctx.filter = 'none'; ctx.restore();
}

export function drawText(ctx: CanvasRenderingContext2D, l: TextLayer, t: number, W: number, H: number) {
  const a = layerAnim(l, t, l.text.length); if (a.opacity <= 0) return;
  const fs = (l.size / 100) * H; const lineH = fs * 1.15;
  let remaining = a.chars; const lines = l.text.split('\n').map(line => { const part = line.slice(0, Math.max(0, remaining)); remaining -= line.length + 1; return part; });
  ctx.save(); ctx.globalAlpha = a.opacity;
  ctx.translate((l.x / 100) * W, (l.y / 100) * H + (a.dy / 100) * H); ctx.rotate((l.rotation * Math.PI) / 180); ctx.scale(a.scale, a.scale);
  ctx.font = `${fontWeight(l.font, l.bold)} ${fs}px "${l.font}"`; ctx.textBaseline = 'middle'; ctx.textAlign = l.align;
  const full = l.text.split('\n'); const widths = full.map(line => ctx.measureText(line).width); const maxW = Math.max(1, ...widths);
  const top = -((full.length - 1) * lineH) / 2; const ax = l.align === 'left' ? -maxW / 2 : l.align === 'right' ? maxW / 2 : 0;
  if (l.style === 'box') { const pad = fs * 0.3; ctx.fillStyle = l.accent; roundRect(ctx, -maxW / 2 - pad, top - lineH / 2 - pad * 0.5, maxW + pad * 2, full.length * lineH + pad, fs * 0.18); ctx.fill(); }
  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (l.style === 'outline') { ctx.lineWidth = fs * 0.06; ctx.strokeStyle = l.color; ctx.lineJoin = 'round'; ctx.strokeText(line, ax, y); return; }
    if (l.style === 'gradient') { const g = ctx.createLinearGradient(0, y - fs / 2, 0, y + fs / 2); g.addColorStop(0, l.color); g.addColorStop(1, l.accent); ctx.fillStyle = g; ctx.fillText(line, ax, y); return; }
    ctx.fillStyle = l.color;
    if (l.style === 'glow') { ctx.shadowColor = l.accent; ctx.shadowBlur = fs * 0.35; ctx.fillText(line, ax, y); ctx.shadowBlur = fs * 0.12; }
    if (l.style === 'neon') { ctx.shadowColor = l.accent; [0.9, 0.45, 0.15].forEach(b => { ctx.shadowBlur = fs * b; ctx.fillText(line, ax, y); }); }
    if (l.style === 'shadow') { ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowOffsetY = fs * 0.06; ctx.shadowBlur = fs * 0.14; }
    ctx.fillText(line, ax, y); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawFrame(ctx: CanvasRenderingContext2D, p: Project, t: number, get: SourceGetter, W: number, H: number) {
  ctx.save(); ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H);
  const fx = effectState(p.layers, t);
  ctx.save(); ctx.translate(W / 2 + (fx.dx / 100) * W, H / 2 + (fx.dy / 100) * H); ctx.scale(fx.scale, fx.scale); ctx.translate(-W / 2, -H / 2);
  const placed = placeClips(p.clips); const cur = clipAt(placed, t);
  if (cur) {
    const tr = effectiveTransition(placed, cur.index); const local = t - cur.start; const prev = placed[cur.index - 1];
    if (tr && prev && local < tr.duration) { const { a, b } = transitionFx(tr.type, local / tr.duration); drawClip(ctx, p, prev, prev.end, a, fx.filter, get, W, H); drawClip(ctx, p, cur, t, b, fx.filter, get, W, H); }
    else drawClip(ctx, p, cur, t, idleFx, fx.filter, get, W, H);
  }
  p.layers.forEach(l => { if (l.type === 'media' && isActive(l, t)) drawMedia(ctx, p, l, t, fx.filter, get, W, H); });
  ctx.restore();
  if (fx.vignette) drawVignette(ctx, W, H, fx.vignette);
  if (fx.darken) { ctx.fillStyle = `rgba(0,0,0,${fx.darken})`; ctx.fillRect(0, 0, W, H); }
  p.layers.forEach(l => {
    if (!isActive(l, t)) return;
    if (l.type === 'text') drawText(ctx, l, t, W, H);
    if (l.type === 'sticker') { const a = layerAnim(l, t); ctx.save(); ctx.globalAlpha = a.opacity; ctx.translate((l.x / 100) * W, (l.y / 100) * H + (a.dy / 100) * H); ctx.rotate((l.rotation * Math.PI) / 180); ctx.scale(a.scale, a.scale); ctx.font = `${(l.size / 100) * H}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.emoji, 0, 0); ctx.restore(); }
  });
  if (fx.flash) { ctx.fillStyle = `rgba(255,255,255,${fx.flash})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}
