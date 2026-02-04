import { defineConfig } from 'vitepress'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs'

const __configDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(__configDir, '../..')

function isLocalhost(req: any): boolean {
  const addr = req.socket?.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function ensureGitignore() {
  const gitignorePath = resolve(projectDir, '.gitignore')
  const entries = ['.env', '.tokken/', 'node_modules/']
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    const lines = content.split('\n').map(l => l.trim())
    const missing = entries.filter(e => !lines.includes(e))
    if (missing.length) {
      appendFileSync(gitignorePath, '\n' + missing.join('\n') + '\n')
    }
  } else {
    writeFileSync(gitignorePath, entries.join('\n') + '\n')
  }
}

export default defineConfig({
  title: 'Tokken',
  description: 'Design tokens, extracted. Documentation, generated.',
  themeConfig: {
    nav: [],
    sidebar: [],
  },
  vite: {
    plugins: [{
      name: 'tokken-setup',
      configureServer(server) {
        server.middlewares.use('/__tokken-setup', (req: any, res: any, next: any) => {
          if (req.method !== 'POST') return next()

          if (!isLocalhost(req)) {
            res.statusCode = 403
            res.end('Forbidden: setup endpoint is only available from localhost')
            return
          }

          let body = ''
          req.on('data', (c: Buffer) => body += c)
          req.on('end', () => {
            try {
              const { token, url, brandColor } = JSON.parse(body)
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.setHeader('Cache-Control', 'no-cache')

              const write = (text: string) => { try { res.write(text + '\n') } catch {} }

              if (!token || !url) {
                write('[error] Token and URL are required')
                res.end()
                return
              }

              // Write .env
              write('[setup] Saving Figma token...')
              writeFileSync(resolve(projectDir, '.env'), `FIGMA_ACCESS_TOKEN=${token}\n`)

              // Write tokken.config.json
              write('[setup] Saving configuration...')
              const config: any = { figmaUrl: url, outputDir: '.' }
              if (brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor)) {
                config.brandColor = brandColor
              }
              writeFileSync(
                resolve(projectDir, 'tokken.config.json'),
                JSON.stringify(config, null, 2) + '\n'
              )

              // Ensure .gitignore
              ensureGitignore()

              // Run tokken sync
              write('[sync] Starting extraction from Figma...\n')
              const sync = spawn('npx', ['tokken', 'sync', url, '--output', projectDir], {
                cwd: projectDir,
                env: { ...process.env, FIGMA_ACCESS_TOKEN: token },
                shell: true
              })

              sync.stdout.on('data', (d: Buffer) => write(d.toString().trimEnd()))
              sync.stderr.on('data', (d: Buffer) => write(d.toString().trimEnd()))

              sync.on('close', (code: number) => {
                write(code === 0 ? '\n[done] Sync complete!' : `\n[error] Sync failed (exit code ${code})`)
                res.end()
              })
            } catch (err: any) {
              res.setHeader('Content-Type', 'text/plain')
              res.write(`[error] ${err.message}\n`)
              res.end()
            }
          })
        })
      }
    }]
  },
})
