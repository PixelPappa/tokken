export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function saturation(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === 0) return 0;
  return (max - min) / max;
}

export function lighten(rgb, amount) {
  return '#' + [
    Math.max(0, Math.min(255, Math.round(rgb.r + amount))),
    Math.max(0, Math.min(255, Math.round(rgb.g + amount))),
    Math.max(0, Math.min(255, Math.round(rgb.b + amount))),
  ].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function brandColors(hex) {
  const rgb = hexToRgb(hex);
  return {
    brand1: hex,
    brand2: lighten(rgb, -20),
    brand3: lighten(rgb, -40),
    brandSoft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
  };
}

export function patchBrandCSS(css, brandColor) {
  const { brand1, brand2, brand3, brandSoft } = brandColors(brandColor);
  css = css.replace(/--vp-c-brand-1:[^;]+;/, `--vp-c-brand-1: ${brand1};`);
  css = css.replace(/--vp-c-brand-2:[^;]+;/, `--vp-c-brand-2: ${brand2};`);
  css = css.replace(/--vp-c-brand-3:[^;]+;/, `--vp-c-brand-3: ${brand3};`);
  css = css.replace(/--vp-c-brand-soft:[^;]+;/, `--vp-c-brand-soft: ${brandSoft};`);
  css = css.replace(/--dad-accent:[^;]+;/, `--dad-accent: ${brand1};`);
  css = css.replace(/--dad-accent-dark:[^;]+;/, `--dad-accent-dark: ${brand3};`);
  return css;
}
