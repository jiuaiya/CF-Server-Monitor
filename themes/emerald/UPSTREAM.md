# 内置 Emerald 主题

来源：[Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald)，MIT License，版权声明保留在 LICENSE。

导入版本：`c80591198df4d2a0332b86b41e53e42fd341ed99`（1.2.10），2026-10-10。

本地适配：沿用主项目的 npm workspace 与部署流程，替换原内置 SAO；静态资源输出到 `/builtin/emerald/`。卡片和列表通过 API 适配器与节点 store 使用后台 Ping 数量、顺序、启用状态及单机别名（1～8 项），不再固定前三个运营商。WebSocket 更新保留显示配置；超时与 0 ms 的有效采样分别展示。首页按后台选择的节点逐项显示 Ping 延迟和丢包率及各自的十段历史色条，移除底部平均值汇总；后端历史关闭时按已收到的实时样本展示，缺少的段为灰色。自定义槽位同样支持两项指标。详情图的丢包可视化默认关闭。

管理入口继续使用 `/admin#/admin`，兼容旧 `/#/admin` 链接。GitHub Pages 导出也默认使用 Emerald，原页面另存为 `classic.html`，运行时从 apiBase meta 读取后端地址。主题资源与 MIT 许可一起进入构建产物。

每项结果显示节点名称，下方并列 Ping 和丢包，两项分别使用该槽位自己的十段历史条。API 适配与实时采样保留独立槽位数据；悬停或轻触色块可查看时间、延迟与丢包率，超时为红色，缺失样本为灰色，不使用汇总平均值替代单节点历史。

保留上游 Vue Composition API、hash 路由和 API/store 边界。更新上游时需保留这些适配与回归测试。

详情图的丢包视图改为分行热力图，与上方延迟曲线使用同一时间范围和联动指示线。每个节点一行，色块表示该时间段最高丢包率；提示显示准确区间、最高值及多次采样的平均值。0% 为淡绿、100% 为红、无数据为灰，丢包率不插值。格子数量兼顾屏幕宽度和实际采样间隔，避免虚假空格；默认关闭丢包开关的行为保留。历史适配与实时追加均保留合法 0ms 和未知丢包状态，延迟曲线不跨越明确失败的探测。

构建：项目根目录 `npm run build:frontend`。检查：`npm run test:emerald`、`npm run type-check --workspace cfsm-theme-emerald`、`npm run lint --workspace cfsm-theme-emerald`。
