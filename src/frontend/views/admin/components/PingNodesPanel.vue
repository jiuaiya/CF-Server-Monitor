<template>
  <div v-show="activeTab === 'pingNodes'" class="ping-settings-panel">
    <div class="ping-toolbar">
      <div><h3>{{ text.title }}</h3><p class="text-secondary text-sm">{{ text.subtitle }}</p></div>
      <label class="ping-scope"><span>{{ text.scope }}</span>
        <select class="form-select" :value="scope" :disabled="saving" @change="changeScope($event.target.value)">
          <option value="">{{ text.defaults }}</option><option v-for="server in servers" :key="server.id" :value="server.id">{{ server.name }}</option>
        </select>
      </label>
    </div>
    <div v-if="isServer" class="ping-scope-note"><span>{{ text.machineHint }}</span><button class="btn btn-sm" :disabled="saving" @click="resetInheritance">{{ text.resetAll }}</button></div>
    <p v-if="currentServer?.ping_mode === 'icmp'" class="ping-notice">{{ text.icmpHint }}</p>
    <p v-if="message" role="status" class="ping-feedback" :class="{ 'text-red': error }">{{ message }}</p>

    <fieldset class="ping-edit-fieldset" :disabled="saving">
      <section class="ping-selected">
        <div class="ping-section-heading">
          <div class="ping-heading-label"><h4>{{ text.chosen }}</h4><span class="ping-counter">{{ enabledCount }} / 8</span><span v-if="dirty" class="text-secondary text-sm">{{ text.unsaved }}</span></div>
          <button class="btn btn-sm ping-with-icon" :disabled="enabledCount >= 8" @click="addCustom"><Plus :size="14" />{{ text.manual }}</button>
        </div>
        <p class="text-secondary text-sm ping-selection-hint">{{ text.selectionHint }}</p>
        <div v-if="selectedKeys.length" class="ping-selected-list">
          <div v-for="(key, index) in selectedKeys" :key="key" class="ping-selected-row" :class="{ 'ping-slot-target': targetKey === key }" @dragover.prevent @drop.prevent="dropOn(key)">
            <button class="ping-icon-button ping-drag-handle" draggable="true" :aria-label="text.drag + ' ' + nodeLabel(key)" @dragstart="startDrag($event, key)" @dragend="dragKey = ''"><GripVertical :size="17" /></button>
            <span class="ping-rank">{{ index + 1 }}</span>
            <div class="ping-selected-info"><strong>{{ nodeLabel(key) }} <span v-if="modes[key] === 'inherit'" class="ping-inherit-badge">{{ text.inherit }}</span></strong><code>{{ endpoint(key) }}</code><span v-if="nodeError(key)" class="text-red text-sm">{{ nodeError(key) }}</span></div>
            <span v-if="index < effectiveCount" class="ping-home-badge">{{ text.onHome }}</span>
            <div class="ping-row-actions">
              <button class="ping-icon-button" :disabled="index === 0" :aria-label="text.up + ' ' + nodeLabel(key)" @click="move(key, -1)"><ArrowUp :size="15" /></button>
              <button class="ping-icon-button" :disabled="index === selectedKeys.length - 1" :aria-label="text.down + ' ' + nodeLabel(key)" @click="move(key, 1)"><ArrowDown :size="15" /></button>
              <button class="ping-icon-button" :aria-label="text.edit + ' ' + nodeLabel(key)" @click="editNode(key)"><Pencil :size="14" /></button>
              <button class="ping-icon-button ping-remove" :aria-label="text.remove + ' ' + nodeLabel(key)" @click="removeNode(key)"><X :size="16" /></button>
            </div>
          </div>
        </div>
        <p v-else class="ping-empty text-secondary">{{ text.startHint }}</p>
        <div class="ping-display-controls">
          <label class="ping-count-control"><span>{{ text.homeCount }}</span><select v-model="count" class="form-select" :disabled="isServer && inheritCount"><option v-for="n in 8" :key="n" :value="n">{{ n }}</option></select><span>{{ text.nodeUnit }}</span></label>
          <label v-if="isServer" class="ping-check"><input v-model="inheritOrder" type="checkbox" @change="!inheritOrder && (order = normalizePingOrder(settings.ping_display_order))">{{ text.followOrder }}</label>
          <label v-if="isServer" class="ping-check"><input v-model="inheritCount" type="checkbox" @change="!inheritCount && (count = normalizePingCount(settings.ping_display_count))">{{ text.followCount }}</label>
        </div>
      </section>

      <section ref="libraryElement" class="ping-library">
        <div class="ping-section-heading"><h4>{{ text.library }}</h4><button class="btn btn-sm ping-with-icon" :disabled="loadingCatalog" @click="loadCatalog(true)"><RefreshCw :size="13" :class="{ 'ping-spinning': loadingCatalog }" />{{ loadingCatalog ? text.loading : text.refresh }}</button></div>
        <div class="ping-catalog-toolbar">
          <div class="ping-segment" :aria-label="text.levels"><button v-for="item in ['province', 'city']" :key="item" type="button" :class="{ active: level === item }" :aria-pressed="level === item" @click="level = item">{{ text[item] }}</button></div>
          <div v-if="level === 'province'" class="ping-segment ping-family" aria-label="IP"><button v-for="item in families" :key="item.value" type="button" :class="{ active: family === item.value }" :aria-pressed="family === item.value" @click="family = item.value">{{ item.label }}</button></div>
          <span v-else class="text-secondary text-sm">{{ text.cityV4 }}</span>
          <span class="ping-match-count">{{ text.matches }} {{ groups.length }} {{ text.groups }}</span>
        </div>
        <div class="ping-search-row">
          <label class="ping-search"><Search :size="18" /><input v-model="search" type="search" :placeholder="text.search" :aria-label="text.search"></label>
          <select v-if="level === 'city'" v-model="province" class="form-select ping-province-filter" :aria-label="text.provinces"><option value="">{{ text.provinces }}</option><option v-for="item in provinces" :key="item">{{ item }}</option></select>
        </div>
        <div class="ping-library-status text-secondary text-sm"><span>{{ text.clickHint }}</span><span v-if="catalogUpdatedAt">{{ text.updated }} {{ formatDate(catalogUpdatedAt) }}</span></div>
        <div v-if="targetKey" class="ping-target" role="status"><span>{{ text.replacing }} <strong>{{ nodeLabel(targetKey) }}</strong></span><button class="btn btn-sm" @click="targetKey = ''">{{ text.cancel }}</button></div>
        <p v-if="catalogError" class="text-red text-sm" role="alert">{{ catalogError }}</p>
        <p v-if="enabledCount >= 8 && !targetKey" class="ping-full-hint text-secondary text-sm">{{ text.capacityHint }}</p>
        <div class="ping-catalog-list" :aria-busy="loadingCatalog">
          <p v-if="!groups.length" class="ping-empty text-secondary">{{ loadingCatalog ? text.loading : text.empty }}</p>
          <article v-for="group in groups" :key="group.id" class="ping-region-card">
            <div class="ping-region-heading"><h5>{{ group.name }} <span v-if="level === 'city'">{{ group.province }}</span></h5><button v-if="group.nodes.length > 1 && !targetKey" class="ping-group-add" :disabled="!canAddGroup(group)" @click="addGroup(group)">{{ group.nodes.every(node => isSelected(node.endpoint)) ? text.groupSelected : text.addGroup }}</button></div>
            <div class="ping-carrier-grid">
              <div v-for="item in CATALOG_CARRIERS" :key="item" class="ping-carrier-column">
                <template v-if="group.nodes.some(node => node.carrier === item)">
                  <button v-for="node in group.nodes.filter(node => node.carrier === item)" :key="node.endpoint" class="ping-catalog-node" :class="{ 'is-selected': isSelected(node.endpoint) }" :aria-pressed="isSelected(node.endpoint)" :aria-label="(targetKey ? text.replace : isSelected(node.endpoint) ? text.remove : text.add) + ' ' + node.name + ' ' + node.endpoint" :disabled="targetKey ? (isSelected(node.endpoint) && selectedKey(node.endpoint) !== targetKey) : (!isSelected(node.endpoint) && enabledCount >= 8)" @click="toggleNode(node)">
                    <span class="ping-carrier-badge" :class="'carrier-' + item">{{ text[item] }}</span><code>{{ node.endpoint }}</code><span class="ping-node-action"><Check v-if="isSelected(node.endpoint)" :size="17" /><Plus v-else :size="17" /></span>
                  </button>
                </template>
                <span v-else class="ping-missing-carrier"><span class="ping-carrier-badge" :class="'carrier-' + item">{{ text[item] }}</span><span>{{ text.noCarrier }}</span></span>
              </div>
            </div>
          </article>
        </div>
        <p class="text-secondary text-sm ping-library-footer">{{ text.sourceHint }}</p>
      </section>
      <div class="ping-bottom-bar">
        <div class="ping-preview"><strong>{{ text.preview }}</strong><div v-if="previewKeys.length" class="ping-preview-nodes"><span v-for="key in previewKeys" :key="key">{{ nodeLabel(key) }} <b>{{ previewResult(key) }}</b></span></div><span v-else class="text-secondary">{{ text.noNodes }}</span><span v-if="enabledCount > effectiveCount" class="text-secondary text-sm">+ {{ enabledCount - effectiveCount }} {{ text.more }}</span></div>
        <div class="ping-save-actions"><span class="text-secondary text-sm">{{ isServer ? text.machineSave : `${text.affects} ${inheritingServers} ${text.machines}` }}</span><button class="btn" :disabled="saving || !dirty" @click="discardDraft">{{ text.discard }}</button><button class="btn btn-primary" :disabled="saving || hasErrors || !dirty" @click="save">{{ saving ? text.saving : text.save }}</button></div>
      </div>
    </fieldset>

    <div v-if="editor" class="modal-overlay active" @click.self="editor = null" @keydown.esc="editor = null">
      <form ref="editorElement" class="modal-dialog ping-editor" role="dialog" aria-modal="true" :aria-label="editor.key ? text.edit : text.manual" @submit.prevent="applyEditor" @keydown.tab="trapEditorFocus">
        <div class="modal-header"><h4>{{ editor.key ? text.edit : text.manual }}</h4><button type="button" class="ping-icon-button" :aria-label="text.cancel" @click="editor = null"><X :size="18" /></button></div>
        <label><span>{{ text.name }}</span><input v-model.trim="editor.name" class="form-input" maxlength="60" :placeholder="text.name"></label>
        <label v-if="isServer && editor.key"><span>{{ text.mode }}</span><select v-model="editor.mode" class="form-select"><option value="inherit">{{ text.inherit }}</option><option value="custom">{{ text.custom }}</option><option value="off">{{ text.off }}</option></select></label>
        <label><span>{{ text.endpoint }}</span><input v-model.trim="editor.address" class="form-input" :disabled="editor.mode !== 'custom'" :placeholder="editor.mode === 'inherit' ? globalEndpoint(editor.key) || text.noDefault : 'host[:port] / [IPv6]:port'" :class="{ 'input-invalid': editorError }"></label>
        <p v-if="editorError" class="text-red text-sm" role="alert">{{ editorError }}</p>
        <button v-if="editor.key" type="button" class="btn ping-editor-replace" @click="chooseReplacement(editor.key)">{{ text.choose }}</button>
        <div class="modal-footer"><button type="button" class="btn" @click="editor = null">{{ text.cancel }}</button><button type="submit" class="btn btn-primary" :disabled="!!editorError">{{ text.apply }}</button></div>
      </form>
    </div>
    <div v-if="pendingScope !== null" class="modal-overlay active"><div class="modal-dialog" role="dialog" aria-modal="true" :aria-label="text.unsaved"><div class="modal-header"><div class="modal-title">{{ text.unsaved }}</div></div><p>{{ text.discardQuestion }}</p><div class="modal-footer"><button class="btn" @click="cancelScope">{{ text.cancel }}</button><button class="btn btn-red" @click="confirmScope">{{ text.discard }}</button></div></div></div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Search, Check, Plus, GripVertical, ArrowUp, ArrowDown, X, Pencil, RefreshCw } from '@lucide/vue'
