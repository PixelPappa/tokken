import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current working directory
dotenv.config();

function loadConfig() {
  const configPath = 'tokken.config.json';
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {};
}

function resolveToken(cliToken) {
  return process.env.FIGMA_ACCESS_TOKEN || cliToken || null;
}

function parseSyncArgs() {
  const args = process.argv.slice(3);
  let url = null;
  let token = null;
  let output = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' || args[i] === '-t') {
      token = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      output = args[++i];
    } else if (!args[i].startsWith('-')) {
      url = args[i];
    }
  }

  return { url, token, output };
}

async function run() {
  const config = loadConfig();
  const cliArgs = parseSyncArgs();

  const figmaUrl = cliArgs.url || config.figmaUrl;
  const accessToken = resolveToken(cliArgs.token);
  const outputDir = cliArgs.output || config.outputDir || '.';
  const brandColor = config.brandColor || null;

  if (!figmaUrl) {
    console.error('Error: No Figma URL provided.\n');
    console.error('Provide a URL or run "tokken init" to configure.\n');
    process.exit(1);
  }

  if (!accessToken) {
    console.error('Error: No Figma access token found.\n');
    console.error('Run "tokken init" or set FIGMA_ACCESS_TOKEN.\n');
    process.exit(1);
  }

  // --- Step 1: Extract ---
  console.log('=== Step 1: Extracting from Figma ===\n');

  const extractorPath = path.join(__dirname, '..', '..', 'dist', 'figma-extractor.js');
  const { default: FigmaExtractor } = await import(extractorPath);

  const fileKey = FigmaExtractor.extractFileKey(figmaUrl);
  const resolvedOutput = path.resolve(outputDir);

  const extractor = new FigmaExtractor({
    accessToken,
    fileKey,
    outputDir: resolvedOutput,
    figmaUrl,
  });

  await extractor.extract();

  // --- Step 2: Generate ---
  console.log('\n=== Step 2: Generating documentation site ===\n');

  const fakeArgv = [
    'node', 'generate-site.mjs',
    '--input', resolvedOutput,
    '--output', resolvedOutput,
  ];
  if (brandColor) {
    fakeArgv.push('--brand-color', brandColor);
  }

  const originalArgv = process.argv;
  process.argv = fakeArgv;

  try {
    const { main } = await import('../generate-site.mjs');
    await main();
  } finally {
    process.argv = originalArgv;
  }

  console.log('\nSync complete!\n');
}

run().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
