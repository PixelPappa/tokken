<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  text: string
  label?: string
}>()

const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1200)
}
</script>

<template>
  <button class="copy-btn" :class="{ copied }" @click="copy" :title="`Copy ${text}`">
    {{ copied ? 'Copied!' : (label || text) }}
  </button>
</template>

<style scoped>
.copy-btn {
  font-size: 11px;
  font-family: monospace;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--dad-border);
  background: var(--dad-bg-elevated);
  color: var(--dad-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover {
  border-color: var(--dad-accent);
  color: var(--dad-text-primary);
}
.copy-btn.copied {
  background: var(--dad-accent);
  color: #000;
  border-color: var(--dad-accent);
}
</style>
