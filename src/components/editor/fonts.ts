import { getBlob, putBlob } from './storage';
import { uid, type Project, type ProjectFont } from './model';

const loaded = new Map<string, Promise<void>>();
export function loadFont(font: ProjectFont, blob?: Blob): Promise<void> {
  const existing = loaded.get(font.id);
  if (existing) return existing;
  const pending = (async () => {
    const source = blob ?? await getBlob(font.id);
    if (!source) throw new Error(`Missing font: ${font.name}`);
    const face = new FontFace(font.family, await source.arrayBuffer());
    await face.load();
    document.fonts.add(face);
  })();
  loaded.set(font.id, pending);
  void pending.catch(() => loaded.delete(font.id));
  return pending;
}
export async function importFont(file: File): Promise<ProjectFont> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error('Choose a TTF, OTF, WOFF or WOFF2 font');
  const id = uid('font');
  const font = { id, family: id, name: file.name.replace(/\.[^.]+$/, '') };
  await loadFont(font, file);
  await putBlob(id, file);
  return font;
}
export async function loadProjectFonts(project: Project) {
  await Promise.all((project.fonts ?? []).map(font => loadFont(font)));
}