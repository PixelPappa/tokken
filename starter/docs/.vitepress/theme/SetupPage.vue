<script setup>
import { ref, computed } from 'vue'

const token = ref('')
const figmaUrl = ref('')
const brandColor = ref('')
const status = ref('idle')
const syncLog = ref('')
const errorMessage = ref('')

const canSubmit = computed(() =>
  token.value.trim() && figmaUrl.value.trim() && status.value !== 'syncing'
)

// Uses raw DOM + window.setInterval so it survives VitePress
// destroying the Vue app during server restart.
function startReloadPolling() {
  if (window.__tokkenPoll) return

  // Inject overlay
  if (!document.getElementById('tokken-reload-overlay')) {
    const s = document.createElement('style')
    s.textContent = '@keyframes _tokken_spin{to{transform:rotate(360deg)}}'
    document.head.appendChild(s)
    const el = document.createElement('div')
    el.id = 'tokken-reload-overlay'
    el.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#1b1b1f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px'
    el.innerHTML = '<div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.1);border-top-color:#646cff;border-radius:50%;animation:_tokken_spin .8s linear infinite"></div><div style="color:rgba(255,255,255,0.8);font-size:14px;font-family:system-ui,sans-serif">Building your design system docs\u2026</div>'
    document.body.appendChild(el)
  }

  // Wait a few seconds for VitePress to start restarting,
  // then poll until the new server is up.
  let attempts = 0
  window.__tokkenPoll = window.setInterval(async () => {
    attempts++
    if (attempts > 120) { // ~2 minutes
      clearInterval(window.__tokkenPoll)
      window.__tokkenPoll = null
      document.getElementById('tokken-reload-overlay')?.remove()
      return
    }
    try {
      const r = await fetch('/', { cache: 'no-store' })
      if (r.ok) {
        clearInterval(window.__tokkenPoll)
        window.__tokkenPoll = null
        // Full navigation to the new site (not reload of dead page)
        window.location.href = window.location.origin + '/'
      }
    } catch {}
  }, 1000)
}

