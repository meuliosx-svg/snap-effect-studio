// Real-time export: plays the timeline into a canvas + mixed audio and records it with MediaRecorder.
import { placeClips, projectDuration, clamp, type Project } from './model';
import { mediaUrl } from './storage';
import { drawFrame, frameSize } from './render';

type Slot = { el: HTMLVideoElement | HTMLAudioElement; start: number; end: number; in: number; rate: number; volume: number; muted: boolean; fadeIn: number; fadeOut: number; gain?: GainNode };

function buildSources(p: Project) {
  const images = new Map<string, HTMLImageElement>(); const slots = new Map<string, Slot>();
  const make = (kind: 'video' | 'audio', src: string) => { const el = document.createElement(kind); el.src = src; el.preload = 'auto'; if (el instanceof HTMLVideoElement) el.playsInline = true; el.crossOrigin = 'anonymous'; return el; };
  placeClips(p.clips).forEach(({ clip, start, end }) => {
    if (clip.kind === 'image') { if (!images.has(clip.mediaId)) { const img = new Image(); img.src = mediaUrl(clip.mediaId); images.set(clip.mediaId, img); } return; }
    slots.set(clip.id, { el: make('video', mediaUrl(clip.mediaId)), start, end, in: clip.in, rate: clip.speed, volume: clip.volume, muted: clip.muted, fadeIn: 0, fadeOut: 0 });
  });
  p.layers.forEach(l => {
    if (l.type === 'media') {
      if (l.kind === 'image') { if (!images.has(l.mediaId)) { const img = new Image(); img.src = mediaUrl(l.mediaId); images.set(l.mediaId, img); } }
      else slots.set(l.id, { el: make('video', mediaUrl(l.mediaId)), start: l.start, end: l.start + l.duration, in: l.in, rate: 1, volume: l.volume, muted: l.muted, fadeIn: 0, fadeOut: 0 });
    }
    if (l.type === 'audio') slots.set(l.id, { el: make('audio', mediaUrl(l.mediaId)), start: l.start, end: l.start + l.duration, in: l.in, rate: 1, volume: l.volume, muted: l.muted, fadeIn: l.fadeIn, fadeOut: l.fadeOut });
  });
  const get = (key: string): CanvasImageSource | null => {
    const img = images.get(key); if (img) return img.complete && img.naturalWidth ? img : null;
    const slot = slots.get(key); if (slot && slot.el instanceof HTMLVideoElement && slot.el.readyState >= 2) return slot.el;
    return null;
  };
  const ready = async () => {
    await Promise.all([...images.values()].map(img => img.decode().catch(() => undefined)));
    await Promise.all([...slots.values()].map(s => new Promise<void>(resolve => {
      const el = s.el; const done = () => resolve(); const timer = setTimeout(done, 8000);
      const seek = () => { el.currentTime = s.in; el.addEventListener('seeked', () => { clearTimeout(timer); done(); }, { once: true }); };
      if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true });
      el.addEventListener('error', () => { clearTimeout(timer); done(); }, { once: true });
    })));
  };
  const seekAll = async (t: number) => {
    await Promise.all([...slots.values()].map(s => new Promise<void>(resolve => {
      if (!(s.el instanceof HTMLVideoElement)) return resolve();
      const target = clamp(s.in + (t - s.start) * s.rate, s.in, s.in + (s.end - s.start) * s.rate - 0.03);
      if (Math.abs(s.el.currentTime - target) < 0.02) return resolve();
      const timer = setTimeout(resolve, 3000); s.el.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true }); s.el.currentTime = target;
    })));
  };
  const dispose = () => slots.forEach(s => { s.el.pause(); s.el.removeAttribute('src'); s.el.load(); });
  return { get, slots, ready, seekAll, dispose };
}

export async function captureFrame(p: Project, t: number) {
  const { width, height } = frameSize(p, 1080); const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  const src = buildSources(p); await document.fonts.ready; await src.ready(); await src.seekAll(t);
  drawFrame(ctx, p, t, src.get, width, height); src.dispose();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Capture failed')), 'image/png'));
}

export function exportSupport() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) return null;
  return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

export async function exportProject(p: Project, opts: { resolution: number; fps: number; onProgress: (pct: number) => void; signal: AbortSignal }) {
  const support = exportSupport(); if (!support) throw new Error('Video export needs a recent Chrome, Edge, Firefox or Safari.');
  const total = projectDuration(p); if (total <= 0) throw new Error('Add something to the timeline first.');
  const { width, height } = frameSize(p, opts.resolution);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const src = buildSources(p); await document.fonts.ready; await src.ready();
  const stream = canvas.captureStream(opts.fps);
  let audioCtx: AudioContext | null = null;
  if (src.slots.size) {
    try {
      audioCtx = new AudioContext(); const dest = audioCtx.createMediaStreamDestination();
      src.slots.forEach(s => { const node = audioCtx!.createMediaElementSource(s.el); const gain = audioCtx!.createGain(); gain.gain.value = 0; node.connect(gain).connect(dest); s.gain = gain; });
      dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      await audioCtx.resume();
    } catch { audioCtx = null; }
  }
  const recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: opts.resolution >= 1080 ? 12_000_000 : 6_000_000 });
  const chunks: BlobPart[] = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise<Blob>((resolve, reject) => { recorder.onstop = () => opts.signal.aborted ? reject(new Error('Export cancelled')) : resolve(new Blob(chunks, { type: support.mime.split(';')[0] })); recorder.onerror = () => reject(new Error('Recording failed')); });
  let raf = 0; let timer = 0; const started = performance.now();
  const tick = () => {
    const t = Math.min(total, (performance.now() - started) / 1000);
    src.slots.forEach(s => {
      const active = t >= s.start && t < s.end;
      if (active) {
        const target = s.in + (t - s.start) * s.rate; s.el.playbackRate = s.rate;
        if (Math.abs(s.el.currentTime - target) > 0.3) s.el.currentTime = target;
        if (s.el.paused) void s.el.play().catch(() => undefined);
        let v = s.muted ? 0 : s.volume / 100; const local = t - s.start; const left = s.end - t;
        if (s.fadeIn > 0) v *= clamp(local / s.fadeIn, 0, 1); if (s.fadeOut > 0) v *= clamp(left / s.fadeOut, 0, 1);
        if (s.gain) s.gain.gain.value = v;
      } else { if (!s.el.paused) s.el.pause(); if (s.gain) s.gain.gain.value = 0; }
    });
    drawFrame(ctx, p, t, src.get, width, height);
    opts.onProgress(Math.round((t / total) * 100));
    if (t >= total || opts.signal.aborted) { recorder.stop(); return; }
    if (document.hidden) timer = window.setTimeout(tick, 1000 / opts.fps); else raf = requestAnimationFrame(tick);
  };
  recorder.start(250); tick();
  try { return { blob: await finished, ext: support.ext }; }
  finally { cancelAnimationFrame(raf); clearTimeout(timer); stream.getTracks().forEach(tr => tr.stop()); src.dispose(); void audioCtx?.close(); }
}
