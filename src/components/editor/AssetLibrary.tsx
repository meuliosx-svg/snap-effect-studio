import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BlendMode } from './model';

export type LibrarySample = { url: string; name: string; kind: 'video' | 'image'; blend: BlendMode };
type Pointer = { url: string; original_filename: string };
const ripples = import.meta.glob('@/assets/overlays/*.asset.json', { eager: true, import: 'default' }) as Record<string, Pointer>;
const cc = import.meta.glob('@/assets/cc/*.asset.json', { eager: true, import: 'default' }) as Record<string, Pointer>;
const samples = (files: Record<string, Pointer>, kind: LibrarySample['kind'], blend: BlendMode): LibrarySample[] => Object.values(files).map(a => ({ url: a.url, name: a.original_filename.replace(/\.(mp4|jpg|webp)$/, '').replace(/_Ripple_Overlay$/, ' ripple').replace(/_/g, ' '), kind, blend }));
const sections = { 'Ripples': samples(ripples, 'video', 'screen'), 'CC overlays': samples(cc, 'image', 'soft-light') };
type Section = keyof typeof sections;

export default function AssetLibrary({ onAdd, only }: { onAdd: (sample: LibrarySample) => void; only?: Section }) {
  const [tab, setTab] = useState<Section>('Ripples');
  const current = only ?? tab;
  return <div className="asset-library">
    {!only && <div className="library-tabs" role="tablist" aria-label="Overlay categories">{(Object.keys(sections) as Section[]).map(s => <Button variant="ghost" key={s} role="tab" aria-selected={current === s} className={current === s ? 'on' : ''} onClick={() => setTab(s)}>{s}</Button>)}</div>}
    <div className="sample-grid">{sections[current].map(s => <Button variant="ghost" className="sample-tile" key={s.url} onClick={() => onAdd(s)}>
      {s.kind === 'video' ? <video src={`${s.url}#t=0.5`} muted playsInline preload="metadata" onMouseEnter={e => { void e.currentTarget.play().catch(() => undefined); }} onMouseLeave={e => e.currentTarget.pause()} /> : <img src={s.url} alt="" loading="lazy" />}
      <span>{s.name}</span>
    </Button>)}</div>
  </div>;
}