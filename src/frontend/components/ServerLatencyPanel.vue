<template>
  <div class="latency-summary">
    <div v-if="showThreeNetDetails && hasThreeNetDetails" :class="['three-net-panel', { 'three-net-panel-ring': variant === 'ring' }]">
      <div class="three-net-columns">
        <div class="three-net-column" aria-label="Ping">
          <div class="three-net-row" v-for="row in visibleDetails" :key="'ping-' + row.key">
            <div class="three-net-head">
              <span class="three-net-name">{{ row.label }}</span>
              <strong class="three-net-value" :style="{ color: getPingColor(row.latestPing) }">{{ formatPingValue(row.latestPing) }}</strong>
            </div>
            <div class="three-net-buckets">
              <span
                v-for="(point, index) in row.points"
                :key="index"
                class="three-net-bucket"
                :data-tooltip="point.pingTooltip"
              >
                <span class="three-net-bucket-fill" :style="{ height: point.pingHeight + '%', background: point.pingColor, opacity: point.pingOpacity }"></span>
              </span>
            </div>
          </div>
        </div>
        <div class="three-net-column" aria-label="Loss">
          <div class="three-net-row" v-for="row in visibleDetails" :key="'loss-' + row.key">
            <div class="three-net-head three-net-head-loss">
              <strong class="three-net-value" :style="{ color: getLossColor(row.averageLoss) }">{{ formatLossValue(row.averageLoss) }}</strong>
            </div>
            <div class="three-net-buckets">
              <span
                v-for="(point, index) in row.points"
                :key="index"
                class="three-net-bucket"
                :data-tooltip="point.lossTooltip"
              >
                <span class="three-net-bucket-fill" :style="{ height: point.lossHeight + '%', background: point.lossColor, opacity: point.lossOpacity }"></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="hasPingData" :class="variant === 'ring' ? 'server-card-ping-row' : 'ping-panel'">
      <template v-if="variant === 'ring'">
        <span class="server-card-ping-chip" v-for="p in visiblePings" :key="p.key || p.label">
          <span class="server-card-ping-label">{{ p.label }}</span>
          <span class="server-card-ping-val" :style="{ color: getPingColor(p.value) }">{{ p.value === undefined ? '--' : isPingValid(p.value) ? p.value + 'ms' : timeoutText }}</span>
        </span>
      </template>
      <template v-else>
        <div class="ping-item" v-for="p in visiblePings" :key="p.key || p.label">
          <span class="ping-label">{{ p.label }}</span>
          <span class="ping-value" :style="{ color: getPingColor(p.value) }">{{ p.value === undefined ? '--' : !isPingValid(p.value) ? timeoutText : p.value + 'ms' }}</span>
        </div>
      </template>
    </div>
    <button v-if="totalCount > displayCount" type="button" class="latency-expand" :aria-expanded="expanded" @click.prevent.stop="expanded = !expanded">
      {{ expanded ? (currentLang === 'zh' ? '收起' : 'Show less') : (currentLang === 'zh' ? `查看全部 ${totalCount} 个节点` : `View all ${totalCount} nodes`) }}
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { currentLang } from '../utils/i18n.js'
const expanded = ref(false)
const props = defineProps({
  displayCount: { type: Number, default: 3 },
  variant: {
    type: String,
    default: 'bar',
    validator: value => ['bar', 'ring'].includes(value)
  },
  showThreeNetDetails: {
    type: Boolean,
    default: false
  },
  hasThreeNetDetails: {
    type: Boolean,
    default: false
  },
  threeNetDetails: {
    type: Array,
    default: () => []
  },
  hasPingData: {
    type: Boolean,
    default: false
  },
  pingList: {
    type: Array,
    default: () => []
  },
  timeoutText: {
    type: String,
    required: true
  },
  getPingColor: {
    type: Function,
    required: true
  },
  getLossColor: {
    type: Function,
    required: true
  },
  formatPingValue: {
    type: Function,
    required: true
  },
  formatLossValue: {
    type: Function,
    required: true
  },
  isPingValid: {
    type: Function,
    required: true
  }
})

const totalCount = computed(() => props.showThreeNetDetails && props.hasThreeNetDetails ? props.threeNetDetails.length : props.pingList.length)
const visibleDetails = computed(() => expanded.value ? props.threeNetDetails : props.threeNetDetails.slice(0, props.displayCount))
const visiblePings = computed(() => expanded.value ? props.pingList : props.pingList.slice(0, props.displayCount))
</script>
<style scoped>
.latency-summary { min-width: 0; }
.latency-expand { display: block; margin: 8px 0 0 auto; padding: 5px 0; border: 0; background: transparent; color: var(--accent-green); font: inherit; font-size: 11px; cursor: pointer; }
.three-net-name { overflow-wrap: anywhere; }
</style>
