# 内置 Emerald 主题

来源：[Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald)，MIT License，版权声明保留在 LICENSE。

导入版本：`c80591198df4d2a0332b86b41e53e42fd341ed99`（1.2.10），2026-10-10。

本地适配：沿用主项目的 npm workspace 与部署流程，替换原内置 SAO；静态资源输出到 `/builtin/emerald/`。卡片和列表通过 API 适配器与节点 store 使用后台 Ping 数量、顺序、启用状态及单机别名（1～8 项），不再固定前三个运营商。WebSocket 更新保留显示配置；超时与 0 ms 的有效采样分别展示。首页按后台选择的节点逐项显示 Ping 延迟和丢包率及各自的十段历史色条，移除底部平均值汇总；后端历史关闭时按已收到的实时样本展示，缺少的段为灰色。自定义槽位同样支持两项指标。详情图的丢包可视化默认关闭。

管理入口继续使用 `/admin#/admin`，兼容旧 `/#/admin` 链接。GitHub Pages 导出也默认使用 Emerald，原页面另存为 `classic.html`，运行时从 apiBase meta 读取后端地址。主题资源与 MIT 许可一起进入构建产物。

每项结果显示节点名称，下方并列 Ping 和丢包，两项分别使用该槽位自己的十段历史条。API 适配与实时采样保留独立槽位数据；悬停或轻触色块可查看时间、延迟与丢包率，超时为红色，缺失样本为灰色，不使用汇总平均值替代单节点历史。

保留上游 Vue Composition API、hash 路由和 API/store 边界。更新上游时需保留这些适配与回归测试。

详情图的丢包视图改为异常记录列表，位于延迟曲线下方。按所选时间范围和探测节点过滤，逐条列出节点、发生时间和准确丢包率，最新在前，每页十条；仅显示大于 0 的记录，缺失值不作为异常。同节点同时间的重复记录以明确丢包率为准，0% 可覆盖推断超时；小于 0.01% 的正值不会显示成 0%。正常采样无异常和完全无丢包数据分别提示。丢包开关仍默认关闭，合法 0ms、未知丢包状态及明确失败的延迟断点处理保留。

详情页和首页弹窗的节点卡片、曲线及丢包列表共用当前机器的 `pingDisplay` 配置，按启用状态、数量、排序和单机别名选择槽位，停用节点的旧历史不再作为显示入口。历史任务名称不覆盖当前别名，排序不改变采样槽位的固定 id；新启用但尚无历史的槽位仍可接收后续实时采样。手动节点筛选在刷新和切换时间范围时保留，配置新增或停用槽位时同步更新。

构建：项目根目录 `npm run build:frontend`。检查：`npm run test:emerald`、`npm run type-check --workspace cfsm-theme-emerald`、`npm run lint --workspace cfsm-theme-emerald`。
