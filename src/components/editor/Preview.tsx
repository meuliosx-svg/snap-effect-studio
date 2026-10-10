import { Rnd } from 'react-rnd';
import { useRef, useEffect, useState } from 'react';
import type { TextLayer, MediaItem, Adjustments } from './model';
import { getFilter } from './model';

type Props = { media: MediaItem; layers: TextLayer[]; selected: string; onSelect: (id: string) => void; onUpdate: (id: string, patch: Partial<TextLayer>) => void; ratio: string; time: number; playing: boolean; effect: string; adjustments: Adjustments; hiddenText: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; canvasRef: React.RefObject<HTMLDivElement | null> };

export default function Preview({ media, layers, selected, onSelect, onUpdate, ratio, time, playing, effect, adjustments, hiddenText, videoRef, canvasRef }: Props) {
  const [size, setSize] = useState({ width: 640, height: 360 });
  const areaRef = useRef<HTMLDivElement>(null);
  const [w, h] = ratio.split(':').map(Number);
  const aspect = w / h;
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width - 4);
      const height = Math.max(1, entry.contentRect.height - 4);
      const fittedWidth = Math.min(width, height * aspect);
      setSize({ width: fittedWidth, height: fittedWidth / aspect });
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [aspect]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing, media.url, videoRef]);
  useEffect(() => {
    const video = videoRef.current;
    if (video && !playing && Math.abs(video.currentTime - time) > .15) video.currentTime = Math.min(time, media.duration);
  }, [time, playing, media.duration, videoRef]);
  return <div ref={areaRef} className="preview-area">
    <div ref={canvasRef} className="video-canvas" style={{ width: size.width, height: size.height }} onPointerDown={e => { if (e.target === e.currentTarget) onSelect('video'); }}>
      {media.type === 'video' ? <video ref={videoRef} key={media.url} src={media.url} className="canvas-media" playsInline muted style={{ filter: getFilter(adjustments, effect) }} onClick={() => onSelect('video')} /> : <img src={media.url} className="canvas-media" alt="Current video composition" draggable={false} style={{ filter: getFilter(adjustments, effect) }} onClick={() => onSelect('video')} />}
      {!hiddenText && layers.filter(layer => time >= layer.start && time <= layer.end).map(layer => <Rnd key={layer.id}
        size={{ width: layer.width * size.width / 100, height: layer.height * size.height / 100 }}
        position={{ x: layer.x * size.width / 100, y: layer.y * size.height / 100 }} bounds="parent" minWidth={40} minHeight={20}
        className={selected === layer.id ? 'layer-selected' : ''}
        onDragStart={() => onSelect(layer.id)} onResizeStart={() => onSelect(layer.id)}
        onDragStop={(_, data) => onUpdate(layer.id, { x: data.x / size.width * 100, y: data.y / size.height * 100 })}
        onResizeStop={(_, __, ref, ___, position) => onUpdate(layer.id, { width: ref.offsetWidth / size.width * 100, height: ref.offsetHeight / size.height * 100, x: position.x / size.width * 100, y: position.y / size.height * 100 })}
        enableResizing={selected === layer.id}>
        <div className={`canvas-title ${layer.style}`} style={{ fontSize: layer.fontSize * size.width / 960 }} onPointerDown={() => onSelect(layer.id)}>{layer.text}</div>
      </Rnd>)}
      {layers.some(l => l.id === 'title') && !hiddenText && <div className="canvas-caption">A LITTLE FURTHER. A LITTLE FREER.</div>}
    </div>
  </div>;
}