import { CATALOG_CARRIERS, groupPingCatalog } from '../../../utils/pingCatalog.js'
import { currentLang } from '../../../utils/i18n.js'
import { PING_SLOTS, normalizePingOrder, normalizePingCount, validatePingNode } from '../../../utils/pingNode.js'

const props = defineProps({ settings: { type: Object, required: true }, servers: { type: Array, default: () => [] }, activeTab: String, request: { type: Function, required: true }, targetId: { type: String, default: '' } })
const emit = defineEmits(['saved', 'scope-change'])
const copy = {
  zh: {
    title: 'Ping 节点',
    subtitle: '选择监测节点，设置首页显示优先级。最多 8 个节点。',
    scope: '配置范围',
    defaults: '全局默认配置',
    machineHint: '节点、排序和首页显示数量可分别跟随全局默认，或单独设置。',
    resetAll: '全部恢复跟随默认',
    icmpHint: '这台机器使用 ICMP。节点库提供 TCP 地址和端口，请确认目标支持 ICMP。',
    library: '节点库',
    refresh: '刷新节点库',
    loading: '加载中…',
    search: '搜索省份、城市、名称或地址',
    provinces: '全部省份',
    levels: '省级和城市',
    telecom: '电信',
    unicom: '联通',
    mobile: '移动',
    province: '省级节点',
    city: '市级节点',
    replacing: '选择节点以替换：',
    cancel: '取消',
    updated: '源更新',
    empty: '没有匹配的节点',
    replace: '替换',
    add: '添加',
    sourceHint: '来源：Zstatic。加入配置后才开始监测，接口不可用时仍可手动填写地址。',
    unsaved: '有未保存的修改',
    followOrder: '排序跟随默认',
    homeCount: '首页显示',
    followCount: '数量跟随默认',
    drag: '拖动排序',
    name: '节点名称',
    mode: '节点设置',
    inherit: '跟随默认',
    custom: '自定义',
    off: '禁用',
    endpoint: '节点地址',
    noDefault: '全局未配置此节点',
    choose: '从节点库选择',
    up: '上移',
    down: '下移',
    preview: '首页预览',
    noNodes: '未启用监测节点',
    more: '个节点展开查看',
    machineSave: '仅保存当前机器的 Ping 配置',
    affects: '默认变更会影响',
    machines: '台跟随默认节点或显示设置的机器',
    discard: '放弃修改',
    saving: '保存中…',
    save: '保存 Ping 配置',
    discardQuestion: '切换配置范围会丢弃当前未保存的修改。',
    unavailable: '节点库暂时不可用，请重试或手动填写地址。',
    stale: '节点库刷新失败，正在使用上次成功加载的列表。',
    invalid: '请输入域名、IPv4 或 IPv6，可带端口（1–65535）。',
    full: '已启用 8 个节点，请先禁用一个节点或指定要替换的节点。',
    saved: 'Ping 配置已保存。',
    failed: '保存失败，请重试。',
    noSample: '无样本',
    timeout: '超时',
    chosen: '已选节点',
    manual: '手动添加',
    selectionHint: '拖动或用箭头调整顺序，排在前面的节点优先显示。',
    onHome: '首页',
    nodeUnit: '个节点',
    edit: '编辑节点',
    remove: '移除',
    apply: '确定',
    startHint: '在下方节点库点击选择，或手动添加地址。',
    clickHint: '点击节点选择，再次点击取消。最多选择 8 个。',
    matches: '匹配',
    groups: '组',
    cityV4: '市级节点仅提供 IPv4',
    capacityHint: '已选满 8 个。点击已选节点取消，或通过编辑替换。',
    addGroup: '添加三网',
    groupSelected: '已选整组',
    noCarrier: '暂无节点',
    duplicate: '此地址已在已选节点中。',
    selectionFull: '剩余位置不足，请先移除节点。'
  },
  en: {
    title: 'Ping nodes',
    subtitle: 'Choose up to 8 monitoring nodes and set the home display priority.',
    scope: 'Scope',
    defaults: 'Global defaults',
    machineHint: 'Inherit global nodes or customize nodes, order and home display count separately.',
    resetAll: 'Restore all defaults',
    icmpHint: 'This server uses ICMP. The catalog provides TCP endpoints; verify ICMP support.',
    library: 'Node catalog',
    refresh: 'Refresh catalog',
    loading: 'Loading…',
    search: 'Search province, city, name or address',
    provinces: 'All provinces',
    levels: 'All levels',
    telecom: 'Telecom',
    unicom: 'Unicom',
    mobile: 'Mobile',
    province: 'Province',
    city: 'City',
    replacing: 'Choose a replacement for:',
    cancel: 'Cancel',
    updated: 'Source updated',
    empty: 'No matching nodes',
    replace: 'Replace',
    add: 'Add',
    sourceHint: 'Source: Zstatic. Only configured nodes are monitored. Manual addresses remain available if the catalog fails.',
    unsaved: 'Unsaved changes',
    followOrder: 'Inherit display order',
    homeCount: 'Home display count',
    followCount: 'Inherit count',
    drag: 'Reorder',
    name: 'Node name',
    mode: 'Node setting',
    inherit: 'Inherit',
    custom: 'Custom',
    off: 'Disabled',
    endpoint: 'Endpoint',
    noDefault: 'No global node configured',
    choose: 'Choose from catalog',
    up: 'Move up',
    down: 'Move down',
    preview: 'Home preview',
    noNodes: 'No monitoring nodes enabled',
    more: 'more nodes to expand',
    machineSave: 'Save Ping settings for this server only',
    affects: 'Default changes affect',
    machines: 'servers inheriting nodes or display settings',
    discard: 'Discard changes',
    saving: 'Saving…',
    save: 'Save Ping settings',
    discardQuestion: 'Switching scope will discard your unsaved changes.',
    unavailable: 'Catalog unavailable. Retry or enter an address manually.',
    stale: 'Refresh failed. Showing the last successful catalog.',
    invalid: 'Enter a hostname, IPv4 or IPv6, optionally with a port (1–65535).',
    full: 'All 8 nodes are enabled. Disable a node or choose one to replace.',
    saved: 'Ping settings saved.',
    failed: 'Save failed. Please retry.',
    noSample: 'No samples',
    timeout: 'Timeout',
    chosen: 'Selected nodes',
    manual: 'Add manually',
    selectionHint: 'Drag or use arrows to reorder. Earlier nodes appear first on home.',
    onHome: 'Home',
    nodeUnit: 'nodes',
    edit: 'Edit node',
    remove: 'Remove',
    apply: 'Apply',
    startHint: 'Choose nodes below or add an address manually.',
    clickHint: 'Click to select; click again to remove. Choose up to 8.',
    matches: 'Matching',
    groups: 'groups',
    cityV4: 'City nodes provide IPv4 only',
    capacityHint: 'All 8 nodes selected. Click a selected node to remove it, or edit to replace.',
    addGroup: 'Add all carriers',
    groupSelected: 'Group selected',
    noCarrier: 'Unavailable',
    duplicate: 'This endpoint is already selected.',
    selectionFull: 'Not enough free slots. Remove a node first.'
  }
}
const text = computed(() => copy[currentLang.value === 'zh' ? 'zh' : 'en'])
const scope = ref(''), pendingScope = ref(null), values = ref({}), names = ref({}), modes = ref({}), order = ref(normalizePingOrder()), count = ref(3)
const inheritOrder = ref(false), inheritCount = ref(false), saving = ref(false), baseline = ref(''), message = ref(''), error = ref(false), targetKey = ref(''), dragKey = ref('')
const catalog = ref([]), catalogError = ref(''), catalogUpdatedAt = ref(''), loadingCatalog = ref(false), search = ref(''), province = ref(''), level = ref('province'), family = ref('ipv4'), libraryElement = ref(null), editor = ref(null)
const editorElement = ref(null)
let editorTrigger = null
const isServer = computed(() => !!scope.value)
const currentServer = computed(() => props.servers.find(server => server.id === scope.value))
const displayOrder = computed(() => isServer.value && inheritOrder.value ? normalizePingOrder(props.settings.ping_display_order) : order.value)
const effectiveCount = computed(() => isServer.value && inheritCount.value ? normalizePingCount(props.settings.ping_display_count) : count.value)
const slotFor = key => PING_SLOTS.find(slot => slot.key === key)
const globalEndpoint = key => { const raw = props.settings[slotFor(key).field]; return raw === '0' || raw === 0 ? '' : raw || '' }
const endpoint = key => modes.value[key] === 'off' ? '' : modes.value[key] === 'inherit' ? globalEndpoint(key) : values.value[key] || ''
const fallbackName = key => props.settings[slotFor(key).nameField] || slotFor(key).label
const nodeLabel = key => names.value[key] || fallbackName(key)
const selectedKeys = computed(() => displayOrder.value.filter(key => endpoint(key)))
const enabledCount = computed(() => selectedKeys.value.length)
const families = computed(() => [{ value: 'ipv4', label: 'IPv4' }, { value: 'ipv6', label: 'IPv6' }, { value: 'dual', label: currentLang.value === 'zh' ? '双栈' : 'Dual stack' }])
const previewKeys = computed(() => displayOrder.value.filter(key => endpoint(key)).slice(0, effectiveCount.value))
const nodeError = key => modes.value[key] === 'custom' && (!values.value[key] || values.value[key] === '0' || !validatePingNode(values.value[key]).valid) ? text.value.invalid : ''
const hasErrors = computed(() => PING_SLOTS.some(slot => nodeError(slot.key)))
const signature = () => JSON.stringify({ values: values.value, names: names.value, modes: modes.value, order: order.value, count: count.value, inheritOrder: inheritOrder.value, inheritCount: inheritCount.value })
const dirty = computed(() => signature() !== baseline.value)
const provinces = computed(() => [...new Set(catalog.value.map(node => node.province))])
const groups = computed(() => groupPingCatalog(catalog.value, { level: level.value, family: family.value, query: search.value, province: level.value === 'city' ? province.value : '' }))
const editorError = computed(() => {
  if (!editor.value || editor.value.mode !== 'custom') return ''
  const address = editor.value.address
  if (!address || address === '0' || !validatePingNode(address).valid) return text.value.invalid
  return selectedKeys.value.some(key => key !== editor.value.key && endpoint(key).toLowerCase() === address.toLowerCase()) ? text.value.duplicate : ''
})
const inheritingServers = computed(() => props.servers.filter(server => PING_SLOTS.some(slot => server[slot.field] == null || server[slot.field] === '') || props.settings.ping_server_overrides?.[server.id]?.order == null || props.settings.ping_server_overrides?.[server.id]?.count == null).length)
const formatDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(currentLang.value === 'zh' ? 'zh-CN' : 'en-US') }
const previewResult = key => {
  const slot = slotFor(key)
  const current = currentServer.value?.[slot.field]
  const savedEndpoint = current === '0' || current === 0 ? '' : current || globalEndpoint(key)
  if (endpoint(key) !== savedEndpoint) return text.value.noSample
  const value = currentServer.value?.[`ping_${key}`]
  if (value === null) return text.value.timeout
  if (value === undefined || value === false || value === 'false' || value === '') return text.value.noSample
  return Number.isFinite(Number(value)) ? `${Number(value)} ms` : text.value.noSample
}


