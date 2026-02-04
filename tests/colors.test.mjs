import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, luminance, saturation, lighten, brandColors, patchBrandCSS } from '../src/colors.mjs';

describe('hexToRgb', () => {
  it('parses 6-digit hex with #', () => {
    assert.deepStrictEqual(hexToRgb('#FF0000'), { r: 255, g: 0, b: 0 });
  });

  it('parses 6-digit hex without #', () => {
    assert.deepStrictEqual(hexToRgb('00FF00'), { r: 0, g: 255, b: 0 });
  });

  it('parses 3-digit shorthand', () => {
    assert.deepStrictEqual(hexToRgb('#F00'), { r: 255, g: 0, b: 0 });
  });

  it('parses black', () => {
    assert.deepStrictEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  });

  it('parses white', () => {
    assert.deepStrictEqual(hexToRgb('#FFFFFF'), { r: 255, g: 255, b: 255 });
  });

  it('parses mixed color', () => {
    assert.deepStrictEqual(hexToRgb('#8A38F5'), { r: 138, g: 56, b: 245 });
  });
});

describe('luminance', () => {
  it('returns 0 for black', () => {
    assert.strictEqual(luminance('#000000'), 0);
  });

  it('returns 1 for white', () => {
    assert.strictEqual(luminance('#FFFFFF'), 1);
  });

  it('returns value between 0 and 1 for colors', () => {
    const l = luminance('#8A38F5');
    assert.ok(l > 0 && l < 1, `Expected 0 < ${l} < 1`);
  });
});

describe('saturation', () => {
  it('returns 0 for black', () => {
    assert.strictEqual(saturation('#000000'), 0);
  });

  it('returns 0 for gray', () => {
    assert.strictEqual(saturation('#808080'), 0);
  });

  it('returns 1 for pure red', () => {
    assert.strictEqual(saturation('#FF0000'), 1);
  });
});

describe('lighten', () => {
  it('lightens a color by positive amount', () => {
    const result = lighten({ r: 100, g: 100, b: 100 }, 20);
    assert.strictEqual(result, '#787878'); // 120, 120, 120
  });

  it('darkens a color by negative amount', () => {
    const result = lighten({ r: 100, g: 100, b: 100 }, -20);
    assert.strictEqual(result, '#505050'); // 80, 80, 80
  });

  it('clamps to 0', () => {
    const result = lighten({ r: 10, g: 10, b: 10 }, -20);
    assert.strictEqual(result, '#000000');
  });

  it('clamps to 255', () => {
    const result = lighten({ r: 250, g: 250, b: 250 }, 20);
    assert.strictEqual(result, '#ffffff');
  });
});

describe('brandColors', () => {
  it('derives brand-2 as 20 darker than brand-1', () => {
    const colors = brandColors('#8A38F5');
    const rgb1 = hexToRgb('#8A38F5');
    const rgb2 = hexToRgb(colors.brand2);
    assert.strictEqual(rgb2.r, Math.max(0, rgb1.r - 20));
    assert.strictEqual(rgb2.g, Math.max(0, rgb1.g - 20));
    assert.strictEqual(rgb2.b, Math.max(0, rgb1.b - 20));
  });

  it('derives brand-3 as 40 darker than brand-1', () => {
    const colors = brandColors('#8A38F5');
    const rgb1 = hexToRgb('#8A38F5');
    const rgb3 = hexToRgb(colors.brand3);
    assert.strictEqual(rgb3.r, Math.max(0, rgb1.r - 40));
    assert.strictEqual(rgb3.g, Math.max(0, rgb1.g - 40));
    assert.strictEqual(rgb3.b, Math.max(0, rgb1.b - 40));
  });

  it('creates soft with 0.14 opacity', () => {
    const colors = brandColors('#8A38F5');
    assert.ok(colors.brandSoft.includes('0.14'));
    assert.ok(colors.brandSoft.startsWith('rgba('));
  });
});

describe('patchBrandCSS', () => {
  const sampleCSS = `:root {
  --dad-accent: #8A38F5;
  --dad-accent-dark: #6210cd;
}
.dark {
  --vp-c-brand-1: #8A38F5;
  --vp-c-brand-2: #7624e1;
  --vp-c-brand-3: #6210cd;
  --vp-c-brand-soft: rgba(138, 56, 245, 0.14);
}`;

  it('replaces all brand CSS variables', () => {
    const patched = patchBrandCSS(sampleCSS, '#4063C2');
    assert.ok(patched.includes('--vp-c-brand-1: #4063C2;'));
    assert.ok(patched.includes('--dad-accent: #4063C2;'));
    assert.ok(!patched.includes('#8A38F5'));
  });

  it('derives correct brand-2 and brand-3', () => {
    const patched = patchBrandCSS(sampleCSS, '#4063C2');
    const { brand2, brand3 } = brandColors('#4063C2');
    assert.ok(patched.includes(`--vp-c-brand-2: ${brand2};`));
    assert.ok(patched.includes(`--vp-c-brand-3: ${brand3};`));
  });

  it('updates brand-soft rgba', () => {
    const patched = patchBrandCSS(sampleCSS, '#4063C2');
    assert.ok(patched.includes('rgba(64, 99, 194, 0.14)'));
  });
});
