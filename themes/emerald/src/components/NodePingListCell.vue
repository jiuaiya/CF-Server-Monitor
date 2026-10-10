<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import NodePingResults from '@/components/NodePingResults.vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{ node: NodeData }>()

const { summaryVisible, latencyRenderBars, lossRenderBars } = useNodePingDisplay(props.node.uuid)
</script>

<template>
  <div class="flex min-w-0 w-full flex-col">
    <NodePingResults :node="node" />
    <template v-if="summaryVisible">
      <div class="flex w-full flex-col gap-[1px] pr-4">
        <div class="relative items-center gap-1">
          <div
            class="grid h-1 cursor-auto items-end gap-[1px] transition-all hover:h-2.5"
            :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
          >
            <DataTooltip
              v-for="bar in latencyRenderBars" :key="bar.key" placement="top"
              :content="bar.tooltip" class="h-full w-full"
              content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
            >
              <span
                class="block h-full w-full rounded-[1px] transition-all hover:scale-y-160"
                :class="bar.className"
              />
            </DataTooltip>
          </div>
        </div>
        <div class="relative items-center gap-1">
          <div
            class="grid h-1 cursor-auto items-end gap-[1px] transition-all hover:h-2.5"
            :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
          >
            <DataTooltip
              v-for="bar in lossRenderBars" :key="bar.key" placement="top"
              :content="bar.tooltip" class="h-full w-full"
              content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
            >
              <span
                class="block h-full w-full rounded-[1px] transition-all hover:scale-y-160"
                :class="bar.className"
              />
            </DataTooltip>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
