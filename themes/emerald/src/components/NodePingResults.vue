<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { buildTopPingNetworks } from '@/composables/useNodePingDisplay'

const props = defineProps<{ node: NodeData }>()
const results = computed(() => buildTopPingNetworks(props.node.ping, props.node.pingDisplay))
</script>

<template>
  <div v-if="results.length" class="grid min-w-0 w-full grid-cols-2 gap-x-3 gap-y-1" :data-ping-count="results.length">
    <DataTooltip
      v-for="net in results" :key="net.key" placement="top"
      :content="net.tooltip" class="min-w-0"
      content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
    >
      <div class="flex min-w-0 items-center justify-between gap-2 text-[11px]" :data-ping-key="net.key" :aria-label="`${net.name} ${net.latency}`">
        <span class="min-w-0 truncate text-muted-foreground">{{ net.name }}</span>
        <span class="shrink-0 tabular-nums" :class="net.toneClass">{{ net.latency }}</span>
      </div>
    </DataTooltip>
  </div>
  <span v-else class="text-muted-foreground">N/A</span>
</template>
