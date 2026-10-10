import { describe, expect, it } from 'vitest';
import { clipLength, makeClip, makeText, newProject, packLanes, projectDuration, aspectValue, type MediaAsset } from './model';

const video: MediaAsset = { id: 'v', name: 'Video', kind: 'video', duration: 8, width: 1920, height: 1080, thumbs: [] };
describe('editor rules', () => {
  it('slow motion doubles a video duration at half speed', () => {
    expect(clipLength({ ...makeClip(video, 4), speed: 0.5 })).toBe(16);
  });
  it('double speed halves the video duration', () => {
    expect(clipLength({ ...makeClip(video, 4), speed: 2 })).toBe(4);
  });
  it('keeps text in separate lanes from additions', () => {
    const text = makeText(0);
    const effect = { ...text, id: 'fx', type: 'effect' as const, effect: 'glitch' as const, intensity: 70 };
    const lanes = packLanes([effect, text]);
    expect(lanes.text).toEqual([[text]]);
    expect(lanes.visual).toEqual([[effect]]);
  });
  it('starts a project without sample media', () => {
    const p = newProject();
    expect(p.clips).toEqual([]); expect(p.layers).toEqual([]); expect(projectDuration(p)).toBe(0);
  });
  it('supports portrait and landscape ratios', () => {
    expect(aspectValue('9:16')).toBe(9 / 16);
    expect(aspectValue('16:9')).toBe(16 / 9);
  });
});