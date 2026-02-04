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

console.log(`Building site from ${docsDir}...\n`);

const child = spawn('npx', ['vitepress', 'build', docsDir], {
  cwd: path.resolve(outputDir),
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  if (code === 0) {
    console.log(`\nBuild complete. Output at: ${path.join(docsDir, '.vitepress', 'dist')}`);
  }
  process.exit(code || 0);
});
