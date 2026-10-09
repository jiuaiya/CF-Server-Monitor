const families = { ipv4: 'v4', ipv6: 'v6', dual: 'dualstack' }
export const CATALOG_CARRIERS = ['telecom', 'unicom', 'mobile']

// Zstatic's own directory switches only province endpoints; city nodes stay IPv4.
export function catalogEndpoint(node, family = 'ipv4') {
  if (node.level !== 'province' || !families[family]) return node.endpoint
  return node.endpoint.replace(/-v4(?=\.ip\.zstaticcdn\.com(?::\d+)?$)/i, `-${families[family]}`)
}

export function groupPingCatalog(nodes, { level = 'province', family = 'ipv4', query = '', province = '' } = {}) {
  const groups = new Map()
  const search = query.trim().toLowerCase()
  for (const source of nodes) {
    if (source.level !== level || (province && source.province !== province)) continue
    const node = { ...source, endpoint: catalogEndpoint(source, family) }
    if (search && !`${node.name} ${node.province} ${node.city} ${node.endpoint}`.toLowerCase().includes(search)) continue
    const id = JSON.stringify([node.province, level === 'city' ? node.city : ''])
    if (!groups.has(id)) groups.set(id, { id, name: level === 'city' ? node.city : node.province, province: node.province, nodes: [] })
    groups.get(id).nodes.push(node)
  }
  return [...groups.values()].map(group => ({ ...group, nodes: group.nodes.sort((a, b) => CATALOG_CARRIERS.indexOf(a.carrier) - CATALOG_CARRIERS.indexOf(b.carrier)) }))
}