function loadDraft() {
  const override = props.settings.ping_server_overrides?.[scope.value] || {}
  values.value = {}; names.value = {}; modes.value = {}
  for (const slot of PING_SLOTS) {
    const raw = isServer.value ? currentServer.value?.[slot.field] : props.settings[slot.field]
    modes.value[slot.key] = isServer.value && (raw == null || raw === '') ? 'inherit' : raw === '0' || raw === 0 || !raw ? 'off' : 'custom'
    values.value[slot.key] = modes.value[slot.key] === 'custom' ? String(raw) : ''
    const effective = endpoint(slot.key)
    names.value[slot.key] = isServer.value ? (override.endpoints?.[slot.key] === effective ? override.names?.[slot.key] || '' : '') : fallbackName(slot.key)
  }
  order.value = normalizePingOrder(override.order ?? props.settings.ping_display_order)
  count.value = normalizePingCount(override.count, normalizePingCount(props.settings.ping_display_count))
  inheritOrder.value = isServer.value && override.order == null
  inheritCount.value = isServer.value && override.count == null
  targetKey.value = ''; editor.value = null
  baseline.value = signature()
}
function changeScope(id) {
  if (saving.value || id === scope.value) return
  if (dirty.value) { pendingScope.value = id; return }
  scope.value = id; discardDraft()
}
function discardDraft() { message.value = ''; error.value = false; loadDraft() }
function cancelScope() { pendingScope.value = null; emit('scope-change', scope.value) }
function confirmScope() { scope.value = pendingScope.value; pendingScope.value = null; discardDraft() }
function resetInheritance() {
  for (const slot of PING_SLOTS) { modes.value[slot.key] = 'inherit'; values.value[slot.key] = ''; names.value[slot.key] = '' }
  inheritOrder.value = true; inheritCount.value = true
}
function selectedKey(address) { return selectedKeys.value.find(key => endpoint(key).toLowerCase() === address.toLowerCase()) }
function isSelected(address) { return !!selectedKey(address) }
function clearFeedback() { message.value = ''; error.value = false }
function removeNode(key) { modes.value[key] = 'off'; values.value[key] = ''; names.value[key] = ''; if (targetKey.value === key) targetKey.value = ''; clearFeedback() }
function appendOrder(key) {
  if (isServer.value && inheritOrder.value) return
  const active = displayOrder.value.filter(item => item !== key && endpoint(item))
  order.value = normalizePingOrder([...active, key])
}
function selectNode(node) {
  const key = targetKey.value || displayOrder.value.find(key => !endpoint(key))
  if (!key) { message.value = text.value.full; error.value = true; return }
  const existing = selectedKey(node.endpoint)
  if (existing && existing !== key) { message.value = text.value.duplicate; error.value = true; return }
  const replacing = !!targetKey.value
  values.value[key] = node.endpoint; names.value[key] = node.name; modes.value[key] = 'custom'
  if (!replacing) appendOrder(key)
  targetKey.value = ''; clearFeedback()
}
function toggleNode(node) {
  const key = selectedKey(node.endpoint)
  if (targetKey.value) { selectNode(node); return }
  if (key) removeNode(key)
  else selectNode(node)
}
function canAddGroup(group) { const missing = group.nodes.filter(node => !isSelected(node.endpoint)); return missing.length > 0 && missing.length <= 8 - enabledCount.value }
function addGroup(group) {
  const missing = group.nodes.filter(node => !isSelected(node.endpoint))
  if (missing.length > 8 - enabledCount.value) { message.value = text.value.selectionFull; error.value = true; return }
  for (const node of missing) selectNode(node)
}
function openEditor(draft) { editorTrigger = document.activeElement; editor.value = draft; nextTick(() => editorElement.value?.querySelector('input')?.focus()) }
function addCustom() { if (enabledCount.value < 8) openEditor({ key: '', name: '', address: '', mode: 'custom' }) }
function editNode(key) { openEditor({ key, name: nodeLabel(key), address: values.value[key], mode: modes.value[key] }) }
function trapEditorFocus(event) {
  const elements = [...editorElement.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
  const target = event.shiftKey ? elements.at(-1) : elements[0]
  if (document.activeElement === (event.shiftKey ? elements[0] : elements.at(-1))) { event.preventDefault(); target?.focus() }
}
function applyEditor() {
  if (!editor.value || editorError.value) return
  const { key: original, name, address, mode } = editor.value
  const key = original || displayOrder.value.find(key => !endpoint(key))
  if (!key) return
  values.value[key] = address; names.value[key] = name; modes.value[key] = mode
  if (!original) appendOrder(key)
  editor.value = null; clearFeedback()
}
async function chooseReplacement(key) { targetKey.value = key; editor.value = null; await nextTick(); libraryElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }); libraryElement.value?.querySelector('input')?.focus({ preventScroll: true }) }
function move(key, offset) {
  const active = [...selectedKeys.value], from = active.indexOf(key)
  if (from < 0) return
  const to = Math.max(0, Math.min(active.length - 1, from + offset))
  if (from === to) return
  active.splice(from, 1); active.splice(to, 0, key)
  order.value = normalizePingOrder([...active, ...displayOrder.value]); inheritOrder.value = false
}
function startDrag(event, key) { dragKey.value = key; event.dataTransfer.setData('text/plain', key); event.dataTransfer.effectAllowed = 'move' }
function dropOn(key) { if (dragKey.value) move(dragKey.value, selectedKeys.value.indexOf(key) - selectedKeys.value.indexOf(dragKey.value)); dragKey.value = '' }