async function submit() {
  if (!canSubmit.value) return
  status.value = 'syncing'
  syncLog.value = ''
  errorMessage.value = ''

  // Persist flag so the recovery <head> script can pick it up
  // even if Vite's HMR forces a page reload mid-sync.
  sessionStorage.setItem('tokken-reloading', '1')

  try {
    const res = await fetch('/__tokken-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.value.trim(),
        url: figmaUrl.value.trim(),
        brandColor: brandColor.value.trim() || undefined
      })
    })

    if (!res.ok) throw new Error(`Server returned ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      syncLog.value += decoder.decode(value)
    }

    if (syncLog.value.includes('[done]')) {
      status.value = 'done'
      startReloadPolling()
    } else if (syncLog.value.includes('[error]')) {
      status.value = 'error'
      sessionStorage.removeItem('tokken-reloading')
    }
  } catch (err) {
    // VitePress restart kills the stream — this is the normal path.
    // If we got far enough in the sync, treat it as success and poll.
    if (syncLog.value.includes('[done]') ||
        syncLog.value.includes('Extraction complete') ||
        syncLog.value.includes('Generating') ||
        syncLog.value.includes('Site generated')) {
      status.value = 'done'
      startReloadPolling()
    } else {
      status.value = 'error'
      sessionStorage.removeItem('tokken-reloading')
      errorMessage.value = err.message || 'Connection failed'
    }
  }
}
</script>

<template>
  <div class="setup-container">
    <div class="setup-header">
      <h1>Welcome to Tokken</h1>
      <p>Connect your Figma file to generate design system documentation.</p>
    </div>
    <div class="setup-form">
      <div class="setup-field">
        <label>Figma Personal Access Token</label>
        <input
          v-model="token"
          type="password"
          placeholder="figd_..."
          class="setup-input"
          :disabled="status === 'syncing'"
        />
        <div class="setup-hint">
          Generate one at <a href="https://www.figma.com/developers/api#access-tokens" target="_blank">figma.com/developers</a>. Tokens expire every 90 days.
        </div>
      </div>
      <div class="setup-field">
        <label>Figma File URL</label>
        <input
          v-model="figmaUrl"
          type="url"
          placeholder="https://www.figma.com/design/..."
          class="setup-input"
          :disabled="status === 'syncing'"
        />
        <div class="setup-hint">
          Open your Figma file and copy the URL from the browser address bar.
        </div>
      </div>
      <div class="setup-field">
        <label>Brand Color <span class="setup-optional">(optional)</span></label>
        <div class="setup-color-row">
          <input
            v-model="brandColor"
            type="text"
            placeholder="#6164F0"
            class="setup-input setup-input--color"
            :disabled="status === 'syncing'"
          />
          <div
            v-if="brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor)"
            class="setup-color-preview"
            :style="{ background: brandColor }"
          ></div>
        </div>
        <div class="setup-hint">
          Used for the documentation theme. If not set, one will be auto-derived from your Figma file.
        </div>
      </div>
      <button
        class="setup-submit"
        @click="submit"
        :disabled="!canSubmit"
      >
        {{ status === 'syncing' ? 'Connecting & Syncing...' : 'Connect & Sync' }}
      </button>
    </div>
    <div v-if="syncLog" class="setup-log">
      <pre class="setup-log-output">{{ syncLog }}</pre>
      <div v-if="status === 'done'" class="setup-status setup-status--done">
        Reloading with your design system...
      </div>
      <div v-if="status === 'error'" class="setup-status setup-status--error">
        {{ errorMessage || 'Something went wrong. Check the log above.' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-container { max-width: 560px; margin: 0 auto; padding: 48px 24px; }
.setup-header { text-align: center; margin-bottom: 40px; }
.setup-header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.setup-header p { color: var(--vp-c-text-2); font-size: 16px; }
.setup-form { display: flex; flex-direction: column; gap: 24px; }
.setup-field label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.setup-optional { font-weight: 400; color: var(--vp-c-text-3); }
.setup-input {
  width: 100%; padding: 10px 14px; font-size: 14px;
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; color: var(--vp-c-text-1);
  font-family: inherit; box-sizing: border-box;
}
.setup-input:focus { outline: none; border-color: var(--vp-c-brand-1); }
.setup-input:disabled { opacity: 0.6; }
.setup-input--color { flex: 1; }
.setup-color-row { display: flex; align-items: center; gap: 10px; }
.setup-color-preview {
  width: 36px; height: 36px; border-radius: 8px;
  border: 1px solid var(--vp-c-divider); flex-shrink: 0;
}
.setup-hint { font-size: 12px; color: var(--vp-c-text-3); margin-top: 4px; }
.setup-hint a { color: var(--vp-c-brand-1); }
.setup-submit {
  padding: 12px 24px; font-size: 15px; font-weight: 600;
  color: var(--vp-c-white); background: var(--vp-c-brand-1);
  border: none; border-radius: 8px; cursor: pointer;
  transition: background 0.2s; margin-top: 8px;
}
.setup-submit:hover:not(:disabled) { background: var(--vp-c-brand-2); }
.setup-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.setup-log { margin-top: 24px; border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden; }
.setup-log-output {
  margin: 0; padding: 12px 16px; font-size: 12px; font-family: var(--vp-font-family-mono);
  background: var(--vp-c-bg); color: var(--vp-c-text-2);
  white-space: pre-wrap; word-break: break-all; line-height: 1.6;
  max-height: 300px; overflow-y: auto;
}
.setup-status { padding: 8px 16px; font-size: 12px; font-weight: 600; }
.setup-status--done { background: #0a3d1f; color: #4ade80; }
.setup-status--error { background: #3d0a0a; color: #f87171; }
</style>
