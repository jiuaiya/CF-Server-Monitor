<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import NodePingResults from '@/components/NodePingResults.vue'

defineProps<{ node: NodeData }>()
</script>

<template>
  <NodePingResults :node="node" />
</template>
