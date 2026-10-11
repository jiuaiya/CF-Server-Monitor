<script setup lang="ts">
import type { PacketLossEvent } from '@/utils/pingLossEvents'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { formatPacketLoss } from '@/utils/pingLossEvents'

const props = defineProps<{ events: PacketLossEvent[], hasSamples: boolean }>()
const page = ref(1)
const pageSize = 10
const pageCount = computed(() => Math.max(1, Math.ceil(props.events.length / pageSize)))
const visibleEvents = computed(() => props.events.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(pageCount, count => page.value = Math.min(page.value, count))
</script>

<template>
  <section class="min-w-0" aria-label="丢包异常记录" data-packet-loss-events>
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="text-sm font-medium">
        丢包异常
      </h3>
      <span class="text-xs text-muted-foreground">共 {{ events.length }} 条 · 最新在前</span>
    </div>
    <table v-if="events.length" class="w-full table-fixed text-left text-xs">
      <colgroup>
        <col class="w-[28%]">
        <col class="w-[46%]">
        <col class="w-[26%]">
      </colgroup>
      <thead>
        <tr class="border-b border-muted-foreground/10 text-muted-foreground">
          <th scope="col" class="px-2 py-2 font-normal">
            节点
          </th>
          <th scope="col" class="px-2 py-2 font-normal">
            发生时间
          </th>
          <th scope="col" class="px-2 py-2 text-right font-normal">
            丢包率
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in visibleEvents" :key="event.id" class="border-b border-muted-foreground/10" :data-loss-event-id="event.id">
          <td class="break-words px-2 py-2">
            {{ event.name }}
          </td>
          <td class="px-2 py-2 tabular-nums">
            <time :datetime="event.time" :title="dayjs(event.time).format('YYYY-MM-DD HH:mm:ss')">{{ dayjs(event.time).format('MM-DD HH:mm:ss') }}</time>
          </td>
          <td class="px-2 py-2 text-right font-medium tabular-nums" :class="event.loss >= 100 ? 'text-rose-500' : event.loss >= 20 ? 'text-orange-500' : 'text-yellow-600'">
            {{ formatPacketLoss(event.loss) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="py-6 text-center text-sm text-muted-foreground">
      {{ hasSamples ? '所选时间内没有丢包异常' : '所选时间内暂无丢包数据' }}
    </p>
    <div v-if="pageCount > 1" class="mt-3 flex items-center justify-end gap-2 text-xs">
      <Button variant="ghost" size="xs" :disabled="page === 1" @click="page--">
        上一页
      </Button>
      <span class="text-muted-foreground">{{ page }} / {{ pageCount }}</span>
      <Button variant="ghost" size="xs" :disabled="page === pageCount" @click="page++">
        下一页
      </Button>
    </div>
  </section>
</template>
