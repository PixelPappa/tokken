<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  tokens: Record<string, any>
  prefix?: string
  type?: 'color' | 'spacing' | 'shadow' | 'font' | 'radius'
}>()

const entries = computed(() =>
  Object.entries(props.tokens).map(([name, token]) => ({
    name,
    value: token.value || token,
    tailwind: token.tailwind || (props.prefix ? `${props.prefix}-${name}` : ''),
    description: token.description || '',
    extra: token,
  }))
)
</script>

<template>
  <div class="token-table-wrap">
    <table class="token-table">
      <thead>
        <tr>
          <th>Token</th>
          <th>Value</th>
          <th>Tailwind</th>
          <th>Preview</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.name">
          <td class="token-name">{{ entry.name }}</td>
          <td class="token-value">{{ entry.value }}</td>
          <td class="token-tailwind">
            <CopyButton :text="entry.tailwind" />
          </td>
          <td class="token-preview">
            <span
              v-if="type === 'color'"
              class="preview-swatch"
              :style="{ background: entry.value }"
            />
            <span
              v-else-if="type === 'spacing'"
              class="preview-bar"
              :style="{ width: entry.extra.px || entry.value }"
            />
            <span
              v-else-if="type === 'shadow'"
              class="preview-shadow"
              :style="{ boxShadow: entry.value }"
            />
            <span
              v-else-if="type === 'radius'"
              class="preview-radius"
              :style="{ borderRadius: entry.value }"
            />
            <span v-else class="preview-text">{{ entry.description }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.token-table-wrap {
  overflow-x: auto;
  margin: 16px 0;
}
.token-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.token-table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  color: var(--dad-text-muted);
  border-bottom: 1px solid var(--dad-border);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.token-table td {
  padding: 8px 12px;
  color: var(--dad-text-secondary);
  border-bottom: 1px solid rgba(73, 69, 79, 0.3);
  vertical-align: middle;
}
.token-name {
  font-weight: 600;
  color: var(--dad-text-primary);
}
.token-value {
  font-family: monospace;
  font-size: 12px;
}
.token-tailwind {
  font-family: monospace;
  font-size: 12px;
}
.preview-swatch {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--dad-border);
}
.preview-bar {
  display: inline-block;
  height: 20px;
  background: var(--dad-accent);
  border-radius: 3px;
  min-width: 2px;
}
.preview-shadow {
  display: inline-block;
  width: 48px;
  height: 32px;
  background: var(--dad-bg-surface);
  border-radius: 6px;
}
.preview-radius {
  display: inline-block;
  width: 32px;
  height: 32px;
  background: var(--dad-accent);
}
.preview-text {
  font-size: 11px;
  color: var(--dad-text-muted);
}
</style>
