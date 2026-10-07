<script setup lang="ts">
import { TreeNode } from '@/api/workspace';

defineOptions({ name: 'FileTree' });

const props = defineProps<{
  nodes: TreeNode[];
  activePath?: string;
  expanded: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'select', path: string): void;
  (e: 'toggle', path: string): void;
}>();

function onClick(node: TreeNode) {
  if (node.type === 'dir') emit('toggle', node.path);
  else emit('select', node.path);
}
</script>

<template>
  <div class="file-tree">
    <div v-for="node in nodes" :key="node.path" class="tree-node">
      <div
        class="tree-row"
        :class="{ 'is-file': node.type === 'file', 'is-active': node.path === activePath }"
        @click="onClick(node)"
      >
        <span class="tree-icon">{{ node.type === 'dir' ? (expanded.has(node.path) ? '📂' : '📁') : '📄' }}</span>
        <span class="tree-name">{{ node.name }}</span>
      </div>
      <div
        v-if="node.type === 'dir' && expanded.has(node.path) && node.children"
        class="tree-children"
      >
        <FileTree
          :nodes="node.children"
          :active-path="activePath"
          :expanded="expanded"
          @select="emit('select', $event)"
          @toggle="emit('toggle', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  font-size: 13px;
  line-height: 1.6;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
}
.tree-row:hover {
  background: var(--el-fill-color-light);
}
.tree-row.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.tree-children {
  padding-left: 14px;
}
.tree-icon {
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}
.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
