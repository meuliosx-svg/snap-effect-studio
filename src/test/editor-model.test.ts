import { describe, expect, it } from 'vitest';
import { formatTime, getFilter, initialText } from '@/components/editor/model';

describe('Editor model', () => {
  it('formats the playback clock', () => {
    expect(formatTime(4.2)).toBe('00:04.20');
    expect(formatTime(75)).toBe('01:15.00');
  });
  it('combines color correction and effects', () => {
    expect(getFilter({ brightness: 110, contrast: 120, saturation: 90, warmth: 0 }, 'Mono')).toContain('brightness(1.1) contrast(1.2) saturate(0.9)');
    expect(getFilter({ brightness: 100, contrast: 100, saturation: 100, warmth: 0 }, 'Mono')).toContain('grayscale(1)');
  });
  it('starts with a bounded editable text layer', () => {
    const layer = initialText[0];
    expect(layer).toBeDefined();
    if (!layer) return;
    expect(layer.x + layer.width).toBeLessThanOrEqual(100);
    expect(layer.y + layer.height).toBeLessThanOrEqual(100);
    expect(layer.end).toBeGreaterThan(layer.start);
  });
});