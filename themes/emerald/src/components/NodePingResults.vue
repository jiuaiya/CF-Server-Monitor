<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { buildTargetPingBars, buildTopPingNetworks } from '@/composables/useNodePingDisplay'
import { useNodesStore } from '@/stores/nodes'

const props = defineProps<{ node: NodeData }>()
const nodesStore = useNodesStore()
const results = computed(() => buildTopPingNetworks(props.node.ping, props.node.pingDisplay).map(net => ({
  ...net,
  bars: buildTargetPingBars(nodesStore.pingHistoryByUuid[props.node.uuid] ?? [], net.key, net.name),
})))
</script>

<template>
  <div v-if="results.length" class="grid min-w-0 w-full grid-cols-2 gap-x-3 gap-y-2" :data-ping-count="results.length">
    <div v-for="net in results" :key="net.key" class="flex min-w-0 flex-col gap-1" :data-ping-key="net.key">
      <DataTooltip
        placement="top" :content="net.tooltip" class="min-w-0"
        content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
      >
        <div class="flex min-w-0 items-center justify-between gap-2 text-[11px]" :aria-label="`${net.name} ${net.latency}`">
          <span class="min-w-0 truncate text-muted-foreground">{{ net.name }}</span>
          <span class="shrink-0 tabular-nums" :class="net.toneClass">{{ net.latency }}</span>
        </div>
      </DataTooltip>
      <div
        class="grid h-[5px] grid-cols-10 gap-[1px]" role="img"
        :data-ping-target-history="net.key" :aria-label="`${net.name} 延迟历史，灰色表示缺少数据，红色表示高延迟或超时`"
      >
        <DataTooltip
          v-for="bar in net.bars" :key="bar.key" placement="top"
          :content="bar.tooltip" class="h-full w-full"
          content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
        >
          <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
        </DataTooltip>
      </div>
    </div>
  </div>
  <span v-else class="text-muted-foreground">N/A</span>
</template>
