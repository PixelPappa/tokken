<script setup lang="ts">
defineProps<{
  tokens: Record<string, {
    value: string
    px: string
    tailwind?: string
  }>
}>()
</script>

<template>
  <div class="spacing-scale">
    <div v-for="(token, name) in tokens" :key="name" class="spacing-row">
      <span class="spacing-label">{{ name }}</span>
      <span class="spacing-bar" :style="{ width: token.px }" />
      <span class="spacing-meta">
        {{ token.px }} / {{ token.value }}
      </span>
      <CopyButton v-if="token.tailwind" :text="token.tailwind" />
    </div>
  </div>
</template>

<style scoped>
.spacing-scale {
  margin: 16px 0;
}
.spacing-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}
.spacing-label {
  font-size: 13px;
  font-family: monospace;
  color: var(--dad-text-secondary);
  width: 40px;
  text-align: right;
  flex-shrink: 0;
}
.spacing-bar {
  height: 24px;
  background: var(--dad-accent);
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s;
}
.spacing-meta {
  font-size: 11px;
  font-family: monospace;
  color: var(--dad-text-muted);
  width: 120px;
  flex-shrink: 0;
}
</style>
