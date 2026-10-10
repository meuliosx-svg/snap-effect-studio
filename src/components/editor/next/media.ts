import { uid, type MediaAsset } from './model';
import { putBlob, registerUrl } from './storage';

const once = (el: HTMLMediaElement, ok: string, timeout = 15000) => new Promise<void>((resolve, reject) => {
  const done = () => { clear(); resolve(); }; const fail = () => { clear(); reject(new Error('load')); };
  const timer = setTimeout(fail, timeout);
  const clear = () => { clearTimeout(timer); el.removeEventListener(ok, done); el.removeEventListener('error', fail); };
  el.addEventListener(ok, done); el.addEventListener('error', fail);
});

async function videoThumbs(url: string, duration: number, width: number, height: number) {
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  const thumbs: string[] = [];
  try {
    await once(video, 'loadeddata');
    const h = 90; const w = Math.round(h * (width / Math.max(1, height))) || 160;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d');
    if (!ctx) return thumbs;
    const count = Math.min(10, Math.max(3, Math.ceil(duration / 3)));
    for (let i = 0; i < count; i++) {
      video.currentTime = Math.min(duration - 0.05, (duration * (i + 0.5)) / count);
      await once(video, 'seeked', 5000);
      ctx.drawImage(video, 0, 0, w, h); thumbs.push(canvas.toDataURL('image/jpeg', 0.6));
    }
  } catch { /* thumbnails are optional */ }
  video.removeAttribute('src'); video.load();
  return thumbs;
}
async function imageThumb(url: string) {
  const img = new Image(); img.src = url; await img.decode();
  const h = 90; const w = Math.round(h * img.naturalWidth / Math.max(1, img.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
  return { thumb: canvas.toDataURL('image/jpeg', 0.7), width: img.naturalWidth, height: img.naturalHeight };
}
async function audioPeaks(blob: Blob) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const buffer = await ctx.decodeAudioData(await blob.arrayBuffer()); void ctx.close();
    const data = buffer.getChannelData(0); const bins = Math.min(600, Math.max(60, Math.round(buffer.duration * 8))); const size = Math.floor(data.length / bins); const peaks: number[] = [];
    for (let i = 0; i < bins; i++) { let max = 0; for (let j = i * size; j < (i + 1) * size; j += 16) max = Math.max(max, Math.abs(data[j] ?? 0)); peaks.push(Math.round(max * 100) / 100); }
    return peaks;
  } catch { return undefined; }
}

export async function importFile(file: Blob & { name?: string }, nameOverride?: string): Promise<MediaAsset> {
  const type = file.type; const name = nameOverride ?? file.name ?? 'Media';
  const kind = type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : null;
  if (!kind) throw new Error(`${name}: this file type is not supported.`);
  const id = uid('media'); const url = registerUrl(id, file);
  if (kind === 'image') {
    try { const { thumb, width, height } = await imageThumb(url); await putBlob(id, file); return { id, name, kind, duration: 0, width, height, thumbs: [thumb] }; }
    catch { throw new Error(`${name}: this image format can't be opened here. Try JPG or PNG.`); }
  }
  const el = document.createElement(kind === 'video' ? 'video' : 'audio'); el.preload = 'metadata'; el.src = url;
  if (el instanceof HTMLVideoElement) { el.muted = true; el.playsInline = true; }
  try { await once(el, 'loadedmetadata'); } catch { throw new Error(`${name}: this ${kind} format can't be played here. Try MP4, MOV, MP3 or M4A.`); }
  let duration = el.duration;
  if (!Number.isFinite(duration)) { el.currentTime = 1e7; await once(el, 'timeupdate', 4000).catch(() => undefined); duration = Number.isFinite(el.duration) ? el.duration : 5; el.currentTime = 0; }
  await putBlob(id, file);
  if (el instanceof HTMLVideoElement) {
    const width = el.videoWidth || 1280; const height = el.videoHeight || 720;
    const thumbs = await videoThumbs(url, duration, width, height);
    return { id, name, kind, duration, width, height, thumbs, hasAudio: true };
  }
  return { id, name, kind, duration, width: 0, height: 0, thumbs: [], ...(await audioPeaks(file).then(peaks => peaks ? { peaks } : {})) };
}
