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
  metrics: [
    { key: 'latency', label: 'Ping', text: net.latency, toneClass: net.toneClass, bars: buildTargetPingBars(nodesStore.pingHistoryByUuid[props.node.uuid] ?? [], net.key, net.name), description: '红色表示高延迟或超时' },
    { key: 'loss', label: '丢包', text: net.loss, toneClass: net.lossToneClass, bars: buildTargetPingBars(nodesStore.pingHistoryByUuid[props.node.uuid] ?? [], net.key, net.name, 'loss'), description: '红色表示高丢包' },
  ],
})))
</script>

<template>
  <div class="ping-results min-w-0 w-full">
    <div v-if="results.length" class="ping-results-grid grid min-w-0 w-full gap-x-3 gap-y-2" :data-ping-count="results.length">
      <div v-for="net in results" :key="net.key" class="flex min-w-0 flex-col gap-1" :data-ping-key="net.key">
        <div class="grid min-w-0 grid-cols-2 gap-2">
          <div v-for="metric in net.metrics" :key="metric.key" class="flex min-w-0 flex-col gap-1">
            <div class="flex min-w-0 items-center justify-between gap-1 text-[11px]" :aria-label="`${net.name} ${metric.label} ${metric.text}`">
              <DataTooltip
                v-if="metric.key === 'latency'" placement="top" :content="net.tooltip" class="min-w-0 text-muted-foreground"
                content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
              >
                <span class="block truncate">{{ net.name }}</span>
              </DataTooltip>
              <span v-else class="text-muted-foreground">{{ metric.label }}</span>
              <span class="ml-auto shrink-0 tabular-nums" :class="metric.toneClass">{{ metric.text }}</span>
            </div>
            <div
              class="grid h-[5px] grid-cols-10 gap-[1px]" role="img"
              :data-ping-target-history="metric.key === 'latency' ? net.key : undefined"
              :data-ping-target-loss-history="metric.key === 'loss' ? net.key : undefined"
              :aria-label="`${net.name} ${metric.label}历史，灰色表示缺少数据，${metric.description}`"
            >
              <DataTooltip
                v-for="bar in metric.bars" :key="bar.key" placement="top"
                :content="bar.tooltip" class="h-full w-full"
                content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
              >
                <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
              </DataTooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
    <span v-else class="text-muted-foreground">N/A</span>
  </div>
</template>

<style scoped>
.ping-results {
  container-type: inline-size;
}

.ping-results-grid {
  grid-template-columns: minmax(0, 1fr);
}

@container (min-width: 300px) {
  .ping-results-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
