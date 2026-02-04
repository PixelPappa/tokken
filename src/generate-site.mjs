#!/usr/bin/env node

// ============================================================================
// generate-site.mjs
//
// Takes Figma extraction output (design-tokens.json, manifest.json, component
// PNGs, icon SVGs) and generates a complete VitePress documentation site.
//
// ZERO external dependencies -- only Node built-ins.
//
// Usage:
//   node tools/figma/generate-site.mjs \
//     --input <extraction-dir> \
//     --output <site-dir> \
//     [--install] [--build]
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 1. CLI argument parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { input: null, output: null, install: false, build: false, brandColor: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        opts.input = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--install':
        opts.install = true;
        break;
      case '--build':
        opts.build = true;
        break;
      case '--brand-color':
        opts.brandColor = args[++i];
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.input || !opts.output) {
    console.error(
      'Usage: node generate-site.mjs --input <extraction-dir> --output <site-dir> [--install] [--build] [--brand-color #hex]'
    );
    process.exit(1);
  }

  opts.input = path.resolve(opts.input);
  opts.output = path.resolve(opts.output);
  return opts;
}

// ============================================================================
// 2. Filesystem helpers
// ============================================================================

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filepath, content) {
  mkdirp(path.dirname(filepath));
  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`  wrote ${path.relative(process.cwd(), filepath)}`);
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(srcDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isFile()) {
      copyFile(srcPath, destPath);
      count++;
    } else if (stat.isDirectory()) {
      count += copyDir(srcPath, destPath);
    }
  }
  return count;
}

