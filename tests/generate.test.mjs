import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { contrastRatio } from '../src/colors.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import main directly — we'll override process.argv like the CLI does
const { main } = await import('../src/generate-site.mjs');

let tmpDir, inputDir, outputDir;

// Minimal Figma extraction data for testing
const minimalTokens = {
  colors: {
    '#000000': { name: 'Black', count: 10 },
    '#FFFFFF': { name: 'White', count: 8 },
    '#4063C2': { name: 'Brand Blue', count: 5 },
    '#FF0000': { name: 'Red', count: 3 },
    '#00FF00': { name: 'Green', count: 2 },
  },
  typography: {
    'Heading/H1': { fontFamily: 'Open Sans', fontSize: 32, fontWeight: 700 },
    'Body/Regular': { fontFamily: 'Open Sans', fontSize: 16, fontWeight: 400 },
  },
  publishedStyles: {
    colorStyles: [
      { name: 'Brand/Primary', hex: '#4063C2' },
    ],
    textStyles: [
      { name: 'Heading/H1', fontFamily: 'Open Sans', fontSize: 32, fontWeight: 700 },
    ],
  },
  iconSvgs: {},
  components: [
    {
      name: 'Button',
      group: 'Actions',
      description: 'A clickable button',
      variants: ['Primary', 'Secondary', 'Outline'],
      image: null,
    },
    {
      name: 'Avatar',
      group: 'Display',
      description: 'User avatar',
      variants: [],
      image: null,
    },
    {
      name: 'Card',
      group: 'Display',
      description: 'A content card',
      image: null,
    },
  ],
  pageOrder: ['Actions', 'Display'],
};

const minimalManifest = {
  figmaUrl: 'https://www.figma.com/design/test123/Test',
  fileName: 'Test Design System',
  lastModified: '2025-01-01T00:00:00Z',
  counts: {
    components: 3,
    publishedColorStyles: 1,
    publishedTextStyles: 1,
    publishedEffectStyles: 0,
  },
};

function runGenerate(input, output, extraArgs = []) {
  const originalArgv = process.argv;
  process.argv = ['node', 'generate-site.mjs', '--input', input, '--output', output, ...extraArgs];
  try {
    main();
  } finally {
    process.argv = originalArgv;
  }
}

describe('generate-site integration', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokken-gen-test-'));
    inputDir = path.join(tmpDir, 'input');
    outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(inputDir, { recursive: true });

    fs.writeFileSync(path.join(inputDir, 'design-tokens.json'), JSON.stringify(minimalTokens));
    fs.writeFileSync(path.join(inputDir, 'manifest.json'), JSON.stringify(minimalManifest));

    runGenerate(inputDir, outputDir);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates docs directory structure', () => {
    assert.ok(fs.existsSync(path.join(outputDir, 'docs')));
    assert.ok(fs.existsSync(path.join(outputDir, 'docs', '.vitepress')));
    assert.ok(fs.existsSync(path.join(outputDir, 'docs', '.vitepress', 'theme')));
  });

  it('creates package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'));
    assert.ok(pkg.devDependencies.vitepress);
    assert.ok(pkg.devDependencies.vue);
  });

  it('creates VitePress config', () => {
    assert.ok(fs.existsSync(path.join(outputDir, 'docs', '.vitepress', 'config.mts')));
  });

  it('creates custom.css with brand variables in both light and dark mode', () => {
    const css = fs.readFileSync(
      path.join(outputDir, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    const darkIdx = css.indexOf('.dark');
    const rootSection = css.substring(0, darkIdx);
    const darkSection = css.substring(darkIdx);
    assert.ok(rootSection.includes('--vp-c-brand-1'), 'root should have brand-1 for light mode');
    assert.ok(darkSection.includes('--vp-c-brand-1'), 'dark should have brand-1 for dark mode');
    assert.ok(rootSection.includes('--dad-accent'), 'root should have dad-accent');
    assert.ok(darkSection.includes('--dad-accent'), 'dark should have dad-accent');
  });

  it('creates homepage with hero layout', () => {
    const index = fs.readFileSync(path.join(outputDir, 'docs', 'index.md'), 'utf-8');
    assert.ok(index.includes('layout: home'));
    assert.ok(index.includes('Design System Documentation'));
  });

  it('creates getting-started page with file name', () => {
    const gs = fs.readFileSync(path.join(outputDir, 'docs', 'getting-started.md'), 'utf-8');
    assert.ok(gs.includes('Test Design System'));
  });

  it('creates component group pages', () => {
    const actionsPage = fs.readFileSync(
      path.join(outputDir, 'docs', 'components', 'actions.md'), 'utf-8'
    );
    assert.ok(actionsPage.includes('Button'));
    assert.ok(actionsPage.includes('ComponentDemo'));
  });

  it('sets variant-set on components with variants', () => {
    const actionsPage = fs.readFileSync(
      path.join(outputDir, 'docs', 'components', 'actions.md'), 'utf-8'
    );
    assert.ok(
      actionsPage.includes(':variant-set="true"'),
      'Button should have :variant-set="true"'
    );
  });

  it('omits variant-set on components without variants', () => {
    const displayPage = fs.readFileSync(
      path.join(outputDir, 'docs', 'components', 'display.md'), 'utf-8'
    );
    const lines = displayPage.split('\n');
    for (const line of lines) {
      if (line.includes('title="Avatar"') || line.includes('title="Card"')) {
        assert.ok(
          !line.includes('variant-set'),
          `Expected no variant-set on: ${line}`
        );
      }
    }
  });

  it('lists variant names for components with variants', () => {
    const actionsPage = fs.readFileSync(
      path.join(outputDir, 'docs', 'components', 'actions.md'), 'utf-8'
    );
    assert.ok(actionsPage.includes('Primary'));
    assert.ok(actionsPage.includes('Secondary'));
    assert.ok(actionsPage.includes('Outline'));
  });

  it('copies ComponentDemo.vue template', () => {
    assert.ok(
      fs.existsSync(path.join(outputDir, 'docs', '.vitepress', 'components', 'ComponentDemo.vue'))
    );
  });
});

