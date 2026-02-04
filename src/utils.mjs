import fs from 'fs';
import path from 'path';

export function copyDirRecursive(src, dest, { skipExisting = true } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, { skipExisting });
    } else if (!skipExisting || !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function ensureGitignore(dir = process.cwd()) {
  const gitignorePath = path.join(dir, '.gitignore');
  const entries = ['.env', '.tokken/', 'node_modules/'];

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map((l) => l.trim());
    const missing = entries.filter((e) => !lines.includes(e));
    if (missing.length) {
      fs.appendFileSync(gitignorePath, '\n' + missing.join('\n') + '\n');
    }
  } else {
    fs.writeFileSync(gitignorePath, entries.join('\n') + '\n');
  }
}
