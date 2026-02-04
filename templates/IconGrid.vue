<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  icons: Record<string, string>
}>()

const search = ref('')
const copiedName = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return Object.entries(props.icons)
    .filter(([name]) => name.toLowerCase().includes(q))
    .sort((a, b) => a[0].localeCompare(b[0]))
})

async function copyName(name: string) {
  await navigator.clipboard.writeText(name)
  copiedName.value = name
  setTimeout(() => { copiedName.value = '' }, 1200)
}
</script>

<template>
  <div class="icon-grid-wrap">
    <input
      v-model="search"
      type="text"
      class="icon-search"
      placeholder="Search icons..."
    />
    <div class="icon-count">{{ filtered.length }} icons</div>
    <div class="icon-grid">
      <div
        v-for="[name, path] in filtered"
        :key="name"
        class="icon-item"
        :class="{ copied: copiedName === name }"
        @click="copyName(name)"
        :title="name"
      >
        <div class="icon-svg">
          <img :src="path" :alt="name" />
        </div>
        <div class="icon-name">{{ copiedName === name ? 'Copied!' : name }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-grid-wrap {
  margin: 16px 0;
}
.icon-search {
  width: 100%;
  max-width: 320px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: 'Open Sans', sans-serif;
  background: var(--dad-bg-surface);
  border: 1px solid var(--dad-border);
  border-radius: 8px;
  color: var(--dad-text-primary);
  margin-bottom: 8px;
}
.icon-search::placeholder {
  color: var(--dad-text-muted);
}
.icon-search:focus {
  outline: none;
  border-color: var(--dad-accent);
}
.icon-count {
  font-size: 12px;
  color: var(--dad-text-muted);
  margin-bottom: 12px;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}
.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 6px 10px;
  background: var(--dad-bg-surface);
  border: 1px solid var(--dad-border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.icon-item:hover {
  border-color: var(--dad-accent);
}
.icon-item.copied {
  border-color: var(--dad-success);
}
.icon-svg {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-svg img {
  width: 100%;
  height: 100%;
  filter: brightness(0) invert(0.9);
}
.icon-name {
  font-size: 10px;
  font-family: monospace;
  color: var(--dad-text-muted);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
