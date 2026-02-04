import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { copyDirRecursive } from '../utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadConfig() {
  const configPath = 'tokken.config.json';
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {};
}

const config = loadConfig();
const outputDir = config.outputDir || '.';
const docsDir = path.join(path.resolve(outputDir), 'docs');

if (!fs.existsSync(docsDir)) {
  // Safety check: only auto-scaffold if directory looks intentional
  const hasConfig = fs.existsSync('tokken.config.json');
  const entries = fs.readdirSync(process.cwd()).filter((e) => !e.startsWith('.'));
  const isEmpty = entries.length === 0;
  const isTokenProject = hasConfig || isEmpty || (entries.length === 1 && entries[0] === 'package.json');

  if (!isTokenProject) {
    console.error('Error: No docs/ directory found and this does not look like a tokken project.\n');
    console.error('Run "tokken init" in an empty directory to get started.\n');
    process.exit(1);
  }

  console.log('No docs/ directory found. Scaffolding starter site...\n');
  const starterDir = path.join(__dirname, '..', '..', 'starter');

  if (!fs.existsSync(starterDir)) {
    console.error('Error: Starter template not found. Reinstall gettokken.\n');
    process.exit(1);
  }

  copyDirRecursive(starterDir, process.cwd());

  // Install dependencies if needed
  if (!fs.existsSync('node_modules')) {
    const { execSync } = await import('child_process');
    console.log('Installing dependencies...\n');
    execSync('npm install', { stdio: 'inherit' });
  }
}

console.log(`Starting dev server at ${docsDir}...\n`);

const child = spawn('npx', ['vitepress', 'dev', docsDir], {
  cwd: path.resolve(outputDir),
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
