import type { Adjustments, MediaItem, TextLayer } from './model';
import { getFilter } from './model';

export async function exportVideo(options: { media: MediaItem; layers: TextLayer[]; ratio: string; duration: number; effect: string; adjustments: Adjustments; resolution: number; onProgress: (n: number) => void; signal: AbortSignal; hiddenText: boolean }) {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video export is not available in this browser. Try Chrome or Edge.');
  const { media, layers, ratio, duration, effect, adjustments, resolution, onProgress, signal, hiddenText } = options;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('WebM export is not supported here. Try Chrome or Edge.');
  const [rw, rh] = ratio.split(':').map(Number);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(resolution * rw / rh); canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create export canvas.');
  await document.fonts.ready;
  let source: HTMLImageElement | HTMLVideoElement;
  if (media.type === 'video') {
    const video = document.createElement('video'); video.src = media.url; video.muted = true; video.playsInline = true;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('The video could not be loaded.')); });
    await video.play(); source = video;
  } else {
    const image = new Image(); image.src = media.url; await image.decode(); source = image;
  }
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const result = new Promise<Blob>((resolve, reject) => { recorder.onstop = () => signal.aborted ? reject(new Error('Export cancelled.')) : resolve(new Blob(chunks, { type: 'video/webm' })); recorder.onerror = () => reject(new Error('Video export failed.')); });
  let frame = 0;
  const start = performance.now();
  const draw = () => {
    const time = (performance.now() - start) / 1000;
    const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const scale = Math.max(canvas.width / sw, canvas.height / sh);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = getFilter(adjustments, effect);
    ctx.drawImage(source, (canvas.width - sw * scale) / 2, (canvas.height - sh * scale) / 2, sw * scale, sh * scale);
    ctx.filter = 'none';
    if (!hiddenText) layers.filter(l => time >= l.start && time <= l.end).forEach(layer => {
      const fontSize = layer.fontSize * canvas.width / 960;
      ctx.font = `800 ${fontSize}px Manrope`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const x = (layer.x + layer.width / 2) * canvas.width / 100;
      const y = (layer.y + layer.height / 2) * canvas.height / 100;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-ink').trim();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
      ctx.shadowColor = layer.style === 'glow' ? getComputedStyle(document.documentElement).getPropertyValue('--canvas-glow').trim() : 'transparent';
      ctx.shadowBlur = layer.style === 'glow' ? 20 : 0;
      if (layer.style === 'outline') ctx.strokeText(layer.text, x, y, layer.width * canvas.width / 100);
      else ctx.fillText(layer.text, x, y, layer.width * canvas.width / 100);
      ctx.shadowBlur = 0;
    });
    if (!hiddenText && layers.some(l => l.id === 'title')) {
      ctx.font = `500 ${canvas.width * .0125}px Manrope`; ctx.textAlign = 'center';
      ctx.fillText('A LITTLE FURTHER. A LITTLE FREER.', canvas.width / 2, canvas.height * .74);
    }
    onProgress(Math.min(100, Math.round(time / duration * 100)));
    if (time >= duration || signal.aborted) { recorder.stop(); return; }
    frame = requestAnimationFrame(draw);
  };
  recorder.start(); draw();
  try { return await result; }
  finally { cancelAnimationFrame(frame); stream.getTracks().forEach(track => track.stop()); if (source instanceof HTMLVideoElement) source.pause(); }
}