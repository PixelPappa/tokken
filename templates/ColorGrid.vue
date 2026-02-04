<script setup lang="ts">
defineProps<{
  tokens: Record<string, { value: string; tailwind?: string; description?: string; figmaUsages?: number }>
  prefix?: string
}>()
</script>

<template>
  <div class="color-grid">
    <ColorSwatch
      v-for="(token, name) in tokens"
      :key="name"
      :name="String(name)"
      :hex="token.value"
      :tailwind="token.tailwind || (prefix ? `${prefix}-${name}` : undefined)"
      :description="token.description"
    />
  </div>
</template>

<style scoped>
.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin: 16px 0;
}
</style>
