import { useEffect, useState } from 'react';
import { Plus, Trash2, Film } from 'lucide-react';
import Editor from './Editor';
import { deleteProject, getProject, listProjects, loadProjectMedia, putProject } from './storage';
import { ASPECTS, formatShort, newProject, projectDuration, type Aspect, type Project } from './model';

export default function App() {
  const [open, setOpen] = useState<Project | null>(null);
  const [list, setList] = useState<Project[]>([]);
  const refresh = () => { void listProjects().then(setList).catch(() => setList([])); };
  useEffect(refresh, [open]);
  const create = async (a: Aspect) => { const p = newProject(a, `Project ${list.length + 1}`); await putProject(p); setOpen(p); };
  const openP = async (id: string) => { const p = await getProject(id); if (!p) return; await loadProjectMedia(p); setOpen(p); };
  if (open) return <Editor key={open.id} initial={open} onExit={() => setOpen(null)} />;
  return <main className="home">
    <h1 className="home-brand"><span className="brand-mark" /> FRAME</h1>
    <p className="muted">New project</p>
    <div className="home-new">{ASPECTS.map(a => <button key={a} className="new-card" onClick={() => void create(a)}><Plus /><b>{a}</b></button>)}</div>
    <p className="muted">Your projects</p>
    {!list.length && <p className="muted small">No projects yet — start one above. Everything stays on this device.</p>}
    <div className="home-list">{list.map(p => { const first = p.clips[0]; const th = first ? p.media[first.mediaId]?.thumbs[0] : undefined; return <div key={p.id} className="proj" onClick={() => void openP(p.id)}>
      <div className="proj-th">{th ? <img src={th} alt="" /> : <Film />}</div>
      <div className="proj-info"><b>{p.name}</b><small>{p.aspect} · {formatShort(projectDuration(p))}</small></div>
      <button className="ic" aria-label="Delete project" onClick={e => { e.stopPropagation(); if (confirm('Delete this project?')) void deleteProject(p).then(refresh); }}><Trash2 /></button>
    </div>; })}</div>
  </main>;
}
