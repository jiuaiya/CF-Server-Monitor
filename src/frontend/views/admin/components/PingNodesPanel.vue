<template>
  <div v-show="activeTab === 'pingNodes'" class="ping-settings-panel">
    <div class="ping-toolbar">
      <div>
        <h3>{{ text.title }}</h3>
        <p class="text-secondary text-sm">{{ text.subtitle }}</p>
      </div>
      <label class="ping-scope">
        <span>{{ text.scope }}</span>
        <select class="form-select" :value="scope" :disabled="saving" @change="changeScope($event.target.value)">
          <option value="">{{ text.defaults }}</option>
          <option v-for="server in servers" :key="server.id" :value="server.id">{{ server.name }}</option>
        </select>
      </label>
    </div>

    <div v-if="isServer" class="ping-scope-note">
      <span>{{ text.machineHint }}</span>
      <button class="btn btn-sm" :disabled="saving" @click="resetInheritance">{{ text.resetAll }}</button>
    </div>
    <p v-if="currentServer?.ping_mode === 'icmp'" class="ping-notice">{{ text.icmpHint }}</p>
    <p v-if="message" role="status" class="ping-feedback" :class="{ 'text-red': error }">{{ message }}</p>

    <fieldset class="ping-edit-fieldset" :disabled="saving">
    <div class="ping-settings-layout">
      <section class="ping-library">
        <div class="ping-section-heading">
          <h4>{{ text.library }} <span class="text-secondary">{{ catalog.length }}</span></h4>
          <button class="btn btn-sm" :disabled="loadingCatalog" @click="loadCatalog(true)">{{ loadingCatalog ? text.loading : text.refresh }}</button>
        </div>
        <input v-model="search" type="search" class="form-input" :placeholder="text.search" :aria-label="text.search">
        <div class="ping-filters">
          <select v-model="province" class="form-select" :aria-label="text.provinces">
            <option value="">{{ text.provinces }}</option><option v-for="item in provinces" :key="item">{{ item }}</option>
          </select>
          <select v-model="carrier" class="form-select" :aria-label="text.carriers">
            <option value="">{{ text.carriers }}</option><option value="telecom">{{ text.telecom }}</option><option value="unicom">{{ text.unicom }}</option><option value="mobile">{{ text.mobile }}</option>
          </select>
          <select v-model="level" class="form-select" :aria-label="text.levels">
            <option value="">{{ text.levels }}</option><option value="province">{{ text.province }}</option><option value="city">{{ text.city }}</option>
          </select>
        </div>
        <div v-if="targetKey" class="ping-target" role="status">
          {{ text.replacing }} {{ nodeLabel(targetKey) }}
          <button class="btn btn-sm" @click="targetKey = ''">{{ text.cancel }}</button>
        </div>
        <div class="ping-library-status text-secondary text-sm">
          {{ filteredCatalog.length }} {{ text.results }} · TCP
          <span v-if="catalogUpdatedAt"> · {{ text.updated }} {{ formatDate(catalogUpdatedAt) }}</span>
        </div>
        <p v-if="catalogError" class="text-red text-sm" role="alert">{{ catalogError }}</p>
        <div class="ping-catalog-list" :aria-busy="loadingCatalog">
          <p v-if="!filteredCatalog.length" class="ping-empty text-secondary">{{ loadingCatalog ? text.loading : text.empty }}</p>
          <div v-for="node in filteredCatalog" :key="node.endpoint" class="ping-catalog-node">
            <div class="ping-catalog-info">
              <strong>{{ node.name }}</strong><span class="text-secondary text-sm">{{ node.province }} · {{ node.level === 'city' ? text.city : text.province }}</span>
              <code>{{ node.endpoint }}</code>
            </div>
            <button class="btn btn-sm" :disabled="saving || isSelected(node.endpoint) || (!targetKey && enabledCount >= 8)" @click="selectNode(node)">
              {{ isSelected(node.endpoint) ? text.selected : targetKey ? text.replace : text.add }}
            </button>
          </div>
        </div>
        <p class="text-secondary text-sm ping-library-footer">{{ text.sourceHint }}</p>
      </section>

      <section class="ping-selected">
        <div class="ping-section-heading">
          <h4>{{ text.nodes }} <span class="text-secondary">{{ enabledCount }} / 8</span></h4>
          <span v-if="dirty" class="text-secondary text-sm">{{ text.unsaved }}</span>
        </div>
        <div class="ping-display-controls">
          <label v-if="isServer" class="ping-check"><input v-model="inheritOrder" type="checkbox" @change="!inheritOrder && (order = normalizePingOrder(settings.ping_display_order))">{{ text.followOrder }}</label>
          <label class="ping-count-control">
            <span>{{ text.homeCount }}</span>
            <select v-model="count" class="form-select" :disabled="isServer && inheritCount">
              <option v-for="n in 8" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label v-if="isServer" class="ping-check"><input v-model="inheritCount" type="checkbox" @change="!inheritCount && (count = normalizePingCount(settings.ping_display_count))">{{ text.followCount }}</label>
        </div>
        <p class="text-secondary text-sm">{{ text.sortHint }}</p>
        <div class="ping-slot-list">
          <div v-for="(key, index) in displayOrder" :key="key" class="ping-slot" :class="{ 'ping-slot-off': !endpoint(key), 'ping-slot-target': targetKey === key }" @dragover.prevent @drop.prevent="dropOn(key)">
            <div class="ping-slot-heading">
              <button class="ping-drag-handle" draggable="true" :disabled="isServer && inheritOrder" :aria-label="text.drag + ' ' + nodeLabel(key)" @dragstart="startDrag($event, key)" @dragend="dragKey = ''">⋮⋮</button>
              <span class="ping-rank">{{ index + 1 }}</span>
              <input v-model.trim="names[key]" class="form-input ping-name-input" maxlength="60" :placeholder="fallbackName(key)" :aria-label="text.name + ' ' + (index + 1)">
              <select v-model="modes[key]" class="form-select ping-mode-input" :aria-label="text.mode + ' ' + nodeLabel(key)">
                <option v-if="isServer" value="inherit">{{ text.inherit }}</option><option value="custom">{{ text.custom }}</option><option value="off">{{ text.off }}</option>
              </select>
            </div>
            <input v-model.trim="values[key]" class="form-input ping-endpoint-input" :class="{ 'input-invalid': nodeError(key) }" :disabled="modes[key] !== 'custom'" :placeholder="modes[key] === 'inherit' ? globalEndpoint(key) || text.noDefault : 'host[:port] / [IPv6]:port'" :aria-label="text.endpoint + ' ' + nodeLabel(key)">
            <p v-if="nodeError(key)" class="text-red text-sm">{{ nodeError(key) }}</p>
            <div class="ping-slot-actions">
              <button class="btn btn-sm" :disabled="saving" @click="targetKey = key">{{ text.choose }}</button>
              <span class="ping-order-actions">
                <button class="btn btn-sm" :disabled="index === 0 || (isServer && inheritOrder)" :aria-label="text.up + ' ' + nodeLabel(key)" @click="move(key, -1)">↑</button>
                <button class="btn btn-sm" :disabled="index === 7 || (isServer && inheritOrder)" :aria-label="text.down + ' ' + nodeLabel(key)" @click="move(key, 1)">↓</button>
                <button class="btn btn-sm" :disabled="index === 0 || (isServer && inheritOrder)" @click="move(key, -index)">{{ text.top }}</button>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="ping-bottom-bar">
      <div class="ping-preview">
        <strong>{{ text.preview }}</strong>
        <div v-if="previewKeys.length" class="ping-preview-nodes"><span v-for="key in previewKeys" :key="key">{{ nodeLabel(key) }} <b>{{ previewResult(key) }}</b></span></div>
        <span v-else class="text-secondary">{{ text.noNodes }}</span>
        <span v-if="enabledCount > effectiveCount" class="text-secondary text-sm">+ {{ enabledCount - effectiveCount }} {{ text.more }}</span>
      </div>
      <div class="ping-save-actions">
        <span class="text-secondary text-sm">{{ isServer ? text.machineSave : `${text.affects} ${inheritingServers} ${text.machines}` }}</span>
        <button class="btn" :disabled="saving || !dirty" @click="discardDraft">{{ text.discard }}</button>
        <button class="btn btn-primary" :disabled="saving || hasErrors || !dirty" @click="save">{{ saving ? text.saving : text.save }}</button>
      </div>
    </div>
    </fieldset>
    <div v-if="pendingScope !== null" class="modal-overlay active">
      <div class="modal-dialog" role="dialog" aria-modal="true" :aria-label="text.unsaved">
        <div class="modal-header"><div class="modal-title">{{ text.unsaved }}</div></div>
        <p>{{ text.discardQuestion }}</p>
        <div class="modal-footer"><button class="btn" @click="cancelScope">{{ text.cancel }}</button><button class="btn btn-red" @click="confirmScope">{{ text.discard }}</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { currentLang } from '../../../utils/i18n.js'
