import fs from 'fs';
import path from 'path';

function loadConfig() {
  const configPath = 'tokken.config.json';
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {};
}

function parseGenerateArgs() {
  const args = process.argv.slice(3); // skip 'node', 'cli.mjs', 'generate'
  let input = null;
  let output = null;
  let brandColor = null;
  let install = false;
  let build = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        input = args[++i];
        break;
      case '--output':
        output = args[++i];
        break;
      case '--brand-color':
        brandColor = args[++i];
        break;
      case '--install':
        install = true;
        break;
      case '--build':
        build = true;
        break;
    }
  }

  return { input, output, brandColor, install, build };
}

async function run() {
  const config = loadConfig();
  const cliArgs = parseGenerateArgs();

  const outputDir = cliArgs.output || config.outputDir || '.';
  const inputDir = cliArgs.input || '.tokken';
  const brandColor = cliArgs.brandColor || config.brandColor || null;

  // Check that extraction output exists
  const tokensPath = path.join(path.resolve(inputDir), 'design-tokens.json');
  if (!fs.existsSync(tokensPath)) {
    console.error(`Error: No design-tokens.json found at ${path.resolve(inputDir)}\n`);
    console.error('Run "tokken extract" first to extract design tokens from Figma.\n');
    process.exit(1);
  }

  // Build the argv array that generate-site.mjs's parseArgs() expects
  const fakeArgv = ['node', 'generate-site.mjs', '--input', path.resolve(inputDir), '--output', path.resolve(outputDir)];
  if (brandColor) {
    fakeArgv.push('--brand-color', brandColor);
  }
  if (cliArgs.install) {
    fakeArgv.push('--install');
  }
  if (cliArgs.build) {
    fakeArgv.push('--build');
  }

  // Temporarily override process.argv so parseArgs() reads our values
  const originalArgv = process.argv;
  process.argv = fakeArgv;

  try {
    const { main } = await import('../generate-site.mjs');
    await main();
  } finally {
    process.argv = originalArgv;
  }
}

run();
