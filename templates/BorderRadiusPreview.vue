<script setup lang="ts">
defineProps<{
  tokens: Record<string, {
    value: string
    tailwind?: string
  }>
}>()
</script>

<template>
  <div class="radius-grid">
    <div v-for="(token, name) in tokens" :key="name" class="radius-item">
      <div class="radius-box" :style="{ borderRadius: token.value }" />
      <div class="radius-name">{{ name }}</div>
      <div class="radius-value">{{ token.value }}</div>
      <CopyButton v-if="token.tailwind" :text="token.tailwind" />
    </div>
  </div>
</template>

<style scoped>
.radius-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin: 16px 0;
}
.radius-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.radius-box {
  width: 64px;
  height: 64px;
  background: var(--dad-accent);
}
.radius-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--dad-text-primary);
}
.radius-value {
  font-size: 11px;
  font-family: monospace;
  color: var(--dad-text-muted);
}
</style>
