import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { copyDirRecursive, ensureGitignore } from '../utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('\n  tokken — Design tokens, extracted. Documentation, generated.\n');
  console.log('  Scaffolding starter site...\n');

  const starterDir = path.join(__dirname, '..', '..', 'starter');

  if (!fs.existsSync(starterDir)) {
    console.error('  Error: Starter template not found. Reinstall gettokken.\n');
    process.exit(1);
  }

  // Copy starter template to current directory (skip existing files)
  const entries = fs.readdirSync(starterDir, { withFileTypes: true });
  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    const srcPath = path.join(starterDir, entry.name);
    const destPath = path.join(process.cwd(), entry.name);

    if (entry.isDirectory()) {
      const before = countFiles(destPath);
      copyDirRecursive(srcPath, destPath);
      const after = countFiles(destPath);
      created += after - before;
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  created ${entry.name}`);
      created++;
    } else {
      skipped++;
    }
  }

  if (created > 0) {
    console.log(`  ${created} file(s) created`);
  }
  if (skipped > 0) {
    console.log(`  ${skipped} file(s) skipped (already exist)`);
  }

  // Ensure .gitignore
  ensureGitignore();

  // Install dependencies if needed
  if (!fs.existsSync('node_modules')) {
    console.log('\n  Installing dependencies...\n');
    execSync('npm install', { stdio: 'inherit' });
  }

  console.log(`
  Ready! Next step:

    tokken dev

  This starts a dev server where you can connect
  your Figma file and generate your design system.
  `);
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
