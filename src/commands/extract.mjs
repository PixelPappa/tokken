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
  // Token resolution order: env var > CLI flag > .env (already loaded by dotenv)
  return process.env.FIGMA_ACCESS_TOKEN || cliToken || null;
}

function parseExtractArgs() {
  const args = process.argv.slice(3); // skip 'node', 'cli.mjs', 'extract'
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
  const cliArgs = parseExtractArgs();

  const figmaUrl = cliArgs.url || config.figmaUrl;
  const accessToken = resolveToken(cliArgs.token);
  const outputDir = cliArgs.output || '.tokken';

  if (!figmaUrl) {
    console.error('Error: No Figma URL provided.\n');
    console.error('Provide a URL as an argument or set it in tokken.config.json:');
    console.error('  tokken extract https://www.figma.com/design/...');
    console.error('  OR run "tokken init" to configure.\n');
    process.exit(1);
  }

  if (!accessToken) {
    console.error('Error: No Figma access token found.\n');
    console.error('Set it in one of these ways:');
    console.error('  1. Run "tokken init" (creates .env file)');
    console.error('  2. Set FIGMA_ACCESS_TOKEN environment variable');
    console.error('  3. Use --token flag: tokken extract --token figd_...\n');
    process.exit(1);
  }

  // Dynamic import of FigmaExtractor (TypeScript, needs tsx)
  // We use the compiled version or tsx to run it
  const extractorPath = path.join(__dirname, '..', '..', 'dist', 'figma-extractor.js');

  // Import FigmaExtractor - tsx handles the TS compilation
  const { default: FigmaExtractor } = await import(extractorPath);

  try {
    const fileKey = FigmaExtractor.extractFileKey(figmaUrl);
    const resolvedOutput = path.resolve(outputDir);

    console.log(`Figma URL: ${figmaUrl}`);
    console.log(`File Key:  ${fileKey}`);
    console.log(`Output:    ${resolvedOutput}\n`);

    const extractor = new FigmaExtractor({
      accessToken,
      fileKey,
      outputDir: resolvedOutput,
      figmaUrl,
    });

    const manifest = await extractor.extract();

    console.log('Summary:');
    console.log(`  Frames:           ${manifest.frames.length}`);
    console.log(`  Color styles:     ${manifest.counts.publishedColorStyles}`);
    console.log(`  Text styles:      ${manifest.counts.publishedTextStyles}`);
    console.log(`  Effect styles:    ${manifest.counts.publishedEffectStyles}`);
    console.log(`  Components:       ${manifest.counts.publishedComponents}`);
    console.log(`  Component images: ${manifest.counts.componentImages}`);
    console.log(`  Icon SVGs:        ${manifest.counts.iconSvgs}`);
    console.log(`\nAll files saved to: ${resolvedOutput}`);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('\nMake sure your Figma URL is in this format:');
    console.error('  https://www.figma.com/file/FILE_KEY/FILENAME');
    console.error('  https://www.figma.com/design/FILE_KEY/FILENAME\n');
    process.exit(1);
  }
}

run();