import { PING_SLOTS, normalizePingOrder, normalizePingCount, validatePingNode } from '../../../utils/pingNode.js'

const props = defineProps({ settings: { type: Object, required: true }, servers: { type: Array, default: () => [] }, activeTab: String, request: { type: Function, required: true }, targetId: { type: String, default: '' } })
const emit = defineEmits(['saved', 'scope-change'])
const copy = {
  zh: { title: 'Ping 节点', subtitle: '选择监测节点，设置首页显示优先级。最多 8 个节点。', scope: '配置范围', defaults: '全局默认配置', machineHint: '节点、排序和首页显示数量可分别跟随全局默认，或单独设置。', resetAll: '全部恢复跟随默认', icmpHint: '这台机器使用 ICMP。节点库提供 TCP 地址和端口，请确认目标支持 ICMP。', library: '节点库', refresh: '刷新节点库', loading: '加载中…', search: '搜索省份、城市、名称或地址', provinces: '全部省份', carriers: '全部运营商', levels: '省级和城市', telecom: '电信', unicom: '联通', mobile: '移动', province: '省级节点', city: '城市节点', replacing: '选择节点以替换：', cancel: '取消', results: '个匹配节点', updated: '源更新', empty: '没有匹配的节点', selected: '已选择', replace: '替换', add: '添加', sourceHint: '来源：Zstatic。加入配置后才开始监测，接口不可用时仍可手动填写地址。', nodes: '监测节点与显示顺序', unsaved: '有未保存的修改', followOrder: '排序跟随默认', homeCount: '首页显示', followCount: '数量跟随默认', sortHint: '拖动手柄或使用箭头排序。排序仅影响显示，超时节点保留原位置。', drag: '拖动排序', name: '节点名称', mode: '节点设置', inherit: '跟随默认', custom: '自定义', off: '禁用', endpoint: '节点地址', noDefault: '全局未配置此节点', choose: '从节点库选择', up: '上移', down: '下移', top: '置顶', preview: '首页预览', noNodes: '未启用监测节点', more: '个节点展开查看', machineSave: '仅保存当前机器的 Ping 配置', affects: '默认变更会影响', machines: '台跟随默认节点或显示设置的机器', discard: '放弃修改', saving: '保存中…', save: '保存 Ping 配置', discardQuestion: '切换配置范围会丢弃当前未保存的修改。', unavailable: '节点库暂时不可用，请重试或手动填写地址。', stale: '节点库刷新失败，正在使用上次成功加载的列表。', invalid: '请输入域名、IPv4 或 IPv6，可带端口（1–65535）。', full: '已启用 8 个节点，请先禁用一个节点或指定要替换的节点。', saved: 'Ping 配置已保存。', failed: '保存失败，请重试。', noSample: '无样本', timeout: '超时' },
  en: { title: 'Ping nodes', subtitle: 'Choose up to 8 monitoring nodes and set the home display priority.', scope: 'Scope', defaults: 'Global defaults', machineHint: 'Inherit global nodes or customize nodes, order and home display count separately.', resetAll: 'Restore all defaults', icmpHint: 'This server uses ICMP. The catalog provides TCP endpoints; verify ICMP support.', library: 'Node catalog', refresh: 'Refresh catalog', loading: 'Loading…', search: 'Search province, city, name or address', provinces: 'All provinces', carriers: 'All carriers', levels: 'All levels', telecom: 'Telecom', unicom: 'Unicom', mobile: 'Mobile', province: 'Province', city: 'City', replacing: 'Choose a replacement for:', cancel: 'Cancel', results: 'matching nodes', updated: 'Source updated', empty: 'No matching nodes', selected: 'Selected', replace: 'Replace', add: 'Add', sourceHint: 'Source: Zstatic. Only configured nodes are monitored. Manual addresses remain available if the catalog fails.', nodes: 'Monitoring nodes and display order', unsaved: 'Unsaved changes', followOrder: 'Inherit display order', homeCount: 'Home display count', followCount: 'Inherit count', sortHint: 'Drag handles or use arrows to reorder. Timeouts keep their position.', drag: 'Reorder', name: 'Node name', mode: 'Node setting', inherit: 'Inherit', custom: 'Custom', off: 'Disabled', endpoint: 'Endpoint', noDefault: 'No global node configured', choose: 'Choose from catalog', up: 'Move up', down: 'Move down', top: 'First', preview: 'Home preview', noNodes: 'No monitoring nodes enabled', more: 'more nodes to expand', machineSave: 'Save Ping settings for this server only', affects: 'Default changes affect', machines: 'servers inheriting nodes or display settings', discard: 'Discard changes', saving: 'Saving…', save: 'Save Ping settings', discardQuestion: 'Switching scope will discard your unsaved changes.', unavailable: 'Catalog unavailable. Retry or enter an address manually.', stale: 'Refresh failed. Showing the last successful catalog.', invalid: 'Enter a hostname, IPv4 or IPv6, optionally with a port (1–65535).', full: 'All 8 nodes are enabled. Disable a node or choose one to replace.', saved: 'Ping settings saved.', failed: 'Save failed. Please retry.', noSample: 'No samples', timeout: 'Timeout' }
}
const text = computed(() => copy[currentLang.value === 'zh' ? 'zh' : 'en'])
const scope = ref(''), pendingScope = ref(null), values = ref({}), names = ref({}), modes = ref({}), order = ref(normalizePingOrder()), count = ref(3)
const inheritOrder = ref(false), inheritCount = ref(false), saving = ref(false), baseline = ref(''), message = ref(''), error = ref(false), targetKey = ref(''), dragKey = ref('')
const catalog = ref([]), catalogError = ref(''), catalogUpdatedAt = ref(''), loadingCatalog = ref(false), search = ref(''), province = ref(''), carrier = ref(''), level = ref('')
const isServer = computed(() => !!scope.value)
const currentServer = computed(() => props.servers.find(server => server.id === scope.value))
const displayOrder = computed(() => isServer.value && inheritOrder.value ? normalizePingOrder(props.settings.ping_display_order) : order.value)
const effectiveCount = computed(() => isServer.value && inheritCount.value ? normalizePingCount(props.settings.ping_display_count) : count.value)
const slotFor = key => PING_SLOTS.find(slot => slot.key === key)
const globalEndpoint = key => { const raw = props.settings[slotFor(key).field]; return raw === '0' || raw === 0 ? '' : raw || '' }
const endpoint = key => modes.value[key] === 'off' ? '' : modes.value[key] === 'inherit' ? globalEndpoint(key) : values.value[key] || ''
const fallbackName = key => props.settings[slotFor(key).nameField] || slotFor(key).label
const nodeLabel = key => names.value[key] || fallbackName(key)
const enabledCount = computed(() => PING_SLOTS.filter(slot => endpoint(slot.key)).length)
const previewKeys = computed(() => displayOrder.value.filter(key => endpoint(key)).slice(0, effectiveCount.value))
const nodeError = key => modes.value[key] === 'custom' && (!values.value[key] || values.value[key] === '0' || !validatePingNode(values.value[key]).valid) ? text.value.invalid : ''
const hasErrors = computed(() => PING_SLOTS.some(slot => nodeError(slot.key)))
const signature = () => JSON.stringify({ values: values.value, names: names.value, modes: modes.value, order: order.value, count: count.value, inheritOrder: inheritOrder.value, inheritCount: inheritCount.value })
const dirty = computed(() => signature() !== baseline.value)
const provinces = computed(() => [...new Set(catalog.value.map(node => node.province))])
const filteredCatalog = computed(() => catalog.value.filter(node => (!province.value || node.province === province.value) && (!carrier.value || node.carrier === carrier.value) && (!level.value || node.level === level.value) && (!search.value || `${node.name} ${node.province} ${node.endpoint}`.toLowerCase().includes(search.value.trim().toLowerCase()))))
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
  targetKey.value = ''
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
function isSelected(address) { return PING_SLOTS.some(slot => endpoint(slot.key).toLowerCase() === address.toLowerCase()) }
function selectNode(node) {
  const key = targetKey.value || displayOrder.value.find(key => !endpoint(key))
  if (!key) { message.value = text.value.full; error.value = true; return }
  values.value[key] = node.endpoint; names.value[key] = node.name; modes.value[key] = 'custom'; targetKey.value = ''; message.value = ''
}
function move(key, offset) {
  if (isServer.value && inheritOrder.value) return
  const next = [...displayOrder.value], from = next.indexOf(key), to = Math.max(0, Math.min(7, from + offset))
  next.splice(from, 1); next.splice(to, 0, key); order.value = next
}
function startDrag(event, key) { if (isServer.value && inheritOrder.value) { event.preventDefault(); return }; dragKey.value = key; event.dataTransfer.setData('text/plain', key); event.dataTransfer.effectAllowed = 'move' }
function dropOn(key) { if (dragKey.value) move(dragKey.value, displayOrder.value.indexOf(key) - displayOrder.value.indexOf(dragKey.value)); dragKey.value = '' }
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
watch(() => props.activeTab, tab => { if (tab === 'pingNodes' && !catalog.value.length) loadCatalog() }, { immediate: true })
watch(() => props.servers, () => { if (!dirty.value) { if (scope.value && !currentServer.value) scope.value = ''; loadDraft() } })
</script>

