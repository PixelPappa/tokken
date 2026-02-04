<script setup lang="ts">
defineProps<{
  title: string
  image?: string
  description?: string
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
          <img v-if="image" :src="image" :alt="title" loading="lazy" />
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
  display: grid;
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 768px) {
  .comp-demo-body {
    grid-template-columns: 1fr;
  }
}
.comp-preview {
  padding: 24px;
  background: var(--dad-bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  border-right: 1px solid var(--dad-border);
}
@media (max-width: 768px) {
  .comp-preview {
    border-right: none;
    border-bottom: 1px solid var(--dad-border);
  }
}
.comp-preview img {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
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
