import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, Plus, Upload, Film, Layers, Type, Sparkles, SlidersHorizontal, Music2, Sticker, Settings2, Undo2, Redo2, Scissors, Copy, Trash2, Magnet, ZoomIn, ZoomOut, Maximize, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Eye, EyeOff, LockKeyhole, UnlockKeyhole, MoreHorizontal, FolderOpen, Download, X, RotateCcw, AlignCenter, AlignLeft, AlignRight, Move, Crop, Diamond, CheckCircle2, HelpCircle, PanelRight, Video, Search, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import coast from '@/assets/coast.jpg';
import { initialText, formatTime, getFilter, type TextLayer, type MediaItem, type Adjustments } from '@/components/editor/model';
const Preview = lazy(() => import('@/components/editor/Preview'));

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'FRAME — Your creative video workspace' },
    { name: 'description', content: 'A beautifully simple video editor. Create with layered text, cinematic effects, precise color and an intuitive timeline.' },
    { property: 'og:title', content: 'FRAME — Your creative video workspace' },
    { property: 'og:description', content: 'Create your next edit with layered text, cinematic effects and an intuitive timeline.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: Editor,
});
const tools = [{ name: 'Media', icon: Film }, { name: 'Text', icon: Type }, { name: 'Audio', icon: Music2 }, { name: 'Effects', icon: Sparkles }, { name: 'Color', icon: SlidersHorizontal }, { name: 'Elements', icon: Sticker }];
const defaultAdjustments: Adjustments = { brightness: 100, contrast: 100, saturation: 100, warmth: 0 };
const demoMedia: [MediaItem, ...MediaItem[]] = [
  { id: 'coast', name: 'Coastal escape.jpg', url: coast, type: 'image', duration: 24 },
  { id: 'waves', name: 'Ocean textures.jpg', url: coast, type: 'image', duration: 8 },
  { id: 'cliffs', name: 'Into the wild.jpg', url: coast, type: 'image', duration: 12 },
  { id: 'shore', name: 'The shoreline.jpg', url: coast, type: 'image', duration: 6 },
];
function IconButton({ label, icon: Icon, onClick, disabled, active = false, className = '' }: { label: string; icon: typeof Plus; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string }) {
  return <Button variant={active ? 'selected' : 'tool'} size="icon" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={className}><Icon /></Button>;
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function Editor() {
  const [tool, setTool] = useState('Media');
  const [media, setMedia] = useState(demoMedia);
  const [currentMedia, setCurrentMedia] = useState(demoMedia[0]);
  const [layers, setLayers] = useState<TextLayer[]>(initialText);
  const [selected, setSelected] = useState('video');
  const [name, setName] = useState('Coastal escape');
  const [time, setTime] = useState(4.2);
  const [duration, setDuration] = useState(24);
  const [playing, setPlaying] = useState(false);
  const [ratio, setRatio] = useState('16:9');
  const [adjustments, setAdjustments] = useState(defaultAdjustments);
  const [effect, setEffect] = useState('None');
  const [inspectorTab, setInspectorTab] = useState('Transform');
  const [libraryTab, setLibraryTab] = useState('Project');
  const [panelOpen, setPanelOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [hiddenText, setHiddenText] = useState(false);
  const [lockedText, setLockedText] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [muted, setMuted] = useState(true);
  const [audio, setAudio] = useState<{ name: string; url: string } | null>(null);
  const [modal, setModal] = useState<'export' | 'projects' | 'help' | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportResolution, setExportResolution] = useState(720);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<TextLayer[][]>([]);
  const [future, setFuture] = useState<TextLayer[][]>([]);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const importedUrls = useRef<string[]>([]);
  const selectedLayer = layers.find(layer => layer.id === selected);
  useEffect(() => () => importedUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0; let last = performance.now();
    const tick = (now: number) => { const delta = (now - last) / 1000; last = now; setTime(previous => { if (previous + delta >= duration) { setPlaying(false); return duration; } return previous + delta; }); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.muted = muted;
    if (playing) { element.currentTime = time; void element.play().catch(() => undefined); } else element.pause();
  }, [playing, audio, muted]);
  const remember = () => { setHistory(previous => [...previous.slice(-29), layers.map(l => ({ ...l }))]); setFuture([]); setSaved(false); };
  const updateLayer = (id: string, patch: Partial<TextLayer>) => { if (lockedText) { setNotice('Unlock the text track to edit it.'); return; } remember(); setLayers(previous => previous.map(l => l.id === id ? { ...l, ...patch } : l)); };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture(f => [...f, layers]); setLayers(previous); setHistory(h => h.slice(0, -1)); };
  const redo = () => { const next = future.at(-1); if (!next) return; setHistory(h => [...h, layers]); setLayers(next); setFuture(f => f.slice(0, -1)); };
  const addText = (style: TextLayer['style'] = 'clean', text = 'Your story') => { remember(); const id = `text-${Date.now()}`; setLayers(previous => [...previous, { id, text, x: 15, y: 35, width: 70, height: 25, fontSize: 64, style, start: 0, end: duration }]); setSelected(id); setTool('Text'); setPanelOpen(false); setInspectorTab('Transform'); };
  const selectTool = (next: string) => { setTool(next); setPanelOpen(true); if (next === 'Color') { setInspectorTab('Color'); setPropertiesOpen(true); setPanelOpen(false); } };
  const chooseMedia = (item: MediaItem) => { setCurrentMedia(item); setDuration(item.duration); setTime(0); setPlaying(false); setSelected('video'); setPanelOpen(false); setSaved(false); };
  const importMedia = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { setNotice('Choose an image or video file.'); continue; }
      const url = URL.createObjectURL(file); importedUrls.current.push(url);
      let length = 24;
      if (file.type.startsWith('video/')) {
        const element = document.createElement('video'); element.src = url;
        try { await new Promise<void>((resolve, reject) => { element.onloadedmetadata = () => { length = Number.isFinite(element.duration) ? element.duration : 24; resolve(); }; element.onerror = () => reject(new Error('Unsupported video format')); }); }
        catch { setNotice('This video format could not be opened. Try an MP4 or WebM.'); continue; }
      }
      const item: MediaItem = { id: `media-${Date.now()}-${file.name}`, name: file.name, url, type: file.type.startsWith('video/') ? 'video' : 'image', duration: length };
      setMedia(previous => [...previous, item]); chooseMedia(item);
    }
  };
  const saveProject = () => { download(new Blob([JSON.stringify({ version: 1, name, ratio, layers, adjustments, effect, duration, mediaName: currentMedia.name }, null, 2)], { type: 'application/json' }), `${name || 'Untitled'}.frame.json`); setSaved(true); setNotice('Project downloaded. Imported media stays on your device.'); };
  const openProject = async (file?: File) => {
    if (!file) return;
    try {
      const project = JSON.parse(await file.text());
      if (project.version !== 1 || !Array.isArray(project.layers) || !['16:9', '9:16', '1:1', '4:5', '4:3'].includes(project.ratio) || !project.layers.every((l: TextLayer) => typeof l.text === 'string' && typeof l.id === 'string' && ['x', 'y', 'width', 'height', 'fontSize', 'start', 'end'].every(key => Number.isFinite(l[key as keyof TextLayer])) && ['clean', 'glow', 'outline'].includes(l.style))) throw new Error();
      setLayers(project.layers); setName(String(project.name)); setRatio(project.ratio); setEffect(['None', 'Vivid', 'Mono', 'Vintage', 'Dream'].includes(project.effect) ? project.effect : 'None');
      if (project.adjustments && Object.keys(defaultAdjustments).every(key => Number.isFinite(project.adjustments[key]))) setAdjustments(project.adjustments);
      if (Number.isFinite(project.duration) && project.duration > 0) setDuration(project.duration);
      setTime(0); setPlaying(false); setModal(null); setNotice('Project opened. Reimport the original media if needed.');
    } catch { setNotice('This is not a valid FRAME project.'); }
  };
  const splitClip = () => { if (time < .1 || time > duration - .1) { setNotice('Move the playhead inside a clip to split it.'); return; } setSplitPoints(points => [...points, time].sort((a,b) => a-b)); setNotice(`Clip split at ${formatTime(time)}.`); };
  const deleteLayer = () => { if (!selectedLayer) { setNotice('Select a text layer to delete it.'); return; } if (lockedText) { setNotice('Unlock the text track first.'); return; } remember(); setLayers(l => l.filter(layer => layer.id !== selected)); setSelected('video'); };
  const startExport = async () => { setExportProgress(0); setPlaying(false); abortRef.current = new AbortController(); try { const { exportVideo } = await import('@/components/editor/export'); const blob = await exportVideo({ media: currentMedia, layers, ratio, duration, effect, adjustments, resolution: exportResolution, onProgress: setExportProgress, signal: abortRef.current.signal, hiddenText }); download(blob, `${name || 'Untitled'}.webm`); setModal(null); setNotice('Your video is ready — downloaded as WebM.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Export could not be completed.'); } finally { setExportProgress(null); } };
  const togglePlay = () => { if (time >= duration) setTime(0); setPlaying(p => !p); };
  const scrub = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); setTime(Math.max(0,Math.min(duration,(event.clientX - rect.left) / (rect.width - 50) * duration))); setPlaying(false); };
  const field = (label: string, key: keyof TextLayer) => <label className="number-field"><span>{label}</span><input type="number" aria-label={label} value={Math.round(Number(selectedLayer?.[key] ?? 0))} onChange={e => selectedLayer && updateLayer(selectedLayer.id, { [key]: Math.max(0, Math.min(key === 'fontSize' ? 200 : 100, Number(e.target.value))) })} /></label>;
  const colorControls = <>{Object.entries(adjustments).map(([key, value]) => <div key={key} className="mb-5"><label className="control-label" htmlFor={`adjust-${key}`}>{key.charAt(0).toUpperCase() + key.slice(1)}<span>{value}</span></label><input id={`adjust-${key}`} type="range" min={key === 'warmth' ? 0 : 0} max={key === 'warmth' ? 100 : 200} value={value} onChange={e => { setAdjustments(a => ({ ...a, [key]: Number(e.target.value) })); setSaved(false); }} /></div>)}<Button variant="secondary" size="sm" className="w-full" onClick={() => setAdjustments(defaultAdjustments)}><RotateCcw />Reset color</Button></>;

  return <main className="editor">
    <input ref={fileRef} className="hidden" type="file" accept="video/*,image/*" multiple onChange={e => { void importMedia(e.target.files); e.target.value = ''; }} />
    <input ref={audioFileRef} className="hidden" type="file" accept="audio/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const url = URL.createObjectURL(file); importedUrls.current.push(url); setAudio({ name: file.name, url }); setPanelOpen(false); setNotice('Audio added to your timeline.'); } e.target.value = ''; }} />
    <input ref={projectFileRef} className="hidden" type="file" accept=".json" onChange={e => { void openProject(e.target.files?.[0]); e.target.value = ''; }} />
    {audio && <audio ref={audioRef} src={audio.url} />}
    <header className="topbar">
      <div className="brand"><span className="brand-mark" /><span>frame<span className="text-primary">.</span></span><span className="ml-3 border-l border-border pl-4 desktop-only"><IconButton label="Projects" icon={FolderOpen} onClick={() => setModal('projects')} /></span></div>
      <div className="topbar-project min-w-0 flex items-center justify-center gap-4"><input className="project-name" aria-label="Project name" value={name} onChange={e => { setName(e.target.value); setSaved(false); }} /><span className="save-label"><CheckCircle2 size={12} />{saved ? 'Downloaded' : 'On your device'}</span></div>
      <div className="topbar-actions flex items-center gap-3"><IconButton label="Download project" icon={Download} onClick={saveProject} /><Button onClick={() => setModal('export')} size="sm" className="h-9 px-4"><span>Export</span><ArrowUpRight size={15} /></Button></div>
    </header>
    <section className="workspace">
      <nav className="toolrail" aria-label="Editing tools">{tools.map(({ name: label, icon: Icon }) => <Button key={label} variant={tool === label ? 'selected' : 'tool'} className="rail-button" onClick={() => selectTool(label)}><Icon /><span>{label}</span></Button>)}<div className="rail-bottom mt-auto flex flex-col gap-3"><IconButton label="Help" icon={HelpCircle} onClick={() => setModal('help')} /><IconButton label="Project settings" icon={Settings2} onClick={() => { setPropertiesOpen(true); setInspectorTab('Transform'); }} /></div></nav>
      <aside className={`asset-panel ${panelOpen ? 'mobile-open' : ''}`}>
        <div className="panel-heading"><h2>{tool === 'Media' ? 'Your media' : tool === 'Color' ? 'Color studio' : tool}</h2><IconButton label={panelOpen ? 'Close library' : 'Library options'} icon={panelOpen ? X : MoreHorizontal} onClick={() => panelOpen ? setPanelOpen(false) : setModal('projects')} /></div>
        <div className="panel-body">
          {tool === 'Media' && <><div className="library-tabs">{['Project', 'Samples'].map(tab => <Button key={tab} variant="tool" className={`library-tab ${libraryTab === tab ? 'active' : ''}`} onClick={() => setLibraryTab(tab)}>{tab}</Button>)}</div><Button variant="secondary" className="import-button" onClick={() => fileRef.current?.click()}><Upload size={14} />Import media</Button><div className="flex justify-between"><span className="section-label">{libraryTab === 'Project' ? 'Project assets' : 'Sample assets'}</span><span className="text-muted-foreground text-[10px]">{libraryTab === 'Project' ? media.length : 4} items</span></div><div className="media-grid">{(libraryTab === 'Project' ? media : demoMedia).map((item, i) => <div key={item.id} className="media-tile" role="button" tabIndex={0} aria-label={`Use ${item.name}`} onClick={() => chooseMedia(item)} onKeyDown={e => e.key === 'Enter' && chooseMedia(item)}><div className="media-thumb">{item.type === 'image' ? <img src={item.url} alt={item.name} style={{ objectPosition: i % 4 === 1 ? '15% 35%' : i % 4 === 2 ? '85% 10%' : '50% 50%', filter: i % 4 === 1 ? 'saturate(.75)' : 'none' }} /> : <video src={item.url} muted preload="metadata" />}<span className="duration">{formatTime(item.duration).slice(0,5)}</span></div><div className="media-name">{item.name}</div><div className="media-type">{item.type === 'image' ? 'Image' : 'Video'} · {item.id.startsWith('media') ? 'Imported' : 'Sample'}</div></div>)}</div><div className="mt-7 flex items-center gap-2 text-muted-foreground text-[10px]"><FolderOpen size={13} /><span>All files · This project</span><ChevronRight size={12} className="ml-auto" /></div></>}
          {tool === 'Text' && <><Button className="w-full mb-6" onClick={() => addText()}><Plus />Add text</Button><span className="section-label">Text styles</span><Button variant="secondary" className="text-preset" onClick={() => addText('clean')}>Your story</Button><Button variant="secondary" className="text-preset glow-sample" onClick={() => addText('glow', 'AFTER HOURS')}>AFTER HOURS</Button><Button variant="secondary" className="text-preset outline-sample" onClick={() => addText('outline', 'EXPLORE')}>EXPLORE</Button></>}
          {tool === 'Effects' && <><span className="section-label">The essentials</span><div className="effect-grid">{['None','Vivid','Mono','Vintage','Dream'].map(fx => <Button key={fx} variant="tool" className={`effect-tile ${effect === fx ? 'active' : ''}`} onClick={() => { setEffect(fx); setSaved(false); }}><img src={coast} alt={`${fx} effect`} style={{ filter: getFilter(defaultAdjustments, fx) }} />{fx}</Button>)}</div></>}
          {tool === 'Color' && colorControls}
          {tool === 'Audio' && <><Button variant="secondary" className="import-button" onClick={() => audioFileRef.current?.click()}><Upload />Import audio</Button>{audio ? <div className="flex items-center gap-3 rounded-md bg-secondary p-3"><Music2 className="text-audio-track" /><span className="truncate min-w-0">{audio.name}</span><IconButton label="Remove audio" icon={X} onClick={() => setAudio(null)} /></div> : <div className="mt-8 text-center text-muted-foreground"><Music2 size={36} className="mx-auto mb-4" /><span className="text-xs">Your soundtrack, your mood.</span></div>}</>}
          {tool === 'Elements' && <><span className="section-label">Simple shapes & symbols</span><div className="effect-grid">{['✦','★','→','●','◎','＋'].map(symbol => <Button key={symbol} variant="secondary" className="h-20 text-3xl" onClick={() => addText('clean', symbol)}>{symbol}</Button>)}</div></>}
        </div><div className="library-footer"><LockKeyhole size={12} />Private by default. Yours to create.</div>
      </aside>
      <section className="center-workspace" aria-label="Video preview">
        <div className="preview-toolbar"><div className="flex items-center gap-2 text-muted-foreground text-[11px]"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Preview<ChevronDown size={12} /></div><div className="flex items-center gap-3"><select aria-label="Aspect ratio" value={ratio} onChange={e => { setRatio(e.target.value); setSaved(false); }}>{['16:9','9:16','1:1','4:5','4:3'].map(r => <option key={r}>{r}</option>)}</select><IconButton label="Layer properties" icon={PanelRight} className="mobile-properties" onClick={() => setPropertiesOpen(true)} /><IconButton label="Fullscreen preview" icon={Maximize} onClick={() => { const element = canvasRef.current; if (element?.requestFullscreen) void element.requestFullscreen().catch(() => setNotice('Fullscreen is unavailable in this browser.')); else setNotice('Fullscreen is unavailable in this browser.'); }} /></div></div>
        <ClientOnly fallback={<div className="preview-area"><img src={coast} alt="Coastal escape preview" className="w-full object-contain" /></div>}><Suspense fallback={<div className="preview-area text-muted-foreground">Loading preview…</div>}><Preview media={currentMedia} layers={layers} selected={lockedText ? 'video' : selected} onSelect={setSelected} onUpdate={updateLayer} ratio={ratio} time={time} playing={playing} effect={effect} adjustments={adjustments} hiddenText={hiddenText} videoRef={videoRef} canvasRef={canvasRef} /></Suspense></ClientOnly>
        <div className="transport"><div className="timecode">{formatTime(time)}<span className="time-total"> / {formatTime(duration)}</span></div><div className="play-controls"><IconButton label="Go to start" icon={SkipBack} onClick={() => { setTime(0); setPlaying(false); }} /><Button variant="secondary" size="icon" className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</Button><IconButton label="Go to end" icon={SkipForward} onClick={() => { setTime(duration); setPlaying(false); }} /></div><div className="flex justify-end items-center gap-2"><IconButton label={muted ? 'Unmute audio' : 'Mute audio'} icon={muted ? VolumeX : Volume2} onClick={() => setMuted(m => !m)} /><span className="desktop-only text-muted-foreground text-[10px]">Fit</span></div></div>
      </section>
      <aside className={`inspector ${propertiesOpen ? 'mobile-open' : ''}`}>
        <div className="inspector-header"><Settings2 size={14} /><span>{selectedLayer ? 'Text properties' : 'Clip properties'}</span><IconButton label={propertiesOpen ? 'Close properties' : 'Reset properties'} icon={propertiesOpen ? X : RotateCcw} className="ml-auto" onClick={() => propertiesOpen ? setPropertiesOpen(false) : setAdjustments(defaultAdjustments)} /></div>
        <div className="inspector-tabs">{['Transform','Color','Effects'].map(tab => <Button key={tab} variant="tool" className={`library-tab ${inspectorTab === tab ? 'active' : ''}`} onClick={() => setInspectorTab(tab)}>{tab}</Button>)}</div>
        <div className="inspector-content">
          {inspectorTab === 'Transform' && <>
            {selectedLayer ? <><div className="control-group"><label className="control-label" htmlFor="text-content">Text<IconButton label="Delete text" icon={Trash2} className="h-5 w-5" onClick={deleteLayer} /></label><input id="text-content" className="field" value={selectedLayer.text} onChange={e => updateLayer(selectedLayer.id, { text: e.target.value })} /><div className="mt-3"><select className="field" aria-label="Text font"><option>Manrope · Extra bold</option></select></div><div className="coordinate-grid mt-3">{field('Size','fontSize')}<div className="flex justify-center gap-1"><IconButton label="Align left" icon={AlignLeft} onClick={() => updateLayer(selectedLayer.id,{x:0})} /><IconButton label="Center text" icon={AlignCenter} onClick={() => updateLayer(selectedLayer.id,{x:(100-selectedLayer.width)/2})} /><IconButton label="Align right" icon={AlignRight} onClick={() => updateLayer(selectedLayer.id,{x:100-selectedLayer.width})} /></div></div></div><div className="control-group"><div className="control-label">Position<Move size={12} className="text-muted-foreground" /></div><div className="coordinate-grid">{field('X','x')}{field('Y','y')}</div><div className="control-label mt-5">Scale<span>%</span></div><div className="coordinate-grid">{field('W','width')}{field('H','height')}</div></div><div className="control-group"><div className="control-label">Text style<Sparkles size={12} className="text-muted-foreground" /></div><div className="style-grid">{(['clean','glow','outline'] as const).map(style => <Button key={style} variant="tool" className={`style-tile ${selectedLayer.style === style ? 'active' : ''}`} onClick={() => updateLayer(selectedLayer.id,{style})}><strong className={style === 'glow' ? 'glow-sample' : style === 'outline' ? 'outline-sample' : ''}>Aa</strong><span>{style.charAt(0).toUpperCase()+style.slice(1)}</span></Button>)}</div></div><div className="control-group"><div className="control-label">Layer timing<span>seconds</span></div><div className="coordinate-grid"><label className="number-field"><span>In</span><input type="number" aria-label="Text start time" min={0} max={selectedLayer.end} value={selectedLayer.start} onChange={e => updateLayer(selectedLayer.id,{start:Math.max(0,Math.min(selectedLayer.end,Number(e.target.value)))})} /></label><label className="number-field"><span>Out</span><input type="number" aria-label="Text end time" min={selectedLayer.start} max={duration} value={selectedLayer.end} onChange={e => updateLayer(selectedLayer.id,{end:Math.min(duration,Math.max(selectedLayer.start,Number(e.target.value)))})} /></label></div></div></> : <>
              <div className="control-group"><div className="control-label">Aspect ratio<Crop size={13} className="text-muted-foreground" /></div><select className="field" aria-label="Canvas ratio" value={ratio} onChange={e => setRatio(e.target.value)}>{['16:9','9:16','1:1','4:5','4:3'].map(r => <option key={r}>{r}</option>)}</select><div className="control-label mt-5">Composition<span>Fill frame</span></div><div className="coordinate-grid"><div className="number-field"><span>X</span><span className="ml-auto">0</span></div><div className="number-field"><span>Y</span><span className="ml-auto">0</span></div></div></div>
              <div className="control-group"><div className="control-label">Duration<span>seconds</span></div><input type="number" className="field" aria-label="Composition duration" min={1} max={300} value={duration} onChange={e => { const value = Math.max(1,Math.min(300,Number(e.target.value))); setDuration(value); setTime(t => Math.min(t,value)); }} /></div>
              <div className="control-group"><div className="control-label">Layers<span>{layers.length}</span></div>{layers.map(layer => <Button key={layer.id} variant="secondary" className="w-full mb-2 justify-start text-xs" onClick={() => setSelected(layer.id)}><Type size={12} /><span className="truncate">{layer.text}</span><ChevronRight className="ml-auto" size={12} /></Button>)}<Button variant="outline" className="w-full text-xs" onClick={() => addText()}><Plus />Add text layer</Button></div>
              <div className="control-group"><div className="control-label">Quick look<Sparkles size={12} className="text-muted-foreground" /></div><div className="style-grid">{['None','Vivid','Mono'].map(fx => <Button key={fx} variant="tool" className={`style-tile ${effect === fx ? 'active' : ''}`} onClick={() => setEffect(fx)}><strong>{fx === 'None' ? '↗' : fx === 'Vivid' ? '✦' : '◐'}</strong>{fx === 'None' ? 'Original' : fx}</Button>)}</div></div>
            </>}
          </>}
          {inspectorTab === 'Color' && <div>{colorControls}</div>}
          {inspectorTab === 'Effects' && <div className="effect-grid">{['None','Vivid','Mono','Vintage','Dream'].map(fx => <Button key={fx} variant="tool" className={`effect-tile ${effect === fx ? 'active' : ''}`} onClick={() => setEffect(fx)}><img src={coast} alt={fx} style={{filter:getFilter(defaultAdjustments,fx)}} />{fx}</Button>)}</div>}
        </div>
      </aside>
    </section>
    <section className="timeline" aria-label="Layered timeline">
      <div className="timeline-toolbar"><div className="timeline-tools"><IconButton label="Undo" icon={Undo2} disabled={!history.length} onClick={undo} /><IconButton label="Redo" icon={Redo2} disabled={!future.length} onClick={redo} /><span className="toolbar-divider" /><IconButton label="Split at playhead" icon={Scissors} onClick={splitClip} /><IconButton label="Duplicate text layer" icon={Copy} onClick={() => selectedLayer ? addText(selectedLayer.style, selectedLayer.text) : setNotice('Select a text layer to duplicate it.')} /><IconButton label="Delete selected layer" icon={Trash2} onClick={deleteLayer} /><span className="toolbar-divider" /><IconButton label="Snap to frame" icon={Magnet} active={snap} onClick={() => { setSnap(s => !s); setNotice(snap ? 'Frame snapping off.' : 'Frame snapping on.'); }} /><span className="desktop-only text-[10px] text-muted-foreground ml-3">{layers.length + 1 + (audio ? 1 : 0)} layers</span></div><div className="flex items-center gap-2"><IconButton label="Zoom timeline out" icon={ZoomOut} onClick={() => setZoom(z => Math.max(.75,z-.25))} /><input className="desktop-only max-w-20" aria-label="Timeline zoom" type="range" min="0.75" max="3" step="0.25" value={zoom} onChange={e => setZoom(Number(e.target.value))} /><IconButton label="Zoom timeline in" icon={ZoomIn} onClick={() => setZoom(z => Math.min(3,z+.25))} /><span className="desktop-only text-muted-foreground text-[10px] w-9">{Math.round(zoom * 100)}%</span></div></div>
      <div className="timeline-layout"><div className="track-headers"><div className="track-header"><span className="track-name">TRACKS</span><Layers size={11} className="ml-auto" /></div><div className="track-header"><Film size={13} className="text-primary shrink-0" /><span className="track-name">Video</span><div className="track-actions"><Eye size={11} /><LockKeyhole size={11} /></div></div><div className="track-header"><Type size={13} className="text-text-track shrink-0" /><span className="track-name">Text</span><div className="track-actions"><IconButton label={hiddenText ? 'Show text track' : 'Hide text track'} icon={hiddenText ? EyeOff : Eye} className="track-action" onClick={() => setHiddenText(h => !h)} /><IconButton label={lockedText ? 'Unlock text track' : 'Lock text track'} icon={lockedText ? LockKeyhole : UnlockKeyhole} className="track-action" onClick={() => setLockedText(l => !l)} /></div></div><div className="track-header"><Sparkles size={13} className="text-effect-track shrink-0" /><span className="track-name">Effects</span><div className="track-actions"><Eye size={11} /><LockKeyhole size={11} /></div></div><div className="track-header"><Music2 size={13} className="text-audio-track shrink-0" /><span className="track-name">Audio</span><div className="track-actions"><IconButton label="Toggle audio track" icon={muted ? VolumeX : Volume2} className="track-action" onClick={() => setMuted(m => !m)} /></div></div></div>
        <div className="timeline-scroll" ref={timelineRef}><div className="timeline-inner" style={{width:`${zoom * 100}%`}}>
          <div className="ruler" onPointerDown={scrub} onPointerMove={e => { if (e.buttons === 1) scrub(e); }}>{Array.from({length:9},(_,i) => <span key={i}>{formatTime(i*duration/8).slice(0,5)}</span>)}</div>
          <div className="track-row">{[0,...splitPoints.filter(t => t < duration),duration].slice(0,-1).map((point,i,points) => { const end = points[i+1] ?? duration; return <div key={`${point}-${i}`} role="button" tabIndex={0} aria-label={`Video clip ${i+1}`} className="video-clip" style={{width:`${(end-point)/duration*94}%`}} onClick={() => setSelected('video')} onKeyDown={e => e.key === 'Enter' && setSelected('video')}>{Array.from({length:Math.max(1,Math.ceil((end-point)/duration*15))},(_,j) => <img key={j} src={currentMedia.type === 'image' ? currentMedia.url : coast} alt="" />)}<span className="clip-label"><Film size={10} className="inline mr-1" />{currentMedia.name}</span></div>; })}</div>
          <div className="track-row">{layers.map((layer,i) => <div key={layer.id} role="button" tabIndex={0} aria-label={`Select ${layer.text} text layer`} className="layer-clip text-clip" style={{width:`${(layer.end-layer.start)/duration*94}%`, position:'absolute', left:`${layer.start/duration*94}%`, opacity:hiddenText ? .35 : 1, top:i === 0 ? 7 : 11, borderColor:selected === layer.id ? 'var(--text-track)' : undefined}} onClick={() => { setSelected(layer.id); if (layer.start > time || layer.end < time) setTime(layer.start); }} onKeyDown={e => e.key === 'Enter' && setSelected(layer.id)}><Type size={12} />{layer.text}<span className="ml-auto opacity-60 text-[9px]">{layer.style === 'glow' ? 'Glow' : 'Text'}</span></div>)}</div>
          <div className="track-row"><div role="button" tabIndex={0} aria-label="Edit effects" className="layer-clip effect-clip" style={{width:'94%'}} onClick={() => { setTool('Effects'); setPanelOpen(true); setInspectorTab('Effects'); }} onKeyDown={e => e.key === 'Enter' && selectTool('Effects')}><Sparkles size={12} />{effect === 'None' ? 'Original color' : effect}<span className="ml-auto text-[9px] opacity-60">{effect === 'None' ? 'No effect' : 'Effect'}</span></div></div>
          <div className="track-row">{audio ? <div className="layer-clip audio-clip" style={{width:'94%'}}><div className="waveform">{Array.from({length:170},(_,i) => <span key={i} style={{height:4+Math.abs(Math.sin(i*2.3)*Math.cos(i*.4))*18}} />)}</div><span className="audio-name">{audio.name}</span></div> : <Button variant="tool" size="sm" className="text-[10px] text-muted-foreground" onClick={() => audioFileRef.current?.click()}><Plus size={12} />Add a soundtrack</Button>}</div>
          <div className="playhead" style={{left:`${time/duration*94}%`}} />
        </div></div>
      </div>
    </section>
    <footer className="statusbar"><div className="flex items-center gap-2"><span className="w-1 h-1 bg-primary rounded-full" />{notice || 'All good. Make something great.'}</div><div className="flex items-center gap-4 shrink-0 ml-3"><span>{ratio} <span className="desktop-only">· 30 fps</span></span><span className="desktop-only">FRAME / EDITOR</span></div></footer>
    {modal && <div className="modal-shade" onClick={() => { if (exportProgress === null) setModal(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'export' ? 'Export video' : modal === 'projects' ? 'Projects' : 'About FRAME'} onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-4"><h2>{modal === 'export' ? 'Ready for the world.' : modal === 'projects' ? 'Your next story.' : 'Meet FRAME.'}</h2><IconButton label="Close dialog" icon={X} onClick={() => { abortRef.current?.abort(); setModal(null); }} /></div>
      {modal === 'export' && <><p className="mb-5">{name} · {formatTime(duration).slice(0,5)} · {ratio}</p><div className="export-option"><span>Resolution</span><select className="field max-w-32" aria-label="Export resolution" value={exportResolution} onChange={e => setExportResolution(Number(e.target.value))} disabled={exportProgress !== null}><option value={720}>720p HD</option><option value={1080}>1080p Full HD</option></select></div><div className="export-option"><span>Format</span><span className="text-muted-foreground">WebM · 30 fps</span></div><p className="mt-4 mb-6">Video export includes your image or video, text and color. Audio is preview-only in this version. Keep this window open during export.</p>{exportProgress !== null ? <><div className="h-1 rounded-full bg-secondary overflow-hidden mb-3"><div className="h-full bg-primary" style={{width:`${exportProgress}%`}} /></div><div className="flex justify-between text-xs text-muted-foreground"><span>Creating your video…</span><span>{exportProgress}%</span></div><Button variant="outline" className="w-full mt-5" onClick={() => abortRef.current?.abort()}>Cancel export</Button></> : <Button className="w-full" onClick={() => void startExport()}><Download />Export video</Button>}</>}
      {modal === 'projects' && <><p className="mb-6">Projects are yours to keep. Download your edit settings and reopen them anytime.</p><Button variant="secondary" className="w-full mb-3" onClick={saveProject}><Download />Download current project</Button><Button variant="outline" className="w-full mb-3" onClick={() => projectFileRef.current?.click()}><FolderOpen />Open a FRAME project</Button><Button variant="tool" className="w-full" onClick={() => { remember(); setLayers([]); setName('Untitled project'); setTime(0); setPlaying(false); setEffect('None'); setAdjustments(defaultAdjustments); setModal(null); }}>Start a fresh edit<ArrowUpRight /></Button></>}
      {modal === 'help' && <><p className="mb-4">A little less friction. A lot more creativity.</p><p>Import your own video or images, add text and drag it into place. Select a text layer to resize it or give it a glow. Adjust your color, choose a ratio, and export a WebM video.</p><p className="mt-4">Your media stays on your device. Download a FRAME project to keep your edit settings. This first version doesn’t include advanced keyframe animation, multi-clip sequencing or audio export.</p></>}
    </div></div>}
  </main>;
}