function readJSON(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

// ============================================================================
// 3. Slug / naming helpers
// ============================================================================

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanPropertyName(name) {
  // Strip "#NN:NN" suffixes that Figma adds
  return name.replace(/#\d+:\d+$/, '').trim();
}

function componentImageSlug(name) {
  return slugify(name);
}

// ============================================================================
// 4. Color / luminance utilities (from src/colors.mjs)
// ============================================================================

import { hexToRgb, luminance, saturation, lighten, adjustBrandForContrast, brandColors, patchBrandCSS } from './colors.mjs';

function rgbaToCSS(color, opacity) {
  if (!color) return 'rgba(0,0,0,0.25)';
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = opacity != null ? opacity : (color.a != null ? color.a : 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function effectToCSS(effect) {
  if (!effect || effect.type !== 'DROP_SHADOW') return null;
  const color = rgbaToCSS(effect.color, effect.color?.a);
  const x = effect.offset?.x || 0;
  const y = effect.offset?.y || 0;
  const blur = effect.radius || 0;
  const spread = effect.spread || 0;
  return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

// ============================================================================
// 5. Google Fonts helper
// ============================================================================

const GOOGLE_FONTS = [
  'Open Sans', 'Roboto', 'Inter', 'Lato', 'Montserrat', 'Poppins',
  'Raleway', 'Nunito', 'Source Sans Pro', 'PT Sans', 'Merriweather',
  'Playfair Display', 'Oswald', 'Noto Sans', 'Rubik', 'Work Sans',
  'DM Sans', 'Manrope', 'Figtree', 'Plus Jakarta Sans',
];

function googleFontsLink(families) {
  const matched = families.filter(f =>
    GOOGLE_FONTS.some(gf => gf.toLowerCase() === f.toLowerCase())
  );
  if (matched.length === 0) return '';
  const params = matched
    .map(f => `family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

// ============================================================================
// 6. Token strategy: pick published or raw
// ============================================================================

function resolveColors(tokens) {
  const pub = tokens.publishedStyles?.colors;
  if (pub && pub.length > 0) return { source: 'published', data: pub };
  return { source: 'none', data: [] };
}

function resolveTypography(tokens) {
  const pub = tokens.publishedStyles?.textStyles;
  if (pub && pub.length > 0) return { source: 'published', data: pub };
  return { source: 'none', data: [] };
}

function resolveEffects(tokens) {
  const pub = tokens.publishedStyles?.effectStyles;
  if (pub && pub.length > 0) return { source: 'published', data: pub };
  return { source: 'none', data: [] };
}

// ============================================================================
// 7. Component classification: icons vs UI components
// ============================================================================

function isIcon(comp) {
  return (
    comp.variantCount === 0 &&
    (!comp.properties || Object.keys(comp.properties).length === 0) &&
    /^[a-z0-9_/\-]+$/.test(comp.name)
  );
}

function separateComponents(tokens) {
  const comps = tokens.components || [];
  const icons = [];
  const uiComps = [];
  for (const c of comps) {
    if (isIcon(c)) {
      icons.push(c);
    } else {
      uiComps.push(c);
    }
  }
  return { icons, uiComps };
}

function groupComponentsByGroup(uiComps, pageOrder) {
  const groups = {};
  for (const c of uiComps) {
    const g = c.group || 'Ungrouped';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  }

  // Order by pageOrder, filtering non-component pages like "Cover"
  const nonComponentPages = new Set(['Cover', 'Icons', 'Thumbnail']);
  const ordered = [];
  if (pageOrder && pageOrder.length > 0) {
    for (const page of pageOrder) {
      if (nonComponentPages.has(page)) continue;
      if (groups[page]) {
        ordered.push({ name: page, components: groups[page] });
        delete groups[page];
      }
    }
  }
  // Remaining groups not in pageOrder
  for (const [name, components] of Object.entries(groups)) {
    ordered.push({ name, components });
  }
  return ordered;
}

// ============================================================================
// 8. CSS theme derivation from extracted colors
// ============================================================================

function deriveTheme(tokens, brandColor) {
  const rawColors = tokens.colors || {};
  const hexes = Object.keys(rawColors);

  const fallbackAccent = '#d0bcfe';
  const fallbackLightBrand = brandColors(fallbackAccent, '#ffffff');
  const fallback = {
    bg: '#141218',
    bgSurface: '#1d1b20',
    bgElevated: '#232028',
    bgMute: '#2b2930',
    bgSoft: '#211f26',
    textPrimary: '#e6e0e9',
    textSecondary: '#cac4d0',
    textMuted: '#938f99',
    accent: fallbackAccent,
    accentDark: '#381e72',
    border: '#49454f',
    success: '#a8db8f',
    vpBrand1: fallbackAccent,
    vpBrand2: '#b69df8',
    vpBrand3: '#9a82db',
    vpBrandSoft: 'rgba(208, 188, 254, 0.14)',
    vpBrand1Light: fallbackLightBrand.brand1,
    vpBrand2Light: fallbackLightBrand.brand2,
    vpBrand3Light: fallbackLightBrand.brand3,
    vpBrandSoftLight: fallbackLightBrand.brandSoft,
    accentLight: fallbackLightBrand.brand1,
    accentDarkLight: fallbackLightBrand.brand3,
  };

  if (hexes.length < 3) return fallback;

  // Sort by luminance
  const sorted = hexes
    .filter(h => /^#[0-9a-fA-F]{6}$/.test(h))
    .sort((a, b) => luminance(a) - luminance(b));

  if (sorted.length < 3) return fallback;

  const darkest = sorted[0];
  const lightest = sorted[sorted.length - 1];

  // Find the most saturated mid-tone for accent
  const midRange = sorted.slice(
    Math.floor(sorted.length * 0.2),
    Math.ceil(sorted.length * 0.8)
  );
  let accent = fallback.accent;
  let maxSat = 0;
  for (const h of midRange) {
    const s = saturation(h);
    if (s > maxSat) {
      maxSat = s;
      accent = h;
    }
  }
  if (maxSat < 0.1) accent = fallback.accent;

  // Override accent with user-specified brand color
  if (brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    accent = brandColor;
  }

  // Keep raw accent before mode-specific adjustments
  const rawAccent = accent;

  // Ensure accent meets WCAG AA contrast against the dark background
  accent = adjustBrandForContrast(rawAccent, darkest);

  // Derive light-mode brand: adjust for white background
  const lightBrand = brandColors(rawAccent, '#ffffff');

  // Derive surface colors from darkest
  const darkRgb = hexToRgb(darkest);

  return {
    bg: darkest,
    bgSurface: lighten(darkRgb, 10),
    bgElevated: lighten(darkRgb, 18),
    bgMute: lighten(darkRgb, 26),
    bgSoft: lighten(darkRgb, 8),
    textPrimary: lightest,
    textSecondary: luminance(lightest) > 0.7 ? lighten(hexToRgb(lightest), -30) : lightest,
    textMuted: luminance(lightest) > 0.5 ? lighten(hexToRgb(lightest), -70) : '#938f99',
    accent,
    accentDark: lighten(hexToRgb(accent), -60),
    border: lighten(darkRgb, 40),
    success: '#a8db8f',
    vpBrand1: accent,
    vpBrand2: lighten(hexToRgb(accent), -20),
    vpBrand3: lighten(hexToRgb(accent), -40),
    vpBrandSoft: `rgba(${hexToRgb(accent).r}, ${hexToRgb(accent).g}, ${hexToRgb(accent).b}, 0.14)`,
    // Light-mode brand variants (adjusted for white background)
    vpBrand1Light: lightBrand.brand1,
    vpBrand2Light: lightBrand.brand2,
    vpBrand3Light: lightBrand.brand3,
    vpBrandSoftLight: lightBrand.brandSoft,
    accentLight: lightBrand.brand1,
    accentDarkLight: lightBrand.brand3,
  };
}

// ============================================================================
// 9. Extract unique font families
// ============================================================================

function extractFontFamilies(tokens) {
  const families = new Set();

  // Only from published text styles
  const pubText = tokens.publishedStyles?.textStyles || [];
  for (const t of pubText) {
    if (t.fontFamily) families.add(t.fontFamily);
  }

  return [...families];
}

function getMostUsedFont(tokens) {
  const counts = {};
  const rawTypo = tokens.typography || {};
  for (const val of Object.values(rawTypo)) {
    if (val.fontFamily) {
      counts[val.fontFamily] = (counts[val.fontFamily] || 0) + 1;
    }
  }
  let best = 'Open Sans';
  let bestCount = 0;
  for (const [fam, c] of Object.entries(counts)) {
    if (c > bestCount) {
      bestCount = c;
      best = fam;
    }
  }
  return best;
}

// ============================================================================
// 10. File generators
// ============================================================================

// ---------- package.json ----------
function genPackageJson() {
  return JSON.stringify(
    {
      name: 'design-system-docs',
      version: '1.0.0',
      private: true,
      scripts: {
        'docs:dev': 'vitepress dev docs',
        'docs:build': 'vitepress build docs',
        'docs:preview': 'vitepress preview docs',
      },
      devDependencies: {
        vitepress: '^1.6.3',
        vue: '^3.5.13',
      },
    },
    null,
    2
  );
}

// ---------- .vitepress/config.mts ----------
function deriveSiteTitle(manifest) {
  const name = manifest.fileName || '';
  if (name && !/^(untitled|document)$/i.test(name)) return name;
  const url = manifest.figmaUrl || '';
  const slug = url.split('/').pop() || '';
  if (slug) {
    const decoded = decodeURIComponent(slug).replace(/\?.*$/, '').replace(/---/g, ' - ').replace(/-/g, ' ').trim();
    if (decoded) return decoded;
  }
  return name || 'Design System';
}

function genVitepressConfig(manifest, tokens, groups, hasIcons, hasColors, hasTypography, hasEffects, fontFamilies, outputDir, hasResources) {
  const fileName = deriveSiteTitle(manifest);
  const fontsLink = googleFontsLink(fontFamilies);

  const sidebarTokens = [];
  if (hasColors) sidebarTokens.push({ text: 'Colors', link: '/tokens/colors' });
  if (hasTypography) sidebarTokens.push({ text: 'Typography', link: '/tokens/typography' });
  if (hasEffects) sidebarTokens.push({ text: 'Shadows', link: '/tokens/shadows' });

  const sidebarComponents = [
    { text: 'Overview', link: '/components/' },
  ];
  for (const g of groups) {
    sidebarComponents.push({
      text: g.name,
      link: `/components/${slugify(g.name)}`,
    });
  }
  if (hasIcons) {
    sidebarComponents.push({ text: 'Icons', link: '/components/icons' });
  }

  const sidebarResources = [];
  if (hasResources) {
    sidebarResources.push({ text: 'CSS Framework', link: '/resources/css-framework' });
    sidebarResources.push({ text: 'AI-Ready Spec', link: '/resources/ai-spec' });
  }

  // Recovery script: survives Vite HMR page reloads via sessionStorage.
  // If Vue doesn't mount within 3s (white page), shows overlay and polls.
  const reloadScript = `;(function(){if(!sessionStorage.getItem('tokken-reloading'))return;window.__tokkenReloadTimer=setTimeout(function(){var s=document.createElement('style');s.textContent='@keyframes _ts{to{transform:rotate(360deg)}}';document.head.appendChild(s);var el=document.createElement('div');el.id='tokken-reload-overlay';el.style.cssText='position:fixed;inset:0;z-index:999999;background:#1b1b1f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';el.innerHTML='<div style=\"width:36px;height:36px;border:3px solid rgba(255,255,255,0.1);border-top-color:#646cff;border-radius:50%;animation:_ts .8s linear infinite\"></div><div style=\"color:rgba(255,255,255,0.8);font-size:14px;font-family:system-ui,sans-serif\">Reloading with updated content\\\\u2026</div>';document.body.appendChild(el);window.__tokkenPoll=setInterval(function(){fetch('/',{cache:'no-store'}).then(function(r){if(r.ok){clearInterval(window.__tokkenPoll);sessionStorage.removeItem('tokken-reloading');window.location.href=window.location.origin+'/'}}).catch(function(){})},1500)},3000)})();`;

  const headTags = [];
  headTags.push(`    ['script', {}, ${JSON.stringify(reloadScript)}]`);
  if (fontsLink) {
    headTags.push(`    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }]`);
    headTags.push(`    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }]`);
    headTags.push(`    ['link', { rel: 'stylesheet', href: '${fontsLink}' }]`);
  }

  const headSection = `\n  head: [\n${headTags.join(',\n')}\n  ],\n`;

  return `import { defineConfig } from 'vitepress'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { patchBrandCSS } from './brand-utils.mjs'

const __configDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(__configDir, '../..')

function isLocalhost(req: any): boolean {
  const addr = req.socket?.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

export default defineConfig({
  title: '${fileName.replace(/'/g, "\\'")}',
  description: 'Design system documentation generated from Figma',${headSection}
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },${sidebarTokens.length > 0 ? `
      { text: 'Tokens', link: '${sidebarTokens[0].link}' },` : ''}
      { text: 'Components', link: '/components/' },${sidebarResources.length > 0 ? `
      { text: 'Resources', link: '${sidebarResources[0].link}' },` : ''}
    ],
    sidebar: {${sidebarTokens.length > 0 ? `
      '/tokens/': [
        {
          text: 'Design Tokens',
          items: ${JSON.stringify(sidebarTokens, null, 12).replace(/^/gm, '          ').trim()},
        },
      ],` : ''}
      '/components/': [
        {
          text: 'Components',
          items: ${JSON.stringify(sidebarComponents, null, 12).replace(/^/gm, '          ').trim()},
        },
      ],${sidebarResources.length > 0 ? `
      '/resources/': [
        {
          text: 'Resources',
          items: ${JSON.stringify(sidebarResources, null, 12).replace(/^/gm, '          ').trim()},
        },
      ],` : ''}
    },
    socialLinks: [
      ${manifest.figmaUrl ? `{ icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5zM5 12a3.5 3.5 0 0 1 3.5-3.5H12v7H8.5A3.5 3.5 0 0 1 5 12zm0 6.5A3.5 3.5 0 0 1 8.5 15H12v3.5a3.5 3.5 0 1 1-7 0zM12 2h3.5a3.5 3.5 0 1 1 0 7H12V2zm0 6.5h3.5a3.5 3.5 0 1 1 0 7H12v-7z"/></svg>' }, link: '${manifest.figmaUrl}' }` : ''}
    ],
  },
  vite: {
    plugins: [{
      name: 'figma-sync',
      configureServer(server) {
        server.middlewares.use('/__figma-sync', (req: any, res: any, next: any) => {
          if (req.method !== 'POST') return next()

          let body = ''
          req.on('data', (c: Buffer) => body += c)
          req.on('end', () => {
            const { url } = JSON.parse(body)
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')

            const write = (text: string) => { try { res.write(text + '\\n') } catch {} }
            write('[sync] Syncing from Figma...')

            const sync = spawn('npx', ['tokken', 'sync', url, '--output', projectDir], {
              cwd: projectDir, env: { ...process.env }, shell: true
            })

            sync.stdout.on('data', (d: Buffer) => write(d.toString().trimEnd()))
            sync.stderr.on('data', (d: Buffer) => write(d.toString().trimEnd()))

            sync.on('close', (code: number) => {
              write(code === 0 ? '[done] Sync complete!' : \`[error] Sync failed (exit code \${code})\`)
              res.end()
            })
          })
        })

        // Settings endpoint: update token/URL/brandColor
        server.middlewares.use('/__tokken-setup', (req: any, res: any, next: any) => {
          if (req.method !== 'POST') return next()
          if (!isLocalhost(req)) {
            res.statusCode = 403
            res.end('Forbidden: setup endpoint is only available from localhost')
            return
          }

          let body = ''
          req.on('data', (c: Buffer) => body += c)
          req.on('end', () => {
            try {
              const { token: newToken, url, brandColor } = JSON.parse(body)
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.setHeader('Cache-Control', 'no-cache')
              const write = (text: string) => { try { res.write(text + '\\n') } catch {} }

              if (!url) {
                write('[error] Figma URL is required')
                res.end()
                return
              }

              // Read existing config to detect what changed
              const configPath = resolve(projectDir, 'tokken.config.json')
              let existingConfig: any = {}
              if (existsSync(configPath)) {
                try { existingConfig = JSON.parse(readFileSync(configPath, 'utf-8')) } catch {}
              }

              const urlChanged = existingConfig.figmaUrl !== url
              const needsSync = newToken || urlChanged

              // Save new token if provided
              if (newToken) {
                write('[setup] Saving Figma token...')
                writeFileSync(resolve(projectDir, '.env'), \`FIGMA_ACCESS_TOKEN=\${newToken}\\n\`)
              }

              // Update config
              write('[setup] Saving configuration...')
              const config: any = { figmaUrl: url, outputDir: '.' }
              if (brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor)) {
                config.brandColor = brandColor
              }
              writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n')

              const gitignorePath = resolve(projectDir, '.gitignore')
              const gitEntries = ['.env', '.tokken/', 'node_modules/']
              if (existsSync(gitignorePath)) {
                const content = readFileSync(gitignorePath, 'utf-8')
                const lines = content.split('\\n').map((l: string) => l.trim())
                const missing = gitEntries.filter((e: string) => !lines.includes(e))
                if (missing.length) appendFileSync(gitignorePath, '\\n' + missing.join('\\n') + '\\n')
              } else {
                writeFileSync(gitignorePath, gitEntries.join('\\n') + '\\n')
              }

              if (needsSync) {
                // Full sync: extract from Figma + generate
                let token = newToken
                if (!token) {
                  const envPath = resolve(projectDir, '.env')
                  if (existsSync(envPath)) {
                    const envContent = readFileSync(envPath, 'utf-8')
                    const match = envContent.match(/FIGMA_ACCESS_TOKEN=(.+)/)
                    if (match) token = match[1].trim()
                  }
                }
                if (!token) {
                  write('[error] No Figma token found. Enter a token above.')
                  res.end()
                  return
                }
                write('[sync] Starting extraction from Figma...\\n')
                const sync = spawn('npx', ['tokken', 'sync', url, '--output', projectDir], {
                  cwd: projectDir, env: { ...process.env, FIGMA_ACCESS_TOKEN: token }, shell: true
                })
                sync.stdout.on('data', (d: Buffer) => write(d.toString().trimEnd()))
                sync.stderr.on('data', (d: Buffer) => write(d.toString().trimEnd()))
                sync.on('close', (code: number) => {
                  write(code === 0 ? '\\n[done] Sync complete!' : \`\\n[error] Sync failed (exit code \${code})\`)
                  res.end()
                })
              } else {
                // Config-only change (e.g. brand color): patch CSS directly — no restart needed
                const cssPath = resolve(projectDir, 'docs/.vitepress/theme/custom.css')
                if (brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) && existsSync(cssPath)) {
                  write('[update] Updating brand color (auto-adjusting for accessibility)...')
                  let css = readFileSync(cssPath, 'utf-8')
                  css = patchBrandCSS(css, brandColor)
                  writeFileSync(cssPath, css)
                  write('[done] Brand color updated!')
                } else {
                  write('[done] Configuration saved.')
                }
                res.end()
              }
            } catch (err: any) {
              try { res.setHeader('Content-Type', 'text/plain') } catch {}
              try { res.write(\`[error] \${err.message}\\n\`) } catch {}
              res.end()
            }
          })
        })
      }
    }]
  },
})
`;
}

// ---------- theme/index.ts ----------
function genThemeIndex() {
  return `import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

import ColorGrid from '../components/ColorGrid.vue'
import ColorSwatch from '../components/ColorSwatch.vue'
import ComponentDemo from '../components/ComponentDemo.vue'
import CopyButton from '../components/CopyButton.vue'
import IconGrid from '../components/IconGrid.vue'
import ShadowPreview from '../components/ShadowPreview.vue'
import SpacingScale from '../components/SpacingScale.vue'
import TokenTable from '../components/TokenTable.vue'
import TypographyPreview from '../components/TypographyPreview.vue'
import BorderRadiusPreview from '../components/BorderRadiusPreview.vue'

import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ColorGrid', ColorGrid)
    app.component('ColorSwatch', ColorSwatch)
    app.component('ComponentDemo', ComponentDemo)
    app.component('CopyButton', CopyButton)
    app.component('IconGrid', IconGrid)
    app.component('ShadowPreview', ShadowPreview)
    app.component('SpacingScale', SpacingScale)
    app.component('TokenTable', TokenTable)
    app.component('TypographyPreview', TypographyPreview)
    app.component('BorderRadiusPreview', BorderRadiusPreview)

    // Vue mounted — cancel the <head> recovery script
    if (typeof window !== 'undefined') {
      if ((window as any).__tokkenReloadTimer) {
        clearTimeout((window as any).__tokkenReloadTimer);
        (window as any).__tokkenReloadTimer = null
      }
      sessionStorage.removeItem('tokken-reloading')
    }
  },
} satisfies Theme
`;
}

// ---------- theme/custom.css ----------
function genCustomCSS(theme, fontFamilies) {
  const primaryFont = fontFamilies.length > 0 ? `'${fontFamilies[0]}', ` : '';
  return `:root {
  /* Design-system custom properties */
  --dad-bg: ${theme.bg};
  --dad-bg-surface: ${theme.bgSurface};
  --dad-bg-elevated: ${theme.bgElevated};
  --dad-bg-mute: ${theme.bgMute};
  --dad-bg-soft: ${theme.bgSoft};
  --dad-text-primary: ${theme.textPrimary};
  --dad-text-secondary: ${theme.textSecondary};
  --dad-text-muted: ${theme.textMuted};
  --dad-accent: ${theme.accentLight};
  --dad-accent-dark: ${theme.accentDarkLight};
  --dad-border: ${theme.border};
  --dad-success: ${theme.success};
  /* Light-mode brand colors (accessible on white) */
  --vp-c-brand-1: ${theme.vpBrand1Light};
  --vp-c-brand-2: ${theme.vpBrand2Light};
  --vp-c-brand-3: ${theme.vpBrand3Light};
  --vp-c-brand-soft: ${theme.vpBrandSoftLight};
}

.dark {
  --vp-c-bg: ${theme.bg};
  --vp-c-bg-soft: ${theme.bgSoft};
  --vp-c-bg-mute: ${theme.bgMute};
  --vp-c-bg-elv: ${theme.bgElevated};
  --vp-c-text-1: ${theme.textPrimary};
  --vp-c-text-2: ${theme.textSecondary};
  --vp-c-text-3: ${theme.textMuted};
  --vp-c-divider: ${theme.border};
  --dad-accent: ${theme.accent};
  --dad-accent-dark: ${theme.accentDark};
  --vp-c-brand-1: ${theme.vpBrand1};
  --vp-c-brand-2: ${theme.vpBrand2};
  --vp-c-brand-3: ${theme.vpBrand3};
  --vp-c-brand-soft: ${theme.vpBrandSoft};
}

:root {
  --vp-font-family-base: ${primaryFont}sans-serif;
}
`;
}

// ---------- docs/index.md (home page) ----------
function genHomePage(manifest, tokens, groups, iconCount, hasEffects, brandColor) {
  const fileName = manifest.fileName || 'Design System';
  const counts = manifest.counts || {};

  const colorCount = counts.publishedColorStyles || 0;
  const typoCount = counts.publishedTextStyles || 0;
  const effectCount = counts.publishedEffectStyles || 0;
  const compCount = counts.publishedComponents || (tokens.components || []).length || 0;

  const features = [];
  if (colorCount > 0) {
    features.push(`  - title: ${colorCount} Colors
    details: Published color styles from the Figma design system.`);
  }
  if (typoCount > 0) {
    features.push(`  - title: ${typoCount} Text Styles
    details: Published text styles including font families, sizes, and weights.`);
  }
  if (effectCount > 0) {
    features.push(`  - title: ${effectCount} Effects
    details: Published effect styles including shadows and blurs.`);
  }
  features.push(`  - title: ${compCount} Components
    details: UI components documented with variants and properties.`);
  if (iconCount > 0) {
    features.push(`  - title: ${iconCount} Icons
    details: SVG icons exported from the design file.`);
  }
  features.push(`  - title: AI-Ready Spec
    details: Downloadable structured spec for AI code generation agents.`);
  features.push(`  - title: CSS Framework
    details: Standalone CSS with custom properties, text classes, and utilities.`);

  const figmaUrl = manifest.figmaUrl || '';
  const extractedAt = manifest.extractedAt
    ? new Date(manifest.extractedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Unknown';

  // Detect a "Cover" frame for the hero image
  const coverFrame = (manifest.frames || []).find(f => /^cover$/i.test(f.name));
  const heroImage = coverFrame
    ? `\n  image:\n    src: /frames/${coverFrame.filename}\n    alt: Cover`
    : '';

  return `---
layout: home
hero:
  text: Design System Documentation
  tagline: Auto-generated from Figma${heroImage}
features:
${features.join('\n')}
---

<script setup>
import { ref, computed } from 'vue'

const defaultUrl = '${figmaUrl}'
const figmaUrl = ref(defaultUrl)
const editing = ref(false)
const syncing = ref(false)
const syncLog = ref('')
const showLog = ref(false)
const syncStatus = ref('')

// Settings
const showSettings = ref(false)
const settingsToken = ref('')
const settingsUrl = ref(defaultUrl)
const settingsBrandColor = ref('${brandColor || ''}')
const settingsSyncing = ref(false)
const settingsLog = ref('')
const settingsStatus = ref('')

const isModified = computed(() => figmaUrl.value !== defaultUrl)

const displayName = computed(() => {
  try {
    const parts = figmaUrl.value.split('/')
    const raw = parts[parts.length - 1] || parts[parts.length - 2] || ''
    return decodeURIComponent(raw).replace(/-/g, ' ').replace(/\\?.*$/, '') || 'Figma File'
  } catch { return 'Figma File' }
})

function startReloadPolling() {
  if (window.__tokkenPoll) return
  if (!document.getElementById('sync-reload-overlay')) {
    const s = document.createElement('style')
    s.textContent = '@keyframes _rs{to{transform:rotate(360deg)}}'
    document.head.appendChild(s)
    const el = document.createElement('div')
    el.id = 'sync-reload-overlay'
    el.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#1b1b1f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px'
    el.innerHTML = '<div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.1);border-top-color:#646cff;border-radius:50%;animation:_rs .8s linear infinite"></div><div style="color:rgba(255,255,255,0.8);font-size:14px;font-family:system-ui,sans-serif">Reloading with updated content\\u2026</div>'
    document.body.appendChild(el)
  }
  let attempts = 0
  window.__tokkenPoll = window.setInterval(async () => {
    attempts++
    if (attempts > 120) {
      clearInterval(window.__tokkenPoll)
      window.__tokkenPoll = null
      document.getElementById('sync-reload-overlay')?.remove()
      return
    }
    try {
      const r = await fetch('/', { cache: 'no-store' })
      if (r.ok) {
        clearInterval(window.__tokkenPoll)
        window.__tokkenPoll = null
        window.location.href = window.location.origin + '/'
      }
    } catch {}
  }, 1000)
}

async function runSync() {
  if (syncing.value) return
  syncing.value = true
  syncLog.value = ''
  showLog.value = true
  syncStatus.value = ''
  sessionStorage.setItem('tokken-reloading', '1')

  try {
    const res = await fetch('/__figma-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: figmaUrl.value.trim() })
    })

    if (!res.ok) throw new Error(\`Server returned \${res.status}\`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      syncLog.value += decoder.decode(value)
    }

    if (syncLog.value.includes('[done]')) {
      syncStatus.value = 'done'
      startReloadPolling()
    } else if (syncLog.value.includes('[error]')) {
      syncStatus.value = 'error'
    }
  } catch {
    if (syncLog.value.includes('Extraction complete') || syncLog.value.includes('generating site')) {
      syncStatus.value = 'done'
      syncLog.value += '[done] Sync complete!\\n'
      startReloadPolling()
    } else if (!syncLog.value) {
      syncStatus.value = 'unavailable'
    } else {
      syncStatus.value = 'error'
      syncLog.value += '\\n[error] Connection lost\\n'
    }
  } finally {
    syncing.value = false
  }
}

async function saveSettings() {
  if (!settingsUrl.value.trim()) return
  settingsSyncing.value = true
  settingsLog.value = ''
  settingsStatus.value = ''
  sessionStorage.setItem('tokken-reloading', '1')

  try {
    const res = await fetch('/__tokken-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: settingsToken.value.trim() || undefined,
        url: settingsUrl.value.trim(),
        brandColor: settingsBrandColor.value.trim() || undefined
      })
    })

    if (!res.ok) throw new Error('Server returned ' + res.status)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      settingsLog.value += decoder.decode(value)
    }

    if (settingsLog.value.includes('[done]')) {
      settingsStatus.value = 'done'
      startReloadPolling()
    } else if (settingsLog.value.includes('[error]')) {
      settingsStatus.value = 'error'
    }
  } catch (err) {
    if (settingsLog.value.includes('Extraction complete')) {
      settingsStatus.value = 'done'
      startReloadPolling()
    } else {
      settingsStatus.value = 'error'
      settingsLog.value += '\\n[error] ' + (err.message || 'Connection failed')
    }
  } finally {
    settingsSyncing.value = false
  }
}
</script>

<div class="home-downloads">
  <a href="/design-system-spec.md" download class="home-dl-btn">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Download AI-Ready markdown
  </a>
  <a href="/design-system.css" download class="home-dl-btn home-dl-btn--outline">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Download design-system.css
  </a>
</div>

<div class="figma-source">
  <div class="figma-source-inner">
    <div class="figma-info">
      <div class="figma-label">Figma Source</div>
      <div v-if="!editing" class="figma-display">
        <a :href="figmaUrl" target="_blank" class="figma-url">
          <svg width="16" height="16" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE"/><path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/><path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/><path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/><path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/></svg>
          {{ displayName }}
        </a>
        <button class="figma-edit-btn" @click="editing = true" title="Change Figma URL">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div v-else class="figma-edit-row">
        <input
          v-model="figmaUrl"
          class="figma-url-input"
          placeholder="Paste Figma URL..."
          @keyup.enter="editing = false"
        />
        <button class="figma-done-btn" @click="editing = false">Done</button>
      </div>
      <div class="figma-meta">
        Last synced: ${extractedAt}
        <span v-if="isModified" class="figma-modified"> &middot; URL changed</span>
      </div>
    </div>
    <button class="figma-sync-btn" @click="runSync" :disabled="syncing">
      {{ syncing ? 'Syncing...' : 'Sync from Figma' }}
    </button>
  </div>
  <div v-if="showLog" class="figma-sync-log">
    <div v-if="syncStatus === 'unavailable'" class="sync-unavailable">
      Sync API is only available during <code>npm run docs:dev</code>.
    </div>
    <pre v-else class="sync-log-output">{{ syncLog || 'Starting...' }}</pre>
    <div v-if="syncStatus === 'done'" class="sync-status sync-done">Reloading with updated content...</div>
    <div v-if="syncStatus === 'error'" class="sync-status sync-error">Sync failed. Check the log above.</div>
  </div>
</div>

<div class="settings-section">
  <button class="settings-toggle" @click="showSettings = !showSettings">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    Settings
    <span class="settings-chevron" :class="{ open: showSettings }">&#9656;</span>
  </button>
  <div v-if="showSettings" class="settings-form">
    <div class="settings-field">
      <label>Figma Access Token</label>
      <input v-model="settingsToken" type="password" placeholder="Paste new token..." class="settings-input" :disabled="settingsSyncing" />
      <div class="settings-hint">Tokens expire every 90 days. Get a new one at <a href="https://www.figma.com/developers/api#access-tokens" target="_blank">figma.com/developers</a>.</div>
    </div>
    <div class="settings-field">
      <label>Figma File URL</label>
      <input v-model="settingsUrl" type="url" class="settings-input" :disabled="settingsSyncing" />
    </div>
    <div class="settings-field">
      <label>Brand Color <span style="font-weight:400;color:var(--vp-c-text-3)">(optional)</span></label>
      <div style="display:flex;align-items:center;gap:10px">
        <input v-model="settingsBrandColor" type="text" placeholder="#6164F0" class="settings-input" style="flex:1" :disabled="settingsSyncing" />
        <div v-if="settingsBrandColor && /^#[0-9a-fA-F]{6}$/.test(settingsBrandColor)" :style="{ background: settingsBrandColor, width: '32px', height: '32px', borderRadius: '6px', border: '1px solid var(--vp-c-divider)', flexShrink: 0 }"></div>
      </div>
    </div>
    <button class="settings-save" @click="saveSettings" :disabled="!settingsUrl.trim() || settingsSyncing">
      {{ settingsSyncing ? 'Saving & Syncing...' : 'Save & Re-sync' }}
    </button>
    <div v-if="settingsLog" class="settings-log">
      <pre class="settings-log-output">{{ settingsLog }}</pre>
      <div v-if="settingsStatus === 'done'" class="sync-status sync-done">Reloading with updated content...</div>
      <div v-if="settingsStatus === 'error'" class="sync-status sync-error">Something went wrong. Check the log above.</div>
    </div>
  </div>
</div>

<style>
.VPFeature {
  border: 1px solid var(--vp-c-divider) !important;
}
.home-downloads {
  max-width: 1152px;
  margin: 40px auto 0;
  padding: 0 24px;
  display: flex;
  gap: 12px;
}
.home-dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-white) !important;
  background: var(--vp-c-brand-1);
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.2s;
}
.home-dl-btn:hover { background: var(--vp-c-brand-2); }
.home-dl-btn--outline {
  background: transparent;
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1) !important;
}
.home-dl-btn--outline:hover {
  background: var(--vp-c-brand-soft);
}
.figma-source {
  max-width: 1152px;
  margin: 32px auto 0;
  padding: 0 24px;
}
.figma-source-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}
.figma-info {
  flex: 1;
  min-width: 0;
}
.figma-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vp-c-text-3);
  margin-bottom: 4px;
}
.figma-display {
  display: flex;
  align-items: center;
  gap: 8px;
}
.figma-url {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-decoration: none;
}
.figma-url:hover {
  color: var(--vp-c-brand-1);
}
.figma-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.figma-edit-btn:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-text-3);
}
.figma-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.figma-url-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  font-family: monospace;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  min-width: 0;
}
.figma-url-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}
.figma-done-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  background: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  cursor: pointer;
  flex-shrink: 0;
}
.figma-done-btn:hover {
  border-color: var(--vp-c-text-3);
}
.figma-meta {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-top: 4px;
}
.figma-modified {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.figma-sync-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
.figma-sync-btn:hover { background: var(--vp-c-brand-2); }
.figma-sync-btn:disabled { opacity: 0.7; cursor: wait; }
.figma-sync-log {
  margin-top: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}
.sync-log-output {
  margin: 0;
  padding: 12px 16px;
  font-size: 12px;
  font-family: monospace;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
}
.sync-unavailable {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
}
.sync-unavailable code {
  font-size: 12px;
  padding: 2px 6px;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
}
.sync-status {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
}
.sync-done { background: #0a3d1f; color: #4ade80; }
.sync-error { background: #3d0a0a; color: #f87171; }
.settings-section {
  max-width: 1152px;
  margin: 32px auto 0;
  padding: 0 24px;
}
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: var(--vp-c-text-3);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 8px 0;
  transition: color 0.15s;
}
.settings-toggle:hover {
  color: var(--vp-c-text-1);
}
.settings-toggle svg {
  opacity: 0.6;
}
.settings-chevron {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 11px;
}
.settings-chevron.open {
  transform: rotate(90deg);
}
.settings-form {
  margin-top: 8px;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.settings-field {
  margin-bottom: 16px;
}
.settings-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 6px;
}
.settings-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: monospace;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  color: var(--vp-c-text-1);
  box-sizing: border-box;
}
.settings-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}
.settings-input:disabled {
  opacity: 0.6;
}
.settings-hint {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-top: 4px;
}
.settings-hint a {
  color: var(--vp-c-brand-1);
}
.settings-save {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
.settings-save:hover {
  background: var(--vp-c-brand-2);
}
.settings-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.settings-log {
  margin-top: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}
.settings-log-output {
  margin: 0;
  padding: 12px 16px;
  font-size: 12px;
  font-family: monospace;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
}
</style>
`;
}

// ---------- docs/getting-started.md ----------
function genGettingStarted(manifest) {
  const fileName = manifest.fileName || 'Design System';
  const figmaUrl = manifest.figmaUrl || '';
  const extractedAt = manifest.extractedAt || new Date().toISOString();

  return `---
title: Getting Started
---

# Getting Started

This documentation site was generated from the **${fileName}** Figma file.

## Source

${figmaUrl ? `- **Figma file**: [Open in Figma](${figmaUrl})` : '- Figma file key: ' + (manifest.fileKey || 'N/A')}
- **Extracted at**: ${extractedAt}

## Development

\`\`\`bash
# Install dependencies
npm install

# Start dev server
npm run docs:dev

# Build for production
npm run docs:build

# Preview production build
npm run docs:preview
\`\`\`

## Structure

\`\`\`
docs/
  .vitepress/
    config.mts          # VitePress configuration
    theme/
      index.ts          # Custom theme with Vue components
      custom.css         # Dark theme derived from Figma tokens
    components/          # Vue components for token display
  tokens/
    colors.md            # Color tokens
    typography.md        # Typography tokens
    shadows.md           # Shadow/effect tokens
  components/
    index.md             # Component overview grid
    <group>.md           # One page per component group
    icons.md             # Icon grid
  public/
    components/          # Component preview PNGs
    icons/               # Icon SVGs
    frames/              # Frame screenshots
\`\`\`
`;
}

// ---------- docs/tokens/colors.md ----------
function genColorsPage(tokens) {
  const resolved = resolveColors(tokens);

  if (resolved.source === 'published') {
    // Group by name hierarchy (split on "/")
    const groups = {};
    for (const style of resolved.data) {
      const parts = style.name.split('/');
      const group = parts.length > 1 ? parts[0].trim() : 'General';
      const name = parts.length > 1 ? parts.slice(1).join('/').trim() : style.name;
      if (!groups[group]) groups[group] = {};
      groups[group][name] = {
        value: style.hex || '#000000',
        description: style.opacity != null && style.opacity < 1
          ? `Opacity: ${Math.round(style.opacity * 100)}%`
          : undefined,
      };
    }

    // Build YAML frontmatter
    let yaml = 'colorGroups:\n';
    for (const [groupName, colors] of Object.entries(groups)) {
      yaml += `  ${groupName}:\n`;
      for (const [name, tok] of Object.entries(colors)) {
        yaml += `    "${name.replace(/"/g, '\\"')}":\n`;
        yaml += `      value: "${tok.value}"\n`;
        if (tok.description) yaml += `      description: "${tok.description}"\n`;
      }
    }

    let body = `---
${yaml}---

# Colors

Color tokens from the published Figma styles.

`;

    for (const groupName of Object.keys(groups)) {
      body += `## ${groupName}

<ColorGrid :tokens="$frontmatter.colorGroups['${groupName.replace(/'/g, "\\'")}']" />

`;
    }

    return body;
  }

  // No published color styles
  return `# Colors

No published color styles found in this Figma file.

To define color tokens, create **color styles** in Figma (via the Styles panel) and publish them to your team library. Re-sync to pick them up.
`;
}

// ---------- docs/tokens/typography.md ----------
function genTypographyPage(tokens) {
  const resolved = resolveTypography(tokens);
  const families = extractFontFamilies(tokens);

  if (resolved.source === 'published') {
    // Group published styles by font family
    const byFamily = {};
    for (const style of resolved.data) {
      const fam = style.fontFamily || 'Sans-serif';
      if (!byFamily[fam]) byFamily[fam] = [];
      byFamily[fam].push(style);
    }

    // Build type scale YAML (deduplicate keys), sorted by font size ascending
    const sortedStyles = [...resolved.data].sort((a, b) => (a.fontSize || 16) - (b.fontSize || 16));
    let yaml = 'typeScale:\n';
    const seenKeys = new Set();
    for (const style of sortedStyles) {
      let key = style.name.replace(/[^a-zA-Z0-9\-_ /]/g, '').replace(/\s+/g, '-') || 'style';
      if (seenKeys.has(key)) continue; // skip duplicate styles
      seenKeys.add(key);
      yaml += `  "${key}":\n`;
      yaml += `    value: "${style.fontSize || 16}px"\n`;
      if (style.lineHeight) yaml += `    lineHeight: "${style.lineHeight}"\n`;
      if (style.fontWeight) yaml += `    weights: [${style.fontWeight}]\n`;
    }

    yaml += 'fontFamilies:\n';
    for (const fam of families) {
      yaml += `  - "${fam}"\n`;
    }

    let body = `---
${yaml}---

# Typography

Typography tokens from the published Figma styles.

## Font Families

`;

    for (const fam of families) {
      body += `- **${fam}**\n`;
    }

    body += `\n## Type Scale\n\n`;
    body += `<TypographyPreview :tokens="$frontmatter.typeScale" font-family="${families[0] || 'sans-serif'}" />\n\n`;

    // Detailed table per family (deduplicate by name)
    for (const [fam, styles] of Object.entries(byFamily)) {
      const seen = new Set();
      body += `### ${fam}\n\n`;
      body += `| Style | Size | Weight | Line Height | Letter Spacing |\n`;
      body += `|-------|------|--------|-------------|----------------|\n`;
      for (const s of styles) {
        if (seen.has(s.name)) continue;
        seen.add(s.name);
        body += `| ${s.name} | ${s.fontSize || '-'}px | ${s.fontWeight || '-'} | ${s.lineHeight || '-'} | ${s.letterSpacing || '-'} |\n`;
      }
      body += '\n';
    }

    return body;
  }

  // No published text styles
  return `# Typography

No published text styles found in this Figma file.

To define typography tokens, create **text styles** in Figma (via the Styles panel) and publish them to your team library. Re-sync to pick them up.
`;
}

// ---------- docs/tokens/shadows.md ----------
function genShadowsPage(tokens) {
  const resolved = resolveEffects(tokens);

  if (resolved.source === 'published') {
    let yaml = 'shadows:\n';
    for (const style of resolved.data) {
      const name = slugify(style.name) || 'shadow';
      const effects = style.effects || [];
      const cssValues = effects.map(effectToCSS).filter(Boolean);
      const css = cssValues.join(', ') || '0 1px 3px rgba(0,0,0,0.25)';
      yaml += `  "${name}":\n    value: "${css.replace(/"/g, '\\"')}"\n    description: "${style.name}"\n`;
    }

    return `---
${yaml}---

# Shadows

Effect styles from the published Figma styles.

<ShadowPreview :tokens="$frontmatter.shadows" />
`;
  }

  // No published effect styles
  return null; // Skip shadows page entirely
}

// ---------- docs/components/index.md (overview grid) ----------
function genComponentsOverview(groups, tokens) {
  const componentImages = tokens.componentImages || {};

  let cards = '';
  for (const g of groups) {
    const slug = slugify(g.name);
    // Find a representative image for this group
    let thumbImage = null;
    let thumbIsVariantSet = false;
    for (const comp of g.components) {
      const imgKey = comp.name;
      if (componentImages[imgKey]) {
        thumbImage = '/' + componentImages[imgKey];
        thumbIsVariantSet = comp.variants && comp.variants.length > 0;
        break;
      }
      // Try image field on the component
      if (comp.image) {
        thumbImage = '/' + comp.image;
        thumbIsVariantSet = comp.variants && comp.variants.length > 0;
        break;
      }
    }

    if (thumbImage) {
      const clipClass = thumbIsVariantSet ? ' clipped' : '';
      cards += `<a href="/components/${slug}" class="component-card">
  <img :src="'${thumbImage}'" alt="${g.name}" class="${clipClass}" />
  <span>${g.name}</span>
</a>\n`;
    } else {
      cards += `<a href="/components/${slug}" class="component-card">
  <span>${g.name}</span>
</a>\n`;
    }
  }

  return `---
title: Components
---

# Components

Browse all component groups in the design system.

<div class="component-grid">
${cards}</div>

<style>
.component-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-top: 24px; }
.component-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 12px; background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); border-radius: 10px; text-decoration: none; color: var(--vp-c-text-1); transition: border-color 0.2s, background 0.2s; min-height: 140px; justify-content: center; }
.component-card:hover { border-color: var(--vp-c-brand-1); background: var(--vp-c-bg-mute); }
.component-card img { max-width: 100%; max-height: 100px; object-fit: contain; border-radius: 4px; }
.component-card img.clipped { clip-path: inset(4px round 4px); }
.component-card span { font-size: 13px; font-weight: 600; text-align: center; }
</style>
`;
}

// ---------- docs/components/<group-slug>.md ----------
function genComponentGroupPage(group, tokens) {
  const componentImages = tokens.componentImages || {};

  // Build YAML frontmatter
  let yaml = `category: components\ngroup: ${group.name}\ncomponents:\n`;

  for (const comp of group.components) {
    yaml += `  - name: "${comp.name.replace(/"/g, '\\"')}"\n`;

    // Variants
    if (comp.variants && comp.variants.length > 0) {
      yaml += `    variants:\n`;
      for (const v of comp.variants) {
        yaml += `      - "${v.replace(/"/g, '\\"')}"\n`;
      }
    }

    // Properties
    if (comp.properties && Object.keys(comp.properties).length > 0) {
      yaml += `    properties:\n`;
      for (const [rawName, prop] of Object.entries(comp.properties)) {
        const cleanName = cleanPropertyName(rawName);
        yaml += `      - name: "${cleanName.replace(/"/g, '\\"')}"\n`;
        yaml += `        type: ${prop.type || 'VARIANT'}\n`;
        if (prop.defaultValue != null) {
          yaml += `        default: "${String(prop.defaultValue).replace(/"/g, '\\"')}"\n`;
        }
      }
    }

    // Image
    const imgPath = componentImages[comp.name] || comp.image;
    if (imgPath) {
      yaml += `    image: /${imgPath}\n`;
    }

    // Colors used
    if (comp.styles?.colors && comp.styles.colors.length > 0) {
      yaml += `    colors:\n`;
      for (const c of comp.styles.colors) {
        yaml += `      - "${c}"\n`;
      }
    }

    // Typography
    if (comp.styles?.typography && comp.styles.typography.length > 0) {
      yaml += `    typography:\n`;
      for (const t of comp.styles.typography) {
        yaml += `      - font: "${t.fontFamily}"\n`;
        yaml += `        size: ${t.fontSize}\n`;
        yaml += `        weight: ${t.fontWeight}\n`;
        if (t.lineHeight) yaml += `        lineHeight: ${t.lineHeight}\n`;
      }
    }

    // Spacing
    if (comp.styles?.spacing) {
      const sp = comp.styles.spacing;
      if (sp.paddings && sp.paddings.length > 0) {
        yaml += `    paddings:\n`;
        for (const p of sp.paddings) {
          yaml += `      - "${p.top} ${p.right} ${p.bottom} ${p.left}"\n`;
        }
      }
      if (sp.gaps && sp.gaps.length > 0) {
        yaml += `    gaps: [${sp.gaps.join(', ')}]\n`;
      }
    }

    // Borders
    if (comp.styles?.borders) {
      const b = comp.styles.borders;
      if (b.radii && b.radii.length > 0) {
        yaml += `    radii:\n`;
        for (const r of b.radii) {
          yaml += `      - "${Array.isArray(r) ? r.join('/') : r}"\n`;
        }
      }
      if (b.strokeWeights && b.strokeWeights.length > 0) {
        yaml += `    strokeWeights: [${b.strokeWeights.join(', ')}]\n`;
      }
    }

    // Effects
    if (comp.styles?.effects && comp.styles.effects.length > 0) {
      yaml += `    effects:\n`;
      for (const e of comp.styles.effects) {
        yaml += `      - type: "${e.type}"\n`;
        if (e.radius != null) yaml += `        blur: ${e.radius}\n`;
        if (e.spread != null) yaml += `        spread: ${e.spread}\n`;
      }
    }

    // Layout
    if (comp.styles?.layout && comp.styles.layout.length > 0) {
      yaml += `    layout:\n`;
      for (const l of comp.styles.layout) {
        yaml += `      - mode: "${l.mode}"\n`;
        if (l.primaryAlign) yaml += `        mainAxis: "${l.primaryAlign}"\n`;
        if (l.counterAlign) yaml += `        crossAxis: "${l.counterAlign}"\n`;
      }
    }
  }

  // Build markdown body
  let body = `---\n${yaml}---\n\n# ${group.name}\n\nA collection of ${group.name.toLowerCase()} components.\n\n`;

  for (const comp of group.components) {
    body += `## ${comp.name}\n\n`;

    // Component demo with image
    const imgPath = componentImages[comp.name] || comp.image;
    const isVariantSet = comp.variants && comp.variants.length > 0;
    if (imgPath) {
      body += `<ComponentDemo title="${comp.name}" image="/${imgPath}"${isVariantSet ? ' :variant-set="true"' : ''} />\n\n`;
    } else {
      body += `<ComponentDemo title="${comp.name}"${isVariantSet ? ' :variant-set="true"' : ''} />\n\n`;
    }

    // Description
    if (comp.description) {
      body += `${comp.description}\n\n`;
    }

    // Variants
    if (comp.variants && comp.variants.length > 0) {
      body += `### Variants\n\n`;
      body += `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">\n`;
      for (const v of comp.variants) {
        body += `  <span><code>${v}</code></span>\n`;
      }
      body += `</div>\n\n`;
    }

    // Properties table
    if (comp.properties && Object.keys(comp.properties).length > 0) {
      body += `### Properties\n\n`;
      body += `| Property | Type | Default |\n`;
      body += `|----------|------|---------|${'\n'}`;
      for (const [rawName, prop] of Object.entries(comp.properties)) {
        const cleanName = cleanPropertyName(rawName);
        const defaultVal = prop.defaultValue != null ? `\`${JSON.stringify(prop.defaultValue)}\`` : '-';
        body += `| ${cleanName} | ${prop.type || 'VARIANT'} | ${defaultVal} |\n`;
      }
      body += '\n';
    }

    // Style details
    if (comp.styles) {
      const hasStyleDetails = (comp.styles.colors?.length > 0) ||
        (comp.styles.typography?.length > 0) ||
        (comp.styles.spacing?.paddings?.length > 0) ||
        (comp.styles.spacing?.gaps?.length > 0) ||
        (comp.styles.borders?.radii?.length > 0) ||
        (comp.styles.borders?.strokeWeights?.length > 0) ||
        (comp.styles.effects?.length > 0) ||
        (comp.styles.layout?.length > 0);

      if (hasStyleDetails) {
        body += `### Design Specs\n\n`;

        // Colors
        if (comp.styles.colors && comp.styles.colors.length > 0) {
          body += `**Colors**\n\n`;
          body += `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">\n`;
          for (const c of comp.styles.colors) {
            body += `  <div style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); border-radius: 6px; font-size: 12px; font-family: monospace;"><span style="width: 14px; height: 14px; border-radius: 3px; background: ${c}; border: 1px solid var(--vp-c-divider); flex-shrink: 0;"></span>${c}</div>\n`;
          }
          body += `</div>\n\n`;
        }

        // Typography
        if (comp.styles.typography && comp.styles.typography.length > 0) {
          body += `**Typography**\n\n`;
          body += `| Font | Size | Weight | Line Height |\n`;
          body += `|------|------|--------|-------------|\n`;
          for (const t of comp.styles.typography) {
            body += `| ${t.fontFamily} | ${t.fontSize}px | ${t.fontWeight} | ${t.lineHeight ? Math.round(t.lineHeight) + 'px' : '-'} |\n`;
          }
          body += '\n';
        }

        // Spacing
        if ((comp.styles.spacing?.paddings?.length > 0) || (comp.styles.spacing?.gaps?.length > 0)) {
          body += `**Spacing**\n\n`;
          if (comp.styles.spacing.paddings?.length > 0) {
            body += `| Padding Top | Right | Bottom | Left |\n`;
            body += `|-------------|-------|--------|------|\n`;
            for (const p of comp.styles.spacing.paddings) {
              body += `| ${p.top}px | ${p.right}px | ${p.bottom}px | ${p.left}px |\n`;
            }
            body += '\n';
          }
          if (comp.styles.spacing.gaps?.length > 0) {
            body += `Gaps: ${comp.styles.spacing.gaps.map(g => '`' + g + 'px`').join(', ')}\n\n`;
          }
        }

        // Borders
        if ((comp.styles.borders?.radii?.length > 0) || (comp.styles.borders?.strokeWeights?.length > 0)) {
          body += `**Borders**\n\n`;
          if (comp.styles.borders.radii?.length > 0) {
            const radiiStr = comp.styles.borders.radii.map(r =>
              Array.isArray(r) ? '`' + r.join('/') + 'px`' : '`' + r + 'px`'
            ).join(', ');
            body += `Border radius: ${radiiStr}\n\n`;
          }
          if (comp.styles.borders.strokeWeights?.length > 0) {
            body += `Stroke: ${comp.styles.borders.strokeWeights.map(w => '`' + w + 'px`').join(', ')}\n\n`;
          }
        }

        // Effects
        if (comp.styles.effects?.length > 0) {
          body += `**Effects**\n\n`;
          body += `| Type | Blur | Spread |\n`;
          body += `|------|------|--------|\n`;
          for (const e of comp.styles.effects) {
            body += `| ${e.type.replace(/_/g, ' ')} | ${e.radius ?? '-'} | ${e.spread ?? '-'} |\n`;
          }
          body += '\n';
        }

        // Layout
        if (comp.styles.layout?.length > 0) {
          body += `**Layout**\n\n`;
          for (const l of comp.styles.layout) {
            const parts = [`\`${l.mode}\``];
            if (l.primaryAlign) parts.push(`main: \`${l.primaryAlign}\``);
            if (l.counterAlign) parts.push(`cross: \`${l.counterAlign}\``);
            body += `- ${parts.join(', ')}\n`;
          }
          body += '\n';
        }
      }
    }

    // CSS implementation snippet
    if (!isIcon(comp) && comp.styles) {
      const className = componentClassName(comp.name);
      const css = genComponentCSS(comp, className);
      if (css) {
        body += `### CSS\n\n`;
        body += '```css\n' + css + '\n```\n\n';
        body += '**Usage**\n\n';
        body += '```html\n' + htmlExampleForComponent(className) + '\n```\n\n';
      }
    }
  }

  return body;
}

// ---------- docs/components/icons.md ----------
function genIconsPage(tokens) {
  const iconSvgs = tokens.iconSvgs || {};
  const iconCount = Object.keys(iconSvgs).length;

  if (iconCount === 0) return null;

  let yaml = 'category: components\ngroup: Icons\nicons:\n';
  for (const [name, svgPath] of Object.entries(iconSvgs)) {
    yaml += `  ${name}: /${svgPath}\n`;
  }

  return `---
${yaml}---

# Icons

${iconCount} icons exported from the Figma source file.

<IconGrid :icons="$frontmatter.icons" />
`;
}

// ---------- Per-component CSS snippet ----------

const componentClassMap = {
  'button': 'btn', 'buttons': 'btn',
  'card': 'card', 'cards': 'card',
  'input': 'input', 'inputs': 'input',
  'badge': 'badge', 'badges': 'badge',
  'chip': 'chip', 'chips': 'chip',
  'tag': 'tag', 'tags': 'tag',
  'modal': 'modal', 'dialog': 'modal',
  'toast': 'toast', 'notification': 'toast',
  'avatar': 'avatar',
  'tab': 'tab', 'tabs': 'tab',
  'table': 'table',
  'header': 'header',
  'sidebar': 'sidebar',
  'breadcrumbs': 'breadcrumb', 'breadcrumb': 'breadcrumb',
  'separator': 'separator', 'divider': 'separator',
  'progress indicator': 'progress', 'progress': 'progress',
  'list': 'list',
};

function componentClassName(compName) {
  return componentClassMap[compName.toLowerCase()] || slugify(compName);
}

const htmlTagMap = {
  'btn': '<button class="%cls%">Label</button>',
  'input': '<input class="%cls%" placeholder="Enter text..." />',
  'table': '<table class="%cls%">...</table>',
  'header': '<header class="%cls%">...</header>',
  'sidebar': '<aside class="%cls%">...</aside>',
  'separator': '<hr class="%cls%" />',
  'list': '<ul class="%cls%">...</ul>',
};

function htmlExampleForComponent(className) {
  const template = htmlTagMap[className] || '<div class="%cls%">...</div>';
  return template.replace(/%cls%/g, className);
}

function genComponentCSS(comp, className) {
  const styles = comp.styles;
  if (!styles) return '';

  const rules = [];

  // Padding — prefer non-uniform over uniform container padding
  if (styles.spacing?.paddings?.length > 0) {
    let p = styles.spacing.paddings[0];
    if (styles.spacing.paddings.length > 1 && p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
      const specific = styles.spacing.paddings.find(pp => !(pp.top === pp.right && pp.right === pp.bottom && pp.bottom === pp.left));
      if (specific) p = specific;
    }
    if (p.top === p.bottom && p.left === p.right && p.top === p.left) {
      rules.push(`  padding: ${p.top}px;`);
    } else if (p.top === p.bottom && p.left === p.right) {
      rules.push(`  padding: ${p.top}px ${p.left}px;`);
    } else {
      rules.push(`  padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`);
    }
  }

  // Border radius
  if (styles.borders?.radii?.length > 0) {
    const r = styles.borders.radii[0];
    if (Array.isArray(r)) {
      rules.push(`  border-radius: ${r.map(v => v + 'px').join(' ')};`);
    } else {
      rules.push(`  border-radius: ${r}px;`);
    }
  }

  // Typography
  if (styles.typography?.length > 0) {
    const t = styles.typography[0];
    rules.push(`  font-size: ${t.fontSize}px;`);
    rules.push(`  font-weight: ${t.fontWeight};`);
    if (t.lineHeight) rules.push(`  line-height: ${Math.round(t.lineHeight)}px;`);
  }

  // Shadow
  const shadow = (styles.effects || []).find(e => e.type === 'DROP_SHADOW');
  if (shadow) {
    const css = effectToCSS(shadow);
    if (css) rules.push(`  box-shadow: ${css};`);
  }

  // Stroke
  if (styles.borders?.strokeWeights?.length > 0) {
    rules.push(`  border-width: ${styles.borders.strokeWeights[0]}px;`);
    rules.push(`  border-style: solid;`);
  }

  // Gap
  if (styles.spacing?.gaps?.length > 0) {
    rules.push(`  gap: ${styles.spacing.gaps[0]}px;`);
  }

  // Layout direction
  if (styles.layout?.length > 0) {
    const l = styles.layout[0];
    if (l.mode === 'HORIZONTAL') {
      rules.push(`  display: flex;`);
      rules.push(`  flex-direction: row;`);
    } else if (l.mode === 'VERTICAL') {
      rules.push(`  display: flex;`);
      rules.push(`  flex-direction: column;`);
    }
    if (l.primaryAlign === 'CENTER') rules.push(`  justify-content: center;`);
    else if (l.primaryAlign === 'MAX') rules.push(`  justify-content: flex-end;`);
    else if (l.primaryAlign === 'SPACE_BETWEEN') rules.push(`  justify-content: space-between;`);
    if (l.counterAlign === 'CENTER') rules.push(`  align-items: center;`);
    else if (l.counterAlign === 'MAX') rules.push(`  align-items: flex-end;`);
  }

  if (rules.length === 0) return '';
  return `.${className} {\n${rules.join('\n')}\n}`;
}

// ---------- Pure CSS Framework ----------
function genCSSFramework(tokens) {
  const lines = [];
  const resolvedColors = resolveColors(tokens);
  const resolvedTypo = resolveTypography(tokens);
  const resolvedEffects = resolveEffects(tokens);
  const components = tokens.components || [];

  // Collect unique spacing values from all components
  const allPaddings = new Set();
  const allGaps = new Set();
  const allRadii = new Set();
  const allStrokeWeights = new Set();

  for (const comp of components) {
    if (!comp.styles) continue;
    if (comp.styles.spacing) {
      for (const p of (comp.styles.spacing.paddings || [])) {
        [p.top, p.right, p.bottom, p.left].forEach(v => { if (v > 0) allPaddings.add(v); });
      }
      for (const g of (comp.styles.spacing.gaps || [])) {
        if (g > 0) allGaps.add(g);
      }
    }
    if (comp.styles.borders) {
      for (const r of (comp.styles.borders.radii || [])) {
        if (Array.isArray(r)) {
          r.forEach(v => { if (v > 0) allRadii.add(v); });
        } else if (r > 0) {
          allRadii.add(r);
        }
      }
      for (const w of (comp.styles.borders.strokeWeights || [])) {
        if (w > 0) allStrokeWeights.add(w);
      }
    }
  }

  // Merge padding and gap values into a spacing scale (round to integers, deduplicate)
  const spacingValues = [...new Set([...allPaddings, ...allGaps].map(v => Math.round(v)))].filter(v => v > 0).sort((a, b) => a - b);
  const radiusValues = [...new Set([...allRadii].map(v => Math.round(v)))].filter(v => v > 0).sort((a, b) => a - b);

  // ── Section A: CSS Custom Properties ──
  lines.push('/* ============================================================');
  lines.push('   Design System CSS Framework');
  lines.push('   Auto-generated from Figma — do not edit manually.');
  lines.push('   ============================================================ */');
  lines.push('');
  lines.push(':root {');

  // Color tokens
  if (resolvedColors.source === 'published' && resolvedColors.data.length > 0) {
    lines.push('  /* Colors */');
    for (const c of resolvedColors.data) {
      const name = slugify(c.name);
      lines.push(`  --color-${name}: ${c.hex};`);
    }
    lines.push('');
  }

  // Font tokens
  const families = extractFontFamilies(tokens);
  if (families.length > 0) {
    lines.push('  /* Fonts */');
    for (const fam of families) {
      const name = slugify(fam);
      lines.push(`  --font-${name}: '${fam}', sans-serif;`);
    }
    lines.push('');
  }

  // Typography size/weight tokens from published text styles
  if (resolvedTypo.source === 'published' && resolvedTypo.data.length > 0) {
    const sizes = new Set();
    const weights = new Set();
    for (const t of resolvedTypo.data) {
      if (t.fontSize) sizes.add(t.fontSize);
      if (t.fontWeight) weights.add(t.fontWeight);
    }
    if (sizes.size > 0) {
      lines.push('  /* Type sizes */');
      for (const s of [...sizes].sort((a, b) => a - b)) {
        lines.push(`  --text-${s}: ${s}px;`);
      }
      lines.push('');
    }
    if (weights.size > 0) {
      lines.push('  /* Font weights */');
      const weightNames = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
      for (const w of [...weights].sort((a, b) => a - b)) {
        const name = weightNames[w] || `w${w}`;
        lines.push(`  --font-weight-${name}: ${w};`);
      }
      lines.push('');
    }
  }

  // Shadow tokens from published effects
  if (resolvedEffects.source === 'published' && resolvedEffects.data.length > 0) {
    lines.push('  /* Shadows */');
    for (const style of resolvedEffects.data) {
      const name = slugify(style.name) || 'shadow';
      const cssValues = (style.effects || []).map(effectToCSS).filter(Boolean);
      if (cssValues.length > 0) {
        lines.push(`  --shadow-${name}: ${cssValues.join(', ')};`);
      }
    }
    lines.push('');
  }

  // Spacing tokens
  if (spacingValues.length > 0) {
    lines.push('  /* Spacing (from component auto-layout) */');
    for (const v of spacingValues) {
      lines.push(`  --space-${v}: ${v}px;`);
    }
    lines.push('');
  }

  // Radius tokens
  if (radiusValues.length > 0) {
    lines.push('  /* Border radius (from components) */');
    for (const v of radiusValues) {
      lines.push(`  --radius-${v}: ${v}px;`);
    }
    lines.push('');
  }

  lines.push('}');
  lines.push('');

  // ── Section B: Semantic Text Style Classes ──
  if (resolvedTypo.source === 'published' && resolvedTypo.data.length > 0) {
    lines.push('/* ---- Text Style Classes ---- */');
    lines.push('');
    const seenNames = new Set();
    for (const t of resolvedTypo.data) {
      const name = slugify(t.name);
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      const fontVar = families.length > 0 ? `var(--font-${slugify(t.fontFamily || families[0])})` : `'${t.fontFamily || 'sans-serif'}', sans-serif`;
      lines.push(`.text-${name} {`);
      lines.push(`  font-family: ${fontVar};`);
      lines.push(`  font-size: ${t.fontSize}px;`);
      lines.push(`  font-weight: ${t.fontWeight};`);
      if (t.lineHeight) lines.push(`  line-height: ${t.lineHeight}px;`);
      if (t.letterSpacing) lines.push(`  letter-spacing: ${t.letterSpacing}px;`);
      lines.push('}');
      lines.push('');
    }
  }

  // ── Section C: Utility Classes ──
  lines.push('/* ---- Utility Classes ---- */');
  lines.push('');

  // Color utilities
  if (resolvedColors.source === 'published' && resolvedColors.data.length > 0) {
    for (const c of resolvedColors.data) {
      const name = slugify(c.name);
      lines.push(`.bg-${name} { background-color: var(--color-${name}); }`);
      lines.push(`.text-${name} { color: var(--color-${name}); }`);
      lines.push(`.border-${name} { border-color: var(--color-${name}); }`);
    }
    lines.push('');
  }

  // Shadow utilities
  if (resolvedEffects.source === 'published' && resolvedEffects.data.length > 0) {
    for (const style of resolvedEffects.data) {
      const name = slugify(style.name) || 'shadow';
      lines.push(`.shadow-${name} { box-shadow: var(--shadow-${name}); }`);
    }
    lines.push('');
  }

  // Spacing utilities
  if (spacingValues.length > 0) {
    for (const v of spacingValues) {
      lines.push(`.p-${v} { padding: var(--space-${v}); }`);
      lines.push(`.px-${v} { padding-left: var(--space-${v}); padding-right: var(--space-${v}); }`);
      lines.push(`.py-${v} { padding-top: var(--space-${v}); padding-bottom: var(--space-${v}); }`);
      lines.push(`.m-${v} { margin: var(--space-${v}); }`);
      lines.push(`.mx-${v} { margin-left: var(--space-${v}); margin-right: var(--space-${v}); }`);
      lines.push(`.my-${v} { margin-top: var(--space-${v}); margin-bottom: var(--space-${v}); }`);
      lines.push(`.gap-${v} { gap: var(--space-${v}); }`);
    }
    lines.push('');
  }

  // Radius utilities
  if (radiusValues.length > 0) {
    for (const v of radiusValues) {
      lines.push(`.rounded-${v} { border-radius: var(--radius-${v}); }`);
    }
    lines.push('.rounded-full { border-radius: 9999px; }');
    lines.push('');
  }

  // Font family utilities
  if (families.length > 0) {
    for (const fam of families) {
      const name = slugify(fam);
      lines.push(`.font-${name} { font-family: var(--font-${name}); }`);
    }
    lines.push('');
  }

  // Font weight utilities
  if (resolvedTypo.source === 'published') {
    const weights = new Set();
    for (const t of resolvedTypo.data) {
      if (t.fontWeight) weights.add(t.fontWeight);
    }
    const weightNames = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
    for (const w of [...weights].sort((a, b) => a - b)) {
      const name = weightNames[w] || `w${w}`;
      lines.push(`.font-${name} { font-weight: var(--font-weight-${name}); }`);
    }
    lines.push('');
  }

  // ── Section D: Component Base Classes ──
  const generatedCompClasses = [];
  for (const comp of components) {
    if (isIcon(comp)) continue;
    const lowerName = comp.name.toLowerCase();
    const className = componentClassMap[lowerName];
    if (!className) continue;
    if (generatedCompClasses.includes(className)) continue;

    const css = genComponentCSS(comp, className);
    if (css) {
      generatedCompClasses.push(className);
      lines.push(css);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------- CSS Framework documentation page ----------
function genCSSFrameworkPage(tokens) {
  const resolvedColors = resolveColors(tokens);
  const resolvedTypo = resolveTypography(tokens);
  const families = extractFontFamilies(tokens);

  let body = `---
title: CSS Framework
---

# CSS Framework

A standalone CSS file generated from your Figma design system. Zero dependencies — just link it and use the classes.

<a href="/design-system.css" download class="download-btn">Download design-system.css</a>

## Usage

\`\`\`html
<link rel="stylesheet" href="design-system.css">
\`\`\`

## Custom Properties

All design tokens are available as CSS custom properties:

\`\`\`css
:root {
`;

  // Show a sample of custom properties
  if (resolvedColors.source === 'published' && resolvedColors.data.length > 0) {
    body += `  /* Colors */\n`;
    for (const c of resolvedColors.data.slice(0, 5)) {
      body += `  --color-${slugify(c.name)}: ${c.hex};\n`;
    }
    if (resolvedColors.data.length > 5) body += `  /* ... ${resolvedColors.data.length - 5} more */\n`;
    body += '\n';
  }

  if (families.length > 0) {
    body += `  /* Fonts */\n`;
    for (const fam of families) {
      body += `  --font-${slugify(fam)}: '${fam}', sans-serif;\n`;
    }
    body += '\n';
  }

  body += `  /* Spacing, radius, shadows — see full file */
}
\`\`\`

## Text Style Classes

`;

  if (resolvedTypo.source === 'published' && resolvedTypo.data.length > 0) {
    body += `| Class | Font | Size | Weight |\n`;
    body += `|-------|------|------|--------|\n`;
    const seenNames = new Set();
    for (const t of resolvedTypo.data) {
      const name = slugify(t.name);
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      body += `| \`.text-${name}\` | ${t.fontFamily} | ${t.fontSize}px | ${t.fontWeight} |\n`;
    }
    body += '\n';
  } else {
    body += 'No published text styles available.\n\n';
  }

  body += `## Utility Classes

### Colors

\`\`\`html
<div class="bg-{name}">Background</div>
<span class="text-{name}">Text color</span>
<div class="border-{name}">Border color</div>
\`\`\`

### Spacing

\`\`\`html
<div class="p-{value}">Padding all sides</div>
<div class="px-{value}">Padding horizontal</div>
<div class="py-{value}">Padding vertical</div>
<div class="m-{value}">Margin all sides</div>
<div class="gap-{value}">Flex/grid gap</div>
\`\`\`

### Border Radius

\`\`\`html
<div class="rounded-{value}">Rounded corners</div>
<div class="rounded-full">Pill shape</div>
\`\`\`

<style>
.download-btn {
  display: inline-block;
  padding: 10px 20px;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white) !important;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  margin: 8px 0 24px;
  transition: background 0.2s;
}
.download-btn:hover { background: var(--vp-c-brand-2); }
</style>
`;

  return body;
}

// ---------- AI-Ready Design Spec ----------
function genAISpec(tokens, manifest) {
  const lines = [];
  const resolvedColors = resolveColors(tokens);
  const resolvedTypo = resolveTypography(tokens);
  const resolvedEffects = resolveEffects(tokens);
  const families = extractFontFamilies(tokens);
  const components = tokens.components || [];

  // Metadata
  lines.push('# Design System Specification');
  lines.push('');
  lines.push('> This file is structured for AI agents to generate matching UI code.');
  lines.push('> It contains all design tokens, component specs, and CSS class names.');
  lines.push('');
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **File**: ${manifest.fileName || 'Unknown'}`);
  lines.push(`- **Source**: ${manifest.figmaUrl || 'N/A'}`);
  lines.push(`- **Extracted**: ${manifest.extractedAt || new Date().toISOString()}`);
  lines.push('');

  // Color Tokens
  lines.push('## Color Tokens');
  lines.push('');
  if (resolvedColors.source === 'published' && resolvedColors.data.length > 0) {
    lines.push('| Token Name | CSS Variable | Hex | Opacity |');
    lines.push('|------------|-------------|-----|---------|');
    for (const c of resolvedColors.data) {
      const slug = slugify(c.name);
      lines.push(`| ${c.name} | \`--color-${slug}\` | \`${c.hex}\` | ${c.opacity === 1 ? '100%' : Math.round(c.opacity * 100) + '%'} |`);
    }
  } else {
    // Fall back to raw colors
    const rawColors = tokens.colors || {};
    const sorted = Object.entries(rawColors).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      lines.push('No published color styles. Raw colors by usage:');
      lines.push('');
      lines.push('| Hex | Usage Count |');
      lines.push('|-----|-------------|');
      for (const [hex, count] of sorted.slice(0, 30)) {
        lines.push(`| \`${hex}\` | ${count} |`);
      }
    } else {
      lines.push('No color tokens found.');
    }
  }
  lines.push('');

  // Typography Tokens
  lines.push('## Typography Tokens');
  lines.push('');
  if (resolvedTypo.source === 'published' && resolvedTypo.data.length > 0) {
    lines.push('| Token Name | CSS Class | Font | Size | Weight | Line Height | Letter Spacing |');
    lines.push('|------------|-----------|------|------|--------|-------------|----------------|');
    const seenNames = new Set();
    for (const t of resolvedTypo.data) {
      const slug = slugify(t.name);
      if (seenNames.has(slug)) continue;
      seenNames.add(slug);
      lines.push(`| ${t.name} | \`.text-${slug}\` | ${t.fontFamily} | ${t.fontSize}px | ${t.fontWeight} | ${t.lineHeight || '-'} | ${t.letterSpacing || '-'} |`);
    }
  } else {
    lines.push('No published text styles found.');
  }
  lines.push('');

  // Font Families
  if (families.length > 0) {
    lines.push('### Font Families');
    lines.push('');
    for (const fam of families) {
      lines.push(`- \`${fam}\` — CSS: \`var(--font-${slugify(fam)})\``);
    }
    lines.push('');
  }

  // Spacing Scale
  const allSpacing = new Set();
  for (const comp of components) {
    if (!comp.styles?.spacing) continue;
    for (const p of (comp.styles.spacing.paddings || [])) {
      [p.top, p.right, p.bottom, p.left].forEach(v => { if (v > 0) allSpacing.add(v); });
    }
    for (const g of (comp.styles.spacing.gaps || [])) {
      if (g > 0) allSpacing.add(g);
    }
  }
  if (allSpacing.size > 0) {
    const sorted = [...allSpacing].sort((a, b) => a - b);
    lines.push('## Spacing Scale');
    lines.push('');
    lines.push('Values derived from component auto-layout:');
    lines.push('');
    lines.push('| Value | CSS Variable | Utility Classes |');
    lines.push('|-------|-------------|-----------------|');
    for (const v of sorted) {
      lines.push(`| ${v}px | \`--space-${v}\` | \`.p-${v}\` \`.m-${v}\` \`.gap-${v}\` |`);
    }
    lines.push('');
  }

  // Border Radius Tokens
  const allRadii = new Set();
  for (const comp of components) {
    if (!comp.styles?.borders?.radii) continue;
    for (const r of comp.styles.borders.radii) {
      if (Array.isArray(r)) {
        r.forEach(v => { if (v > 0) allRadii.add(v); });
      } else if (r > 0) {
        allRadii.add(r);
      }
    }
  }
  if (allRadii.size > 0) {
    const sorted = [...allRadii].sort((a, b) => a - b);
    lines.push('## Border Radius Tokens');
    lines.push('');
    lines.push('| Value | CSS Variable | Utility Class |');
    lines.push('|-------|-------------|---------------|');
    for (const v of sorted) {
      lines.push(`| ${v}px | \`--radius-${v}\` | \`.rounded-${v}\` |`);
    }
    lines.push('');
  }

  // Shadow Tokens
  if (resolvedEffects.source === 'published' && resolvedEffects.data.length > 0) {
    lines.push('## Shadow Tokens');
    lines.push('');
    lines.push('| Name | CSS Variable | CSS Value |');
    lines.push('|------|-------------|-----------|');
    for (const style of resolvedEffects.data) {
      const slug = slugify(style.name) || 'shadow';
      const cssValues = (style.effects || []).map(effectToCSS).filter(Boolean);
      const css = cssValues.join(', ') || 'none';
      lines.push(`| ${style.name} | \`--shadow-${slug}\` | \`${css}\` |`);
    }
    lines.push('');
  }

  // Component Specifications
  lines.push('## Components');
  lines.push('');
  lines.push(`Total: ${components.length} components`);
  lines.push('');

  for (const comp of components) {
    if (isIcon(comp)) continue;

    lines.push(`### ${comp.name}`);
    lines.push('');
    if (comp.description) {
      lines.push(comp.description);
      lines.push('');
    }

    // Variants
    if (comp.variants && comp.variants.length > 0) {
      lines.push(`**Variants** (${comp.variants.length}): ${comp.variants.slice(0, 10).join(', ')}${comp.variants.length > 10 ? `, ... (+${comp.variants.length - 10} more)` : ''}`);
      lines.push('');
    }

    // Properties
    if (comp.properties && Object.keys(comp.properties).length > 0) {
      lines.push('**Properties:**');
      lines.push('');
      lines.push('| Property | Type | Default | Options |');
      lines.push('|----------|------|---------|---------|');
      for (const [name, prop] of Object.entries(comp.properties)) {
        const cleanName = cleanPropertyName(name);
        const options = prop.options ? prop.options.slice(0, 5).join(', ') + (prop.options.length > 5 ? '...' : '') : '-';
        lines.push(`| ${cleanName} | ${prop.type || 'VARIANT'} | ${prop.defaultValue ?? '-'} | ${options} |`);
      }
      lines.push('');
    }

    // Styles
    if (comp.styles) {
      const parts = [];
      if (comp.styles.colors?.length > 0) {
        parts.push(`Colors: ${comp.styles.colors.join(', ')}`);
      }
      if (comp.styles.typography?.length > 0) {
        const typoStr = comp.styles.typography.map(t => `${t.fontFamily} ${t.fontSize}px/${t.fontWeight}`).join(', ');
        parts.push(`Typography: ${typoStr}`);
      }
      if (comp.styles.spacing?.paddings?.length > 0) {
        const p = comp.styles.spacing.paddings[0];
        parts.push(`Padding: ${p.top} ${p.right} ${p.bottom} ${p.left}`);
      }
      if (comp.styles.spacing?.gaps?.length > 0) {
        parts.push(`Gap: ${comp.styles.spacing.gaps.join(', ')}px`);
      }
      if (comp.styles.borders?.radii?.length > 0) {
        const radiiStr = comp.styles.borders.radii.map(r => Array.isArray(r) ? r.join('/') : r).join(', ');
        parts.push(`Radius: ${radiiStr}px`);
      }
      if (comp.styles.borders?.strokeWeights?.length > 0) {
        parts.push(`Stroke: ${comp.styles.borders.strokeWeights.join(', ')}px`);
      }
      if (comp.styles.effects?.length > 0) {
        const effectStr = comp.styles.effects.map(e => {
          if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
            return `${e.type}(blur:${e.radius ?? 0} spread:${e.spread ?? 0})`;
          }
          return e.type;
        }).join(', ');
        parts.push(`Effects: ${effectStr}`);
      }
      if (comp.styles.layout?.length > 0) {
        const layoutStr = comp.styles.layout.map(l => {
          const p = [l.mode];
          if (l.primaryAlign) p.push(`main:${l.primaryAlign}`);
          if (l.counterAlign) p.push(`cross:${l.counterAlign}`);
          return p.join(' ');
        }).join(', ');
        parts.push(`Layout: ${layoutStr}`);
      }

      if (parts.length > 0) {
        for (const part of parts) {
          lines.push(`- ${part}`);
        }
        lines.push('');
      }
    }
  }

  // CSS Custom Property Reference
  lines.push('## CSS Custom Property Reference');
  lines.push('');
  lines.push('All generated CSS variables:');
  lines.push('');
  lines.push('```');
  if (resolvedColors.source === 'published') {
    for (const c of resolvedColors.data) {
      lines.push(`--color-${slugify(c.name)}`);
    }
  }
  for (const fam of families) {
    lines.push(`--font-${slugify(fam)}`);
  }
  if (resolvedTypo.source === 'published') {
    const sizes = new Set();
    const weights = new Set();
    for (const t of resolvedTypo.data) {
      if (t.fontSize) sizes.add(t.fontSize);
      if (t.fontWeight) weights.add(t.fontWeight);
    }
    for (const s of [...sizes].sort((a, b) => a - b)) lines.push(`--text-${s}`);
    const weightNames = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
    for (const w of [...weights].sort((a, b) => a - b)) lines.push(`--font-weight-${weightNames[w] || 'w' + w}`);
  }
  if (resolvedEffects.source === 'published') {
    for (const s of resolvedEffects.data) lines.push(`--shadow-${slugify(s.name) || 'shadow'}`);
  }
  for (const v of [...allSpacing].sort((a, b) => a - b)) lines.push(`--space-${v}`);
  for (const v of [...allRadii].sort((a, b) => a - b)) lines.push(`--radius-${v}`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ---------- AI Spec documentation page ----------
function genAISpecPage() {
  return `---
title: AI-Ready Spec
---

# AI-Ready Specification

A comprehensive, structured markdown file containing all design tokens, component specifications, and CSS class names — optimized for AI code generation agents.

<a href="/design-system-spec.md" download class="download-btn">Download design-system-spec.md</a>

## What's Inside

The spec file contains:

- **Color tokens** — All published colors with CSS variable names and hex values
- **Typography tokens** — Every text style with CSS class name, font, size, weight, line height
- **Spacing scale** — All unique padding/gap values from component extraction
- **Border radius tokens** — All unique radii from components
- **Shadow tokens** — Effects with CSS \`box-shadow\` values
- **Component specifications** — For each component: name, variants, properties, colors, typography, spacing, borders, effects, layout
- **CSS Custom Property reference** — Complete list of all \`--var\` names

## How to Use

Feed this file to an AI coding agent (e.g. Claude, Cursor, Copilot) along with your prompt:

\`\`\`
Using the attached design system spec, build a login page
with the exact colors, typography, spacing, and border radius
defined in the spec. Use the CSS custom properties and utility
classes from design-system.css.
\`\`\`

The agent will have all the information it needs to produce pixel-accurate output without access to Figma.

<style>
.download-btn {
  display: inline-block;
  padding: 10px 20px;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white) !important;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  margin: 8px 0 24px;
  transition: background 0.2s;
}
.download-btn:hover { background: var(--vp-c-brand-2); }
</style>
`;
}

// ============================================================================
// 11. Main orchestrator
// ============================================================================

function main() {
  const opts = parseArgs();
  const inputDir = opts.input;
  const outputDir = opts.output;

  console.log(`\nGenerating VitePress site`);
  console.log(`  input:  ${inputDir}`);
  console.log(`  output: ${outputDir}\n`);

  // ---- Load input data ----
  const tokensPath = path.join(inputDir, 'design-tokens.json');
  const manifestPath = path.join(inputDir, 'manifest.json');

  if (!fs.existsSync(tokensPath)) {
    console.error(`Error: design-tokens.json not found at ${tokensPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest.json not found at ${manifestPath}`);
    process.exit(1);
  }

  const tokens = readJSON(tokensPath);
  const manifest = readJSON(manifestPath);

  // ---- Analyze data ----
  const { icons, uiComps } = separateComponents(tokens);
  const pageOrder = tokens.pageOrder || [];
  const groups = groupComponentsByGroup(uiComps, pageOrder);
  const fontFamilies = extractFontFamilies(tokens);
  const theme = deriveTheme(tokens, opts.brandColor);

  const hasIcons = Object.keys(tokens.iconSvgs || {}).length > 0;
  const counts = manifest.counts || {};
  const hasColors = (counts.publishedColorStyles || 0) > 0;
  const hasTypography = (counts.publishedTextStyles || 0) > 0;
  const hasEffects = (counts.publishedEffectStyles || 0) > 0;

  const docsDir = path.join(outputDir, 'docs');
  const vpDir = path.join(docsDir, '.vitepress');
  const themeDir = path.join(vpDir, 'theme');
  const compDir = path.join(vpDir, 'components');
  const tokensDir = path.join(docsDir, 'tokens');
  const componentsDir = path.join(docsDir, 'components');
  const publicDir = path.join(docsDir, 'public');

  console.log('--- Generating files ---\n');

  // 1. package.json
  writeFile(path.join(outputDir, 'package.json'), genPackageJson());

  // 2. .vitepress/config.mts
  writeFile(
    path.join(vpDir, 'config.mts'),
    genVitepressConfig(manifest, tokens, groups, hasIcons, hasColors, hasTypography, hasEffects, fontFamilies, outputDir, true)
  );

  // 2b. .vitepress/brand-utils.mjs (color utilities for live brand patching)
  const colorsSource = fs.readFileSync(path.join(__dirname, 'colors.mjs'), 'utf-8');
  writeFile(path.join(vpDir, 'brand-utils.mjs'), colorsSource);

  // 3. theme/index.ts
  writeFile(path.join(themeDir, 'index.ts'), genThemeIndex());

  // 4. theme/custom.css
  writeFile(path.join(themeDir, 'custom.css'), genCustomCSS(theme, fontFamilies));

  // 5. docs/index.md
  writeFile(
    path.join(docsDir, 'index.md'),
    genHomePage(manifest, tokens, groups, Object.keys(tokens.iconSvgs || {}).length, hasEffects, opts.brandColor)
  );

  // 6. docs/getting-started.md
  writeFile(path.join(docsDir, 'getting-started.md'), genGettingStarted(manifest));

  // 7. docs/tokens/ (only pages with published styles)
  if (hasColors) {
    writeFile(path.join(tokensDir, 'colors.md'), genColorsPage(tokens));
  }
  if (hasTypography) {
    writeFile(path.join(tokensDir, 'typography.md'), genTypographyPage(tokens));
  }
  if (hasEffects) {
    const shadowsContent = genShadowsPage(tokens);
    if (shadowsContent) {
      writeFile(path.join(tokensDir, 'shadows.md'), shadowsContent);
    }
  }

  // 10. docs/components/index.md
  writeFile(path.join(componentsDir, 'index.md'), genComponentsOverview(groups, tokens));

  // 11. docs/components/<group-slug>.md
  for (const group of groups) {
    const slug = slugify(group.name);
    writeFile(
      path.join(componentsDir, `${slug}.md`),
      genComponentGroupPage(group, tokens)
    );
  }

  // 12. docs/components/icons.md (only if icons exist)
  if (hasIcons) {
    const iconsContent = genIconsPage(tokens);
    if (iconsContent) {
      writeFile(path.join(componentsDir, 'icons.md'), iconsContent);
    }
  }

  // 13. docs/resources/css-framework.md
  const resourcesDir = path.join(docsDir, 'resources');
  writeFile(path.join(resourcesDir, 'css-framework.md'), genCSSFrameworkPage(tokens));

  // 14. docs/resources/ai-spec.md
  writeFile(path.join(resourcesDir, 'ai-spec.md'), genAISpecPage());

  // 15. docs/public/design-system.css (CSS Framework)
  writeFile(path.join(publicDir, 'design-system.css'), genCSSFramework(tokens));

  // 16. docs/public/design-system-spec.md (AI Spec)
  writeFile(path.join(publicDir, 'design-system-spec.md'), genAISpec(tokens, manifest));

  // 17. Copy components/*.png -> docs/public/components/
  const componentsSrcDir = path.join(inputDir, 'components');
  if (fs.existsSync(componentsSrcDir)) {
    const copied = copyDir(componentsSrcDir, path.join(publicDir, 'components'));
    console.log(`\n  Copied ${copied} component image(s) to public/components/`);
  }

  // 14. Copy icons/*.svg -> docs/public/icons/
  const iconsSrcDir = path.join(inputDir, 'icons');
  if (fs.existsSync(iconsSrcDir)) {
    const copied = copyDir(iconsSrcDir, path.join(publicDir, 'icons'));
    console.log(`  Copied ${copied} icon(s) to public/icons/`);
  }

  // 15. Copy frame screenshots ([0-9]*.png in input root) -> docs/public/frames/
  if (fs.existsSync(inputDir)) {
    const rootFiles = fs.readdirSync(inputDir);
    const frameFiles = rootFiles.filter(f => /^[0-9].*\.png$/i.test(f));
    if (frameFiles.length > 0) {
      const framesDestDir = path.join(publicDir, 'frames');
      mkdirp(framesDestDir);
      for (const f of frameFiles) {
        copyFile(path.join(inputDir, f), path.join(framesDestDir, f));
      }
      console.log(`  Copied ${frameFiles.length} frame screenshot(s) to public/frames/`);
    }
  }

  // 16. Copy Vue templates from tools/figma/templates/ -> docs/.vitepress/components/
  const templatesDir = path.join(__dirname, '..', 'templates');
  if (fs.existsSync(templatesDir)) {
    const copied = copyDir(templatesDir, compDir);
    console.log(`  Copied ${copied} Vue component template(s) to .vitepress/components/`);
  } else {
    console.warn(`  Warning: templates directory not found at ${templatesDir}`);
  }

  // ---- Summary ----
  console.log('\n--- Summary ---\n');
  console.log(`  Component groups: ${groups.length}`);
  console.log(`  Total UI components: ${uiComps.length}`);
  console.log(`  Icons: ${Object.keys(tokens.iconSvgs || {}).length}`);
  console.log(`  Color tokens: ${resolveColors(tokens).data.length}`);
  console.log(`  Typography tokens: ${Object.keys(resolveTypography(tokens).data).length || resolveTypography(tokens).data.length}`);
  console.log(`  Effects: ${resolveEffects(tokens).data.length}`);
  console.log(`  Font families: ${fontFamilies.join(', ') || 'none detected'}`);
  console.log('');

  // ---- Optional: install dependencies ----
  if (opts.install) {
    console.log('--- Installing dependencies ---\n');
    try {
      execSync('npm install', { cwd: outputDir, stdio: 'inherit' });
      console.log('');
    } catch (err) {
      console.error('npm install failed:', err.message);
      process.exit(1);
    }
  }

  // ---- Optional: build site ----
  if (opts.build) {
    console.log('--- Building VitePress site ---\n');
    try {
      execSync('npx vitepress build docs', { cwd: outputDir, stdio: 'inherit' });
      console.log('\nBuild complete. Output at: ' + path.join(docsDir, '.vitepress', 'dist'));
    } catch (err) {
      console.error('Build failed:', err.message);
      process.exit(1);
    }
  }

  console.log('Done.\n');
}

export { main };
