<script setup lang="ts">
defineProps<{
  title: string
  image?: string
  description?: string
  variantSet?: boolean
}>()
</script>

<template>
  <div class="comp-demo">
    <div class="comp-demo-header">
      <h3>{{ title }}</h3>
      <p v-if="description" class="comp-desc">{{ description }}</p>
    </div>
    <div class="comp-demo-body">
      <div class="comp-preview">
        <slot name="preview">
          <img v-if="image" :src="image" :alt="title" loading="lazy" :class="{ clipped: variantSet }" />
          <span v-else class="no-preview">No preview available</span>
        </slot>
      </div>
      <div v-if="$slots.code" class="comp-code">
        <slot name="code" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.comp-demo {
  background: var(--dad-bg-surface);
  border: 1px solid var(--dad-border);
  border-radius: 12px;
  overflow: hidden;
  margin: 24px 0;
}
.comp-demo-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--dad-border);
}
.comp-demo-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--dad-text-primary);
  margin: 0;
}
.comp-desc {
  font-size: 13px;
  color: var(--dad-text-muted);
  margin-top: 4px;
}
.comp-demo-body {
  display: flex;
  flex-direction: column;
}
.comp-preview {
  padding: 32px;
  background: var(--dad-bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}
.comp-preview img {
  max-width: 100%;
  max-height: 720px;
  object-fit: contain;
}
.comp-preview img.clipped {
  clip-path: inset(4px round 4px);
}
.no-preview {
  font-size: 13px;
  color: var(--dad-text-muted);
  font-style: italic;
}
.comp-code {
  padding: 16px 20px;
  overflow-x: auto;
}
</style>
