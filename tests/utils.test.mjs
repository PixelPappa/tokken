import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { copyDirRecursive, ensureGitignore } from '../src/utils.mjs';

let tmpDir;

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tokken-test-'));
}

describe('copyDirRecursive', () => {
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('copies files into a new directory', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(src, 'b.txt'), 'world');

    copyDirRecursive(src, dest);

    assert.strictEqual(fs.readFileSync(path.join(dest, 'a.txt'), 'utf-8'), 'hello');
    assert.strictEqual(fs.readFileSync(path.join(dest, 'b.txt'), 'utf-8'), 'world');
  });

  it('copies nested directories', () => {
    const src = path.join(tmpDir, 'src');
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(src, 'sub', 'deep.txt'), 'nested');
    const dest = path.join(tmpDir, 'dest');

    copyDirRecursive(src, dest);

    assert.strictEqual(fs.readFileSync(path.join(dest, 'sub', 'deep.txt'), 'utf-8'), 'nested');
  });

  it('skips existing files by default', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(src, 'a.txt'), 'new');
    fs.writeFileSync(path.join(dest, 'a.txt'), 'existing');

    copyDirRecursive(src, dest);

    assert.strictEqual(fs.readFileSync(path.join(dest, 'a.txt'), 'utf-8'), 'existing');
  });

  it('overwrites existing files when skipExisting is false', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(src, 'a.txt'), 'new');
    fs.writeFileSync(path.join(dest, 'a.txt'), 'existing');

    copyDirRecursive(src, dest, { skipExisting: false });

    assert.strictEqual(fs.readFileSync(path.join(dest, 'a.txt'), 'utf-8'), 'new');
  });
});

describe('ensureGitignore', () => {
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates .gitignore with required entries when none exists', () => {
    ensureGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('.env'));
    assert.ok(content.includes('.tokken/'));
    assert.ok(content.includes('node_modules/'));
  });

  it('appends missing entries to existing .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.env\n');
    ensureGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('.env'));
    assert.ok(content.includes('.tokken/'));
    assert.ok(content.includes('node_modules/'));
  });

  it('does not duplicate existing entries', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.env\n.tokken/\nnode_modules/\n');
    ensureGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const envCount = content.split('\n').filter(l => l.trim() === '.env').length;
    assert.strictEqual(envCount, 1);
  });
});
