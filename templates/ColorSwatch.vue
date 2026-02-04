<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  name: string
  hex: string
  tailwind?: string
  description?: string
}>()

const copied = ref(false)

function hexToLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

const textColor = computed(() => hexToLuminance(props.hex) > 0.5 ? '#141218' : '#e6e0e9')

async function copy() {
  await navigator.clipboard.writeText(props.hex)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1200)
}
</script>

<template>
  <div class="color-swatch" @click="copy" :title="`Click to copy ${hex}`">
    <div class="preview" :style="{ background: hex }">
      <span class="preview-text" :style="{ color: textColor }">
        {{ copied ? 'Copied!' : 'Aa' }}
      </span>
    </div>
    <div class="info">
      <div class="name">{{ name }}</div>
      <div class="hex-value">{{ hex }}</div>
      <div v-if="tailwind" class="tailwind">{{ tailwind }}</div>
      <div v-if="description" class="desc">{{ description }}</div>
    </div>
  </div>
</template>

<style scoped>
.color-swatch {
  background: var(--dad-bg-surface);
  border: 1px solid var(--dad-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}
.color-swatch:hover {
  border-color: var(--dad-accent);
}
.preview {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-text {
  font-size: 14px;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.15s;
}
.color-swatch:hover .preview-text {
  opacity: 1;
}
.info {
  padding: 8px 10px;
}
.name {
  font-size: 12px;
  font-weight: 600;
  color: var(--dad-text-primary);
}
.hex-value {
  font-size: 11px;
  font-family: monospace;
  color: var(--dad-text-secondary);
}
.tailwind {
  font-size: 10px;
  font-family: monospace;
  color: var(--dad-text-muted);
  margin-top: 2px;
}
.desc {
  font-size: 10px;
  color: var(--dad-text-muted);
  margin-top: 2px;
}
</style>
