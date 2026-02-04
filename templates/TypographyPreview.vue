<script setup lang="ts">
defineProps<{
  tokens: Record<string, {
    value: string
    rem?: string
    lineHeight?: string
    weights?: number[]
    tailwind?: string
  }>
  fontFamily?: string
}>()
</script>

<template>
  <div class="type-table">
    <div class="type-header">
      <span class="th-preview">Preview</span>
      <span class="th-name">Name</span>
      <span class="th-size">Size</span>
      <span class="th-lh">Line Height</span>
      <span class="th-weight">Weight</span>
    </div>
    <div v-for="(token, name) in tokens" :key="name" class="type-row">
      <span
        class="td-preview"
        :style="{
          fontFamily: fontFamily || 'Open Sans, sans-serif',
          fontSize: token.value,
          fontWeight: token.weights?.[token.weights.length - 1] || 400,
          lineHeight: token.lineHeight ? token.lineHeight + 'px' : 'normal',
        }"
      >
        The quick brown fox jumps
      </span>
      <span class="td-name">{{ name }}</span>
      <span class="td-size">{{ token.value }}</span>
      <span class="td-lh">{{ token.lineHeight || '—' }}</span>
      <span class="td-weight">{{ token.weights?.join(', ') || '400' }}</span>
    </div>
  </div>
</template>

<style scoped>
.type-table {
  margin: 16px 0;
  border: 1px solid var(--dad-border);
  border-radius: 8px;
  overflow: hidden;
}
.type-header {
  display: grid;
  grid-template-columns: 1fr 140px 60px 90px 60px;
  gap: 12px;
  padding: 8px 16px;
  background: var(--dad-bg-mute);
  border-bottom: 1px solid var(--dad-border);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dad-text-muted);
}
.type-row {
  display: grid;
  grid-template-columns: 1fr 140px 60px 90px 60px;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dad-border);
  background: var(--dad-bg-surface);
}
.type-row:last-child {
  border-bottom: none;
}
.td-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dad-text-primary);
}
.td-name {
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  color: var(--dad-text-secondary);
}
.td-size,
.td-lh,
.td-weight {
  font-size: 12px;
  font-family: monospace;
  color: var(--dad-text-muted);
}
</style>
