export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  ).join('');
}

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
    h *= 360;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }) {
  h /= 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function wcagLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(hex1, hex2) {
  const l1 = wcagLuminance(hex1);
  const l2 = wcagLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
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

export function adjustBrandForContrast(brandHex, bgHex, {
  minTextContrast = 4.5,
  minButtonContrast = 3.0,
} = {}) {
  // Check if already accessible
  const textCR = contrastRatio(brandHex, bgHex);
  const btnCR = contrastRatio(brandHex, '#FFFFFF');
  if (textCR >= minTextContrast && btnCR >= minButtonContrast) {
    return brandHex;
  }

  const rgb = hexToRgb(brandHex);
  const hsl = rgbToHsl(rgb);

  // Binary search on lightness to find valid range closest to original
  // Search direction for text contrast depends on background brightness:
  //   dark bg → brand must be lighter (increase lightness)
  //   light bg → brand must be darker (decrease lightness)
  const bgIsLight = wcagLuminance(bgHex) > 0.5;
  let lo = 0, hi = 1;
  let bestHex = brandHex;
  let bestScore = -Infinity;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const candidate = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: mid }));
    const textC = contrastRatio(candidate, bgHex);
    const btnC = contrastRatio(candidate, '#FFFFFF');

    const valid = textC >= minTextContrast && btnC >= minButtonContrast;
    if (valid) {
      const score = -Math.abs(mid - hsl.l);
      if (score > bestScore) {
        bestScore = score;
        bestHex = candidate;
      }
    }

    if (textC < minTextContrast) {
      if (bgIsLight) {
        hi = mid; // need darker on light bg
      } else {
        lo = mid; // need lighter on dark bg
      }
    } else if (btnC < minButtonContrast) {
      hi = mid; // need darker (white text on brand)
    } else {
      // Both satisfied — converge toward original lightness
      if (mid < hsl.l) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
  }

  return bestHex;
}

export function brandColors(hex, bgHex) {
  const adjusted = bgHex ? adjustBrandForContrast(hex, bgHex) : hex;
  const rgb = hexToRgb(adjusted);
  return {
    brand1: adjusted,
    brand2: lighten(rgb, -20),
    brand3: lighten(rgb, -40),
    brandSoft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
  };
}

function patchSection(section, colors) {
  section = section.replace(/--vp-c-brand-1:[^;]+;/, `--vp-c-brand-1: ${colors.brand1};`);
  section = section.replace(/--vp-c-brand-2:[^;]+;/, `--vp-c-brand-2: ${colors.brand2};`);
  section = section.replace(/--vp-c-brand-3:[^;]+;/, `--vp-c-brand-3: ${colors.brand3};`);
  section = section.replace(/--vp-c-brand-soft:[^;]+;/, `--vp-c-brand-soft: ${colors.brandSoft};`);
  section = section.replace(/--dad-accent:[^;]+;/, `--dad-accent: ${colors.brand1};`);
  section = section.replace(/--dad-accent-dark:[^;]+;/, `--dad-accent-dark: ${colors.brand3};`);
  return section;
}

export function patchBrandCSS(css, brandColor) {
  const bgMatch = css.match(/--dad-bg:\s*(#[0-9a-fA-F]{6})/);
  const darkBgHex = bgMatch ? bgMatch[1] : null;

  // Light mode: adjust for white background
  const light = brandColors(brandColor, '#ffffff');
  // Dark mode: adjust for the theme's dark background
  const dark = brandColors(brandColor, darkBgHex);

  // Split at .dark boundary to patch each section independently
  const darkIdx = css.indexOf('.dark');
  if (darkIdx === -1) {
    // No .dark section — patch everything with dark colors (backward compat)
    return patchSection(css, dark);
  }

  let rootSection = css.substring(0, darkIdx);
  let darkSection = css.substring(darkIdx);

  rootSection = patchSection(rootSection, light);
  darkSection = patchSection(darkSection, dark);

  return rootSection + darkSection;
}