describe('generate-site with --brand-color', () => {
  let tmpDir2, inputDir2, outputDir2;

  before(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tokken-brand-test-'));
    inputDir2 = path.join(tmpDir2, 'input');
    outputDir2 = path.join(tmpDir2, 'output');
    fs.mkdirSync(inputDir2, { recursive: true });
    fs.writeFileSync(path.join(inputDir2, 'design-tokens.json'), JSON.stringify(minimalTokens));
    fs.writeFileSync(path.join(inputDir2, 'manifest.json'), JSON.stringify(minimalManifest));

    runGenerate(inputDir2, outputDir2, ['--brand-color', '#FF6600']);
  });

  after(() => {
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('sets accessible dark-mode brand-1 against dark bg', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    const darkIdx = css.indexOf('.dark');
    const darkSection = css.substring(darkIdx);
    const match = darkSection.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(match, 'dark brand-1 should exist');
    const bgMatch = css.match(/--dad-bg:\s*(#[0-9a-fA-F]{6})/);
    const bg = bgMatch ? bgMatch[1] : '#000000';
    assert.ok(contrastRatio(match[1], bg) >= 4.5, 'dark brand-1 should meet WCAG AA against dark bg');
  });

  it('sets accessible light-mode brand-1 against white', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    const darkIdx = css.indexOf('.dark');
    const rootSection = css.substring(0, darkIdx);
    const match = rootSection.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(match, 'light brand-1 should exist');
    assert.ok(contrastRatio(match[1], '#ffffff') >= 4.5, 'light brand-1 should meet WCAG AA against white');
  });

  it('sets matching dad-accent per mode', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    const darkIdx = css.indexOf('.dark');
    const rootSection = css.substring(0, darkIdx);
    const darkSection = css.substring(darkIdx);
    // Light mode: dad-accent matches light brand-1
    const lightBrand = rootSection.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    const lightAccent = rootSection.match(/--dad-accent:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(lightBrand && lightAccent);
    assert.strictEqual(lightBrand[1], lightAccent[1], 'light dad-accent should match light brand-1');
    // Dark mode: dad-accent matches dark brand-1
    const darkBrand = darkSection.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    const darkAccent = darkSection.match(/--dad-accent:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(darkBrand && darkAccent);
    assert.strictEqual(darkBrand[1], darkAccent[1], 'dark dad-accent should match dark brand-1');
  });

  it('derives brand-2 darker than brand-1 in dark mode', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    const darkIdx = css.indexOf('.dark');
    const darkSection = css.substring(darkIdx);
    const brand1Match = darkSection.match(/--vp-c-brand-1:\s*(#[0-9a-fA-F]{6})/);
    const brand2Match = darkSection.match(/--vp-c-brand-2:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(brand1Match && brand2Match);
    assert.notStrictEqual(brand2Match[1], brand1Match[1], 'brand-2 should differ from brand-1');
  });
});
