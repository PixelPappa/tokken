import fs from 'fs';
import path from 'path';
import readline from 'readline';
import axios from 'axios';

const CONFIG_FILE = 'tokken.config.json';
const ENV_FILE = '.env';

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function ensureGitignore() {
  const gitignorePath = '.gitignore';
  const entries = ['.env', '.tokken/'];

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map((l) => l.trim());
    const missing = entries.filter((e) => !lines.includes(e));
    if (missing.length) {
      fs.appendFileSync(gitignorePath, '\n' + missing.join('\n') + '\n');
      console.log(`  Updated .gitignore to include ${missing.join(', ')}`);
    }
  } else {
    fs.writeFileSync(gitignorePath, entries.join('\n') + '\nnode_modules/\n');
    console.log('  Created .gitignore');
  }
}

async function testToken(token) {
  try {
    const res = await axios.get('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': token },
    });
    return res.data;
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('\n  tokken — Design tokens, extracted. Documentation, generated.\n');

  const rl = createInterface();
  const existingConfig = fs.existsSync(CONFIG_FILE);

  let config = {};
  if (existingConfig) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    console.log(`  Found existing ${CONFIG_FILE}`);
    if (config.figmaUrl) console.log(`  Figma URL: ${config.figmaUrl}`);
    if (config.brandColor) console.log(`  Brand color: ${config.brandColor}`);
    console.log('');
  }

  // --- Token ---
  const token = await ask(rl, '  Figma personal access token: ');

  if (!token) {
    console.log('\n  No token provided. Get one at: https://www.figma.com/settings\n');
    rl.close();
    process.exit(1);
  }

  console.log('  Testing connection...');
  const user = await testToken(token);

  if (!user) {
    console.log('\n  Invalid token. Check it and try again.\n');
    rl.close();
    process.exit(1);
  }

  console.log(`  Connected as: ${user.handle} (${user.email})\n`);

  // --- Figma URL (skip if already configured) ---
  if (!config.figmaUrl) {
    const url = await ask(rl, '  Figma file URL: ');
    if (url) {
      config.figmaUrl = url;
    }
  }

  // --- Brand color (skip if already configured) ---
  if (!config.brandColor) {
    const color = await ask(
      rl,
      '  Brand color (hex, e.g. #6164F0, or press Enter to auto-derive): '
    );
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      config.brandColor = color;
    }
  }

  // --- Output directory ---
  if (!config.outputDir) {
    config.outputDir = '.';
  }

  rl.close();

  // --- Write config file ---
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
  console.log(`  Created ${CONFIG_FILE}`);

  // --- Write .env ---
  fs.writeFileSync(ENV_FILE, `FIGMA_ACCESS_TOKEN=${token}\n`);
  console.log(`  Created ${ENV_FILE}`);

  // --- Ensure .gitignore ---
  ensureGitignore();

  console.log(`
  Setup complete! Next steps:

    tokken extract     Extract design tokens from Figma
    tokken generate    Generate documentation site
    tokken dev         Start dev server

  Or run everything at once:

    tokken sync
  `);
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