async function loadCatalog(refresh = false) {
  if (loadingCatalog.value) return
  loadingCatalog.value = true; catalogError.value = ''
  try {
    const result = await props.request({ action: 'get_ping_nodes', refresh })
    if (result.error) throw new Error(result.error)
    catalog.value = result.data.nodes || []; catalogUpdatedAt.value = result.data.updated_at || ''
    if (result.data.stale) catalogError.value = text.value.stale
  } catch (_) { catalogError.value = text.value.unavailable }
  finally { loadingCatalog.value = false }
}
async function save() {
  if (saving.value || hasErrors.value || !dirty.value) return
  saving.value = true; message.value = ''; error.value = false
  try {
    const nodes = Object.fromEntries(PING_SLOTS.map(slot => [slot.field, modes.value[slot.key] === 'inherit' ? null : modes.value[slot.key] === 'off' ? (isServer.value ? '0' : '') : values.value[slot.key]]))
    const result = await props.request({ action: 'save_ping_settings', server_id: scope.value || null, nodes, names: names.value, order: isServer.value && inheritOrder.value ? null : displayOrder.value, count: isServer.value && inheritCount.value ? null : count.value })
    if (result.error) throw new Error(result.error)
    baseline.value = signature(); message.value = text.value.saved; emit('saved')
  } catch (_) { error.value = true; message.value = text.value.failed }
  finally { saving.value = false }
}
watch(() => props.settings, () => { if (!dirty.value || !baseline.value) loadDraft() }, { immediate: true })
watch(() => props.targetId, id => changeScope(id), { immediate: true })
watch(scope, id => emit('scope-change', id))
watch(editor, value => { if (!value && !targetKey.value) nextTick(() => editorTrigger?.isConnected && editorTrigger.focus({ preventScroll: true })) })
watch(() => props.activeTab, tab => { if (tab === 'pingNodes' && !catalog.value.length) loadCatalog() }, { immediate: true })
watch(() => props.servers, () => { if (!dirty.value) { if (scope.value && !currentServer.value) scope.value = ''; loadDraft() } })
</script>