<style scoped>
.ping-settings-panel { padding: 22px; }
.ping-edit-fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.ping-toolbar, .ping-section-heading, .ping-bottom-bar, .ping-scope-note, .ping-save-actions, .ping-slot-heading, .ping-slot-actions, .ping-target { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3, h4, p { margin: 0; } h3 { color: var(--accent-green); margin-bottom: 8px; } h4 { font-size: 14px; } h4 span { font-weight: normal; margin-left: 6px; }
.ping-scope { min-width: 230px; display: grid; gap: 6px; font-size: 12px; }
.ping-scope-note, .ping-notice, .ping-feedback { margin-top: 16px; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; }
.ping-settings-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 20px; margin-top: 22px; }
.ping-library, .ping-selected { min-width: 0; padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; }
.ping-section-heading { margin-bottom: 14px; }
.ping-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin: 9px 0; }
.ping-filters .form-select { font-size: 11px; padding: 7px; }
.ping-target { margin: 12px 0; border-left: 2px solid var(--accent-green); padding-left: 10px; font-size: 12px; }
.ping-library-status { margin: 12px 0; line-height: 1.6; }
.ping-catalog-list { max-height: 700px; overflow-y: auto; }
.ping-catalog-node { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--border-color); }
.ping-catalog-info { min-width: 0; display: grid; gap: 5px; } .ping-catalog-info strong { font-size: 13px; }
.ping-catalog-info code { font-size: 10px; overflow-wrap: anywhere; color: var(--text-secondary); }
.ping-library-footer { margin-top: 12px; line-height: 1.7; } .ping-empty { padding: 24px 0; }
.ping-display-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 10px; font-size: 12px; }
.ping-check, .ping-count-control { display: flex; align-items: center; gap: 6px; } .ping-count-control .form-select { width: 65px; }
.ping-slot-list { display: grid; gap: 10px; margin-top: 12px; }
.ping-slot { padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.ping-slot-off { border-style: dashed; } .ping-slot-target { border-color: var(--accent-green); }
.ping-slot-heading { gap: 7px; } .ping-rank { color: var(--text-secondary); font-size: 12px; width: 14px; flex-shrink: 0; }
.ping-drag-handle { padding: 5px 2px; border: 0; background: transparent; color: var(--text-secondary); cursor: grab; font: inherit; } .ping-drag-handle:disabled { cursor: default; }
.ping-name-input { min-width: 0; flex: 1; } .ping-mode-input { width: 105px; flex-shrink: 0; font-size: 11px; padding: 8px; }
.ping-endpoint-input { margin: 8px 0; font-size: 11px; } .ping-slot-actions { margin-top: 2px; } .ping-order-actions { display: flex; gap: 5px; }
.ping-bottom-bar { margin-top: 20px; padding: 16px; border: 1px solid var(--border-color); border-radius: 8px; align-items: flex-start; }
.ping-preview { display: grid; gap: 10px; font-size: 12px; } .ping-preview-nodes { display: flex; gap: 8px; flex-wrap: wrap; } .ping-preview-nodes span { padding: 7px 9px; border-radius: 4px; background: var(--bg-secondary); } .ping-preview-nodes b { color: var(--accent-green); margin-left: 5px; }
.ping-save-actions { flex-wrap: wrap; justify-content: flex-end; max-width: 340px; } .ping-save-actions > span { width: 100%; text-align: right; }
@media (max-width: 1000px) { .ping-settings-layout { grid-template-columns: minmax(0, 1fr); } .ping-catalog-list { max-height: 350px; } }
@media (max-width: 600px) { .ping-settings-panel { padding: 14px; } .ping-toolbar, .ping-bottom-bar, .ping-scope-note { flex-direction: column; align-items: stretch; } .ping-scope { min-width: 0; } .ping-library, .ping-selected { padding: 12px; } .ping-save-actions { max-width: none; } .ping-save-actions > span { text-align: left; } .ping-slot-heading { flex-wrap: wrap; } .ping-mode-input { width: 100%; } .ping-name-input { width: calc(100% - 60px); } }
</style>
