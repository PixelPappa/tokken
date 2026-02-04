import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb,
  luminance, wcagLuminance, contrastRatio,
  saturation, lighten,
  adjustBrandForContrast, brandColors, patchBrandCSS,
} from '../src/colors.mjs';

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

describe('rgbToHex', () => {
  it('converts RGB to hex', () => {
    assert.strictEqual(rgbToHex({ r: 255, g: 0, b: 0 }), '#ff0000');
  });

  it('pads single digits', () => {
    assert.strictEqual(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
  });

  it('clamps values', () => {
    assert.strictEqual(rgbToHex({ r: 300, g: -10, b: 128 }), '#ff0080');
  });
});

describe('rgbToHsl / hslToRgb round-trip', () => {
  const cases = ['#FF0000', '#00FF00', '#0000FF', '#8A38F5', '#FFFFFF', '#000000', '#808080'];
  for (const hex of cases) {
    it(`round-trips ${hex}`, () => {
      const rgb = hexToRgb(hex);
      const hsl = rgbToHsl(rgb);
      const back = hslToRgb(hsl);
      assert.ok(Math.abs(back.r - rgb.r) <= 1, `r: ${back.r} vs ${rgb.r}`);
      assert.ok(Math.abs(back.g - rgb.g) <= 1, `g: ${back.g} vs ${rgb.g}`);
      assert.ok(Math.abs(back.b - rgb.b) <= 1, `b: ${back.b} vs ${rgb.b}`);
    });
  }
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

describe('wcagLuminance', () => {
  it('returns 0 for black', () => {
    assert.strictEqual(wcagLuminance('#000000'), 0);
  });

  it('returns ~1 for white', () => {
    assert.ok(Math.abs(wcagLuminance('#FFFFFF') - 1) < 0.001);
  });

  it('returns ~0.2126 for pure red', () => {
    assert.ok(Math.abs(wcagLuminance('#FF0000') - 0.2126) < 0.001);
  });

  it('returns ~0.0722 for pure blue', () => {
    assert.ok(Math.abs(wcagLuminance('#0000FF') - 0.0722) < 0.001);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black vs white', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.1);
  });

  it('returns 1 for same color', () => {
    assert.ok(Math.abs(contrastRatio('#808080', '#808080') - 1) < 0.01);
  });

  it('is symmetric', () => {
    const ab = contrastRatio('#FF6600', '#000000');
    const ba = contrastRatio('#000000', '#FF6600');
    assert.strictEqual(ab.toFixed(4), ba.toFixed(4));
  });

  it('mid-gray vs black is about 5.3:1', () => {
    const cr = contrastRatio('#808080', '#000000');
    assert.ok(cr > 5 && cr < 6, `Expected ~5.3, got ${cr}`);
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
    assert.strictEqual(result, '#787878');
  });

  it('darkens a color by negative amount', () => {
    const result = lighten({ r: 100, g: 100, b: 100 }, -20);
    assert.strictEqual(result, '#505050');
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

describe('adjustBrandForContrast', () => {
  it('does not adjust a color that already passes', () => {
    // #6688cc on black: text contrast ~6.2, button contrast ~3.4
    const result = adjustBrandForContrast('#6688cc', '#000000');
    assert.strictEqual(result, '#6688cc');
  });

  it('lightens a dark brand color for readability on black', () => {
    const adjusted = adjustBrandForContrast('#1a1a80', '#000000');
    const cr = contrastRatio(adjusted, '#000000');
    assert.ok(cr >= 4.5, `Text contrast ${cr.toFixed(2)} should be >= 4.5`);
  });

  it('ensures white-on-brand button contrast', () => {
    // Very light color that would fail button contrast
    const adjusted = adjustBrandForContrast('#ccccff', '#000000');
    const btnCR = contrastRatio(adjusted, '#FFFFFF');
    assert.ok(btnCR >= 3.0, `Button contrast ${btnCR.toFixed(2)} should be >= 3.0`);
  });

  it('preserves hue after adjustment', () => {
    const originalHsl = rgbToHsl(hexToRgb('#1a1a80'));
    const adjusted = adjustBrandForContrast('#1a1a80', '#000000');
    const adjustedHsl = rgbToHsl(hexToRgb(adjusted));
    assert.ok(Math.abs(adjustedHsl.h - originalHsl.h) < 2, `Hue ${adjustedHsl.h} should be close to ${originalHsl.h}`);
  });

  it('preserves saturation after adjustment', () => {
    const originalHsl = rgbToHsl(hexToRgb('#1a1a80'));
    const adjusted = adjustBrandForContrast('#1a1a80', '#000000');
    const adjustedHsl = rgbToHsl(hexToRgb(adjusted));
    assert.ok(Math.abs(adjustedHsl.s - originalHsl.s) < 0.02, `Saturation ${adjustedHsl.s} should be close to ${originalHsl.s}`);
  });

  it('adjusts mid-range purple to meet both thresholds', () => {
    // #8A38F5 has ~4.18 contrast on black (below 4.5) — gets slightly lightened
    const adjusted = adjustBrandForContrast('#8A38F5', '#000000');
    const textCR = contrastRatio(adjusted, '#000000');
    const btnCR = contrastRatio(adjusted, '#FFFFFF');
    assert.ok(textCR >= 4.5, `Text contrast ${textCR.toFixed(2)}`);
    assert.ok(btnCR >= 3.0, `Button contrast ${btnCR.toFixed(2)}`);
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

  it('adjusts brand1 when background is provided', () => {
    const colors = brandColors('#1a1a80', '#000000');
    const cr = contrastRatio(colors.brand1, '#000000');
    assert.ok(cr >= 4.5, `Adjusted brand1 contrast ${cr.toFixed(2)} should be >= 4.5`);
  });

  it('does not adjust when no background is provided', () => {
    const colors = brandColors('#1a1a80');
    assert.strictEqual(colors.brand1, '#1a1a80');
  });
});

describe('patchBrandCSS', () => {
  const sampleCSS = `:root {
  --dad-bg: #000000;
  --dad-accent: #8A38F5;
  --dad-accent-dark: #6210cd;
  --vp-c-brand-1: #8A38F5;
  --vp-c-brand-2: #7624e1;
  --vp-c-brand-3: #6210cd;
  --vp-c-brand-soft: rgba(138, 56, 245, 0.14);
}
.dark {
  --dad-accent: #8A38F5;
  --dad-accent-dark: #6210cd;
  --vp-c-brand-1: #8A38F5;
  --vp-c-brand-2: #7624e1;
  --vp-c-brand-3: #6210cd;
  --vp-c-brand-soft: rgba(138, 56, 245, 0.14);
}`;

  function splitSections(css) {
    const darkIdx = css.indexOf('.dark');
    return { root: css.substring(0, darkIdx), dark: css.substring(darkIdx) };
  }

  it('replaces all brand CSS variables in both sections', () => {
    const patched = patchBrandCSS(sampleCSS, '#4063C2');
    assert.ok(!patched.includes('#8A38F5'), 'old brand color should be gone');
    const { root, dark } = splitSections(patched);
    assert.ok(root.includes('--vp-c-brand-1:'), 'root should have brand-1');
    assert.ok(dark.includes('--vp-c-brand-1:'), 'dark should have brand-1');
    assert.ok(root.includes('--dad-accent:'), 'root should have dad-accent');
    assert.ok(dark.includes('--dad-accent:'), 'dark should have dad-accent');
  });

  it('adjusts dark-mode brand for contrast against dark background', () => {
    // #1a1a80 is very dark on #000000 background — should be lightened in dark mode
    const patched = patchBrandCSS(sampleCSS, '#1a1a80');
    const { dark } = splitSections(patched);
    const brandMatch = dark.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(brandMatch, 'dark brand-1 should exist');
    const cr = contrastRatio(brandMatch[1], '#000000');
    assert.ok(cr >= 4.5, `Dark brand-1 contrast ${cr.toFixed(2)} should be >= 4.5`);
  });

  it('adjusts light-mode brand for contrast against white', () => {
    // #ccccff is very light on white — should be darkened for light mode
    const patched = patchBrandCSS(sampleCSS, '#ccccff');
    const { root } = splitSections(patched);
    const brandMatch = root.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(brandMatch, 'light brand-1 should exist');
    const cr = contrastRatio(brandMatch[1], '#ffffff');
    assert.ok(cr >= 4.5, `Light brand-1 contrast ${cr.toFixed(2)} should be >= 4.5 on white`);
  });

  it('uses different brand values for light vs dark mode', () => {
    // #1a1a80 needs lightening on black (dark mode) but darkening on white (light mode)
    const patched = patchBrandCSS(sampleCSS, '#1a1a80');
    const { root, dark } = splitSections(patched);
    const lightBrand = root.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    const darkBrand = dark.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(lightBrand && darkBrand);
    assert.notStrictEqual(lightBrand[1], darkBrand[1], 'light and dark brand-1 should differ');
  });

  it('updates brand-soft rgba in both sections', () => {
    const patched = patchBrandCSS(sampleCSS, '#4063C2');
    const { root, dark } = splitSections(patched);
    assert.ok(root.includes('rgba(') && root.includes('0.14)'), 'root should have rgba soft');
    assert.ok(dark.includes('rgba(') && dark.includes('0.14)'), 'dark should have rgba soft');
  });
});
