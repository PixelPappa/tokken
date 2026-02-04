<script setup lang="ts">
defineProps<{
  tokens: Record<string, {
    value: string
    tailwind?: string
    description?: string
  }>
}>()
</script>

<template>
  <div class="shadow-grid">
    <div v-for="(token, name) in tokens" :key="name" class="shadow-item">
      <div class="shadow-card" :style="{ boxShadow: token.value }" />
      <div class="shadow-name">{{ name }}</div>
      <div class="shadow-css">{{ token.value }}</div>
      <CopyButton v-if="token.tailwind" :text="token.tailwind" />
    </div>
  </div>
</template>

<style scoped>
.shadow-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin: 16px 0;
}
.shadow-item {
  text-align: center;
}
.shadow-card {
  width: 200px;
  height: 120px;
  background: var(--dad-bg-surface);
  border-radius: 12px;
  margin-bottom: 8px;
}
.shadow-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--dad-text-primary);
  margin-bottom: 4px;
}
.shadow-css {
  font-size: 11px;
  font-family: monospace;
  color: var(--dad-text-muted);
  max-width: 200px;
  margin-bottom: 4px;
}
</style>
