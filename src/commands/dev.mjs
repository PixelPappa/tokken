import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

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
  console.error(`Error: No docs/ directory found at ${path.resolve(outputDir)}\n`);
  console.error('Run "tokken generate" first to generate the documentation site.\n');
  process.exit(1);
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