<style scoped>
.ping-settings-panel { padding: 24px; }
.ping-edit-fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
h3, h4, h5, p { margin: 0; } h3 { color: var(--accent-green); margin-bottom: 7px; } h4 { font-size: 14px; } h5 { font-size: 15px; font-weight: 600; }
.ping-toolbar, .ping-section-heading, .ping-scope-note, .ping-region-heading, .ping-bottom-bar, .ping-target { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ping-scope { min-width: 230px; display: grid; gap: 6px; font-size: 12px; }
.ping-scope-note, .ping-notice, .ping-feedback { margin-top: 16px; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; font-size: 12px; }
.ping-selected { margin-top: 24px; padding: 18px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); }
.ping-heading-label, .ping-with-icon, .ping-row-actions, .ping-count-control, .ping-check { display: flex; align-items: center; gap: 8px; }
.ping-heading-label { flex-wrap: wrap; }
.ping-counter { padding: 2px 7px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-secondary); font-size: 11px; }
.ping-selection-hint { margin: 9px 0 12px; }
.ping-selected-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ping-selected-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border-color); padding: 10px; border-radius: 7px; background: var(--bg-primary); min-width: 0; }
.ping-slot-target { border-color: var(--accent-green); }
.ping-selected-info { display: grid; gap: 4px; flex: 1; min-width: 0; }.ping-selected-info strong { font-size: 12px; font-weight: 500; }.ping-selected-info code { font-size: 10px; color: var(--text-secondary); overflow-wrap: anywhere; }
.ping-rank { font-size: 11px; color: var(--text-secondary); }
.ping-icon-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; height: 28px; width: 28px; padding: 0; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.ping-icon-button:hover { color: var(--text-primary); background: var(--bg-hover); border-color: var(--border-color); }.ping-icon-button:disabled { opacity: .3; cursor: default; }.ping-icon-button:focus-visible, .ping-catalog-node:focus-visible, .ping-segment button:focus-visible, .ping-group-add:focus-visible { outline: 2px solid var(--accent-green); outline-offset: 3px; }
.ping-drag-handle { cursor: grab; width: 20px; }.ping-remove:hover { color: var(--accent-red); }.ping-row-actions { gap: 0; }
.ping-home-badge, .ping-inherit-badge { font-size: 10px; color: var(--accent-green); white-space: nowrap; }.ping-inherit-badge { color: var(--text-secondary); margin-left: 5px; }.ping-home-badge { padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--accent-green) 8%, transparent); }
.ping-display-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; border-top: 1px solid var(--border-color); margin-top: 14px; padding-top: 14px; font-size: 12px; }.ping-count-control .form-select { width: 60px; padding: 6px 9px; }.ping-check input { accent-color: var(--accent-green); }
.ping-library { margin-top: 28px; scroll-margin-top: 20px; }.ping-library > .ping-section-heading { margin-bottom: 14px; }
.ping-catalog-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
.ping-segment { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); }.ping-segment button { border: 0; padding: 8px 17px; border-radius: 5px; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }.ping-segment button.active { color: var(--bg-primary); background: var(--text-primary); font-weight: 600; }.ping-family button { padding: 8px 14px; }.ping-family button.active { color: var(--text-primary); background: var(--bg-primary); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.ping-match-count { margin-left: auto; border: 1px solid var(--border-color); padding: 6px 11px; border-radius: 6px; color: var(--text-secondary); font-size: 11px; white-space: nowrap; }
.ping-search-row { display: flex; gap: 12px; margin-top: 20px; }.ping-search { display: flex; align-items: center; gap: 12px; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input-bg); padding: 13px 15px; color: var(--text-secondary); flex: 1; min-width: 0; }.ping-search:focus-within { border-color: var(--accent-green); }.ping-search input { width: 100%; border: 0; outline: 0; color: var(--text-primary); background: transparent; font: inherit; }.ping-search input::placeholder { color: var(--text-secondary); }.ping-province-filter { width: 145px; }
.ping-library-status { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 13px 0 20px; font-size: 11px; }.ping-target { padding: 12px; margin: 12px 0; background: var(--bg-secondary); border-left: 3px solid var(--accent-green); font-size: 12px; }.ping-full-hint { margin-bottom: 16px; }
.ping-catalog-list { display: grid; gap: 14px; }.ping-region-card { border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); overflow: hidden; box-shadow: 0 2px 7px rgba(0,0,0,.035); }.ping-region-heading { padding: 13px 18px; border-bottom: 1px solid var(--border-color); }.ping-region-heading h5 span { font-weight: 400; font-size: 11px; color: var(--text-secondary); margin-left: 8px; }
.ping-group-add { border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 11px; cursor: pointer; padding: 4px; }.ping-group-add:hover { color: var(--accent-green); }.ping-group-add:disabled { opacity: .5; cursor: default; }
.ping-carrier-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 14px 12px; }.ping-carrier-column { min-width: 0; display: grid; align-content: start; gap: 6px; }
.ping-catalog-node { display: flex; align-items: center; gap: 10px; min-width: 0; width: 100%; min-height: 48px; padding: 9px 10px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--text-primary); text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }.ping-catalog-node:hover { background: var(--bg-hover); border-color: var(--border-color); }.ping-catalog-node.is-selected { background: color-mix(in srgb, var(--accent-green) 6%, transparent); border-color: color-mix(in srgb, var(--accent-green) 45%, var(--border-color)); }.ping-catalog-node:disabled { opacity: .45; cursor: default; }.ping-catalog-node code { font-family: var(--terminal-font); font-size: 11px; color: var(--text-secondary); overflow-wrap: anywhere; flex: 1; min-width: 0; }
.ping-carrier-badge { flex-shrink: 0; padding: 3px 7px; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); border-radius: 4px; font-size: 11px; white-space: nowrap; }.carrier-telecom { color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 6%, transparent); }.carrier-unicom { color: var(--accent-red); background: color-mix(in srgb, var(--accent-red) 6%, transparent); }.carrier-mobile { color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 6%, transparent); }
.ping-node-action { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 25px; height: 25px; border: 1px solid var(--border-color); border-radius: 5px; color: var(--text-secondary); }.is-selected .ping-node-action { border-color: transparent; color: var(--accent-green); }.ping-missing-carrier { display: flex; gap: 10px; align-items: center; min-height: 48px; padding: 9px 10px; color: var(--text-secondary); font-size: 11px; opacity: .5; }
.ping-empty { padding: 20px 0; text-align: center; }.ping-library-footer { margin-top: 16px; font-size: 11px; line-height: 1.7; }
.ping-bottom-bar { margin-top: 24px; padding: 18px; border: 1px solid var(--border-color); border-radius: 10px; align-items: flex-start; background: var(--bg-primary); position: sticky; bottom: 12px; z-index: 2; box-shadow: 0 4px 20px rgba(0,0,0,.08); }.ping-preview { display: grid; gap: 8px; font-size: 11px; }.ping-preview-nodes { display: flex; gap: 6px; flex-wrap: wrap; }.ping-preview-nodes span { padding: 5px 7px; border-radius: 4px; background: var(--bg-secondary); }.ping-preview-nodes b { color: var(--accent-green); margin-left: 4px; font-weight: 500; }.ping-save-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; justify-content: flex-end; max-width: 340px; flex-shrink: 0; }.ping-save-actions > span { width: 100%; text-align: right; font-size: 10px; }
.ping-editor { width: 460px; max-width: calc(100vw - 32px); }.ping-editor .modal-header { margin-bottom: 18px; }.ping-editor > label { display: grid; gap: 7px; margin: 14px 0; font-size: 12px; }.ping-editor-replace { margin-top: 10px; }.ping-spinning { animation: ping-spin 1s linear infinite; } @keyframes ping-spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) { .ping-selected-list { grid-template-columns: minmax(0, 1fr); }.ping-carrier-grid { gap: 4px; padding: 10px 6px; }.ping-catalog-node { flex-wrap: wrap; gap: 7px; }.ping-catalog-node code { order: 3; flex-basis: 100%; }.ping-node-action { margin-left: auto; } }
@media (max-width: 650px) { .ping-settings-panel { padding: 14px; }.ping-toolbar, .ping-scope-note, .ping-bottom-bar { flex-direction: column; align-items: stretch; }.ping-scope { min-width: 0; }.ping-selected { padding: 12px; }.ping-selected-row { gap: 5px; padding: 9px 5px; }.ping-home-badge { display: none; }.ping-selected-info strong { font-size: 11px; }.ping-selected-info code { font-size: 9px; }.ping-row-actions .ping-icon-button { width: 25px; }.ping-heading-label { gap: 6px; }.ping-segment button { padding: 7px 11px; font-size: 11px; }.ping-family button { padding: 7px 9px; }.ping-match-count { margin-left: 0; font-size: 10px; }.ping-catalog-toolbar { gap: 8px; }.ping-carrier-grid { grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 8px; }.ping-catalog-node { flex-wrap: nowrap; min-height: 50px; }.ping-catalog-node code { order: 0; flex-basis: auto; font-size: 10px; }.ping-region-heading { padding: 12px 16px; }.ping-search-row { flex-wrap: wrap; }.ping-province-filter { width: 100%; }.ping-library-status { line-height: 1.6; }.ping-bottom-bar { bottom: 0; padding: 12px; gap: 12px; }.ping-preview-nodes { display: none; }.ping-preview > span { display: none; }.ping-preview { font-size: 10px; }.ping-save-actions { max-width: none; }.ping-save-actions > span { text-align: left; } }
@media (prefers-reduced-motion: reduce) { .ping-spinning { animation: none; } }
@media (max-width: 650px) {
  .ping-selected-row { display: grid; grid-template-columns: 20px 14px minmax(0, 1fr); gap: 5px; padding: 10px; }
  .ping-selected-info { grid-column: 3; }.ping-selected-info code { font-size: 10px; }
  .ping-row-actions { grid-column: 3; justify-self: end; }.ping-row-actions .ping-icon-button { width: 32px; height: 32px; }
  .ping-catalog-node code { font-size: 11px; }
}
</style>
