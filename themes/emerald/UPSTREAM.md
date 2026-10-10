# 内置 Emerald 主题

来源：[Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald)，MIT License，版权声明保留在 LICENSE。

导入版本：`c80591198df4d2a0332b86b41e53e42fd341ed99`（1.2.10），2026-10-10。

本地适配：沿用主项目的 npm workspace 与部署流程，替换原内置 SAO；静态资源输出到 `/builtin/emerald/`。卡片和列表通过 API 适配器与节点 store 使用后台 Ping 数量、顺序、启用状态及单机别名（1～8 项），不再固定前三个运营商。WebSocket 更新保留显示配置；超时与 0 ms 的有效采样分别展示。首页默认显示所选 Ping 节点的延迟 / 丢包统计与十段历史色条；后端历史关闭时按已收到的实时样本展示，缺少的段为灰色。历史与实时汇总均包括自定义槽位，只统计首页选中的节点。详情图的丢包可视化默认关闭。

管理入口继续使用 `/admin#/admin`，兼容旧 `/#/admin` 链接。GitHub Pages 导出也默认使用 Emerald，原页面另存为 `classic.html`，运行时从 apiBase meta 读取后端地址。主题资源与 MIT 许可一起进入构建产物。

每项 Ping 结果下方也显示该槽位自己的十段延迟历史条。API 适配与实时采样保留独立槽位数据；悬停或轻触色块可查看时间、延迟与丢包率，超时为红色，缺失样本为灰色，不使用汇总平均值替代单节点历史。

保留上游 Vue Composition API、hash 路由和 API/store 边界。更新上游时需保留这些适配与回归测试。

构建：项目根目录 `npm run build:frontend`。检查：`npm run test:emerald`、`npm run type-check --workspace cfsm-theme-emerald`、`npm run lint --workspace cfsm-theme-emerald`。
