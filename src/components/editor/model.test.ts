import { describe, expect, it } from 'vitest';
import { ANIMATIONS, LOOP_ANIMATIONS, TEXT_PRESETS, layerAnim, clipLength, makeClip, makeText, newProject, packLanes, projectDuration, aspectValue, type MediaAsset } from './model';

const video: MediaAsset = { id: 'v', name: 'Video', kind: 'video', duration: 8, width: 1920, height: 1080, thumbs: [] };
describe('editor rules', () => {
  it('keeps new text and every template stationary until animation is selected', () => {
    for (const patch of [{}, ...TEXT_PRESETS.map(p => p.patch)]) {
      const layer = makeText(0, patch);
      expect(layer.animIn).toBe('none');
      expect(layer.animOut).toBe('none');
      expect(layerAnim(layer, 0)).toMatchObject({ opacity: 1, scale: 1, dx: 0, dy: 0, rotation: 0 });
    }
  });
  it('evaluates all optional animations without invalid values', () => {
    for (const animation of ANIMATIONS) {
      for (const time of [0, 0.15, 2, 3.9, 4]) {
        const frame = layerAnim(makeText(0, { animIn: animation.id, animOut: animation.id }), time);
        expect(Object.values(frame).every(Number.isFinite)).toBe(true);
      }
    }
    for (const animation of LOOP_ANIMATIONS) {
      expect(Object.values(layerAnim(makeText(0, { animLoop: animation.id }), 0.2)).every(Number.isFinite)).toBe(true);
    }
  });
  it('respects custom duration and clears loop motion with None', () => {
    expect(layerAnim(makeText(0, { animIn: 'fade', animDuration: 2 }), 0.5).opacity).toBeLessThan(1);
    expect(layerAnim(makeText(0, { animLoop: 'float' }), 0.25).dy).not.toBe(0);
    expect(layerAnim(makeText(0, { animLoop: 'none' }), 0.25).dy).toBe(0);
  });
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