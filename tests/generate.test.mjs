import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

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

  it('creates custom.css with brand variables', () => {
    const css = fs.readFileSync(
      path.join(outputDir, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    assert.ok(css.includes('--vp-c-brand-1'));
    assert.ok(css.includes('--dad-accent'));
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

  it('uses brand color as vp-c-brand-1', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    assert.ok(css.includes('--vp-c-brand-1: #FF6600'));
  });

  it('uses brand color as dad-accent', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    assert.ok(css.includes('--dad-accent: #FF6600'));
  });

  it('derives brand-2 darker than brand-1', () => {
    const css = fs.readFileSync(
      path.join(outputDir2, 'docs', '.vitepress', 'theme', 'custom.css'), 'utf-8'
    );
    const match = css.match(/--vp-c-brand-2:\s*([^;]+);/);
    assert.ok(match, 'brand-2 variable should exist');
    assert.notStrictEqual(match[1].trim(), '#FF6600', 'brand-2 should differ from brand-1');
  });
});
