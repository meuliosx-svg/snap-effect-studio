// On-device background removal for photos. The library is loaded only when used (browser-only).
import { importFile } from './media';
import { getBlob } from './storage';
import type { MediaAsset } from './model';

export async function removeBackground(asset: MediaAsset): Promise<MediaAsset> {
  if (asset.kind !== 'image') throw new Error('Background removal works on photos.');
  const blob = await getBlob(asset.id);
  if (!blob) throw new Error('Original photo not found.');
  const { removeBackground: run } = await import('@imgly/background-removal');
  const out = await run(blob, { output: { format: 'image/png' } });
  return importFile(new Blob([out], { type: 'image/png' }), `${asset.name.replace(/\.[^.]+$/, '')} (no bg).png`);
}
