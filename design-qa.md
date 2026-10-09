# Ping 节点选择改版 QA

日期：2026-10-10。范围：参考用户提供的节点目录截图，改善现有后台节点选择；保留项目主题和现有 8 个指标槽位。

## 视觉依据与截图

- Source visual truth path：`/var/folders/kx/033v249971s_ywr1pgy__xmm0000gn/T/codex-clipboard-2d7ef69e-fdc6-4568-b7ef-f9d131f60936.png`，2632 × 1410 像素，来源为用户附件。
- Implementation screenshot path：`/tmp/cf-ping-redesign-desktop.png`，1432 × 994 像素；CSS viewport 为 1440 × 1000，浏览器 devicePixelRatio 为 1。
- 手机截图：`/tmp/cf-ping-redesign-mobile.png`、`/tmp/cf-ping-redesign-mobile-catalog.png`，382 × 827 像素；CSS viewport 为 390 × 844。
- 深色主题截图：`/tmp/cf-ping-redesign-dark.png`，省级 IPv4、河北搜索结果；主题控件与浏览器视口在检查后恢复。
- Full-view comparison evidence：`/tmp/cf-ping-redesign-comparison.png`。参考图与实现的节点库区域分别裁剪后按宽 1000 像素等比例缩放，放入同一对比图，避免把整个后台外壳与目录截图作精确像素比较。
- Focused region comparison evidence：`/tmp/cf-ping-redesign-focus.png`。比较首个省份卡片的标题、三网标签、地址和操作，两个区域分别按宽 1200 像素等比例缩放。
- State：后台 Ping Tab、全局配置、省级节点、IPv4、空搜索；实现中河北电信处于点选状态，以检查勾选反馈。截图文件为本地 QA 临时证据，不进入生产构建。

## Findings

没有剩余的 P0 / P1 / P2 问题。

- 字体与层次：采用项目现有 JetBrains Mono 和中文回退字体。地区标题 15px、地址 11px，省份、运营商、地址的层次与参考图对应；桌面地址完整，手机允许换行。
- 间距与布局：宽节点库替代原来狭窄的单条列表；分段切换、整行搜索、地区卡片、三网列结构与参考图对应。手机三网纵向显示，已选项的按钮另起一行。桌面和手机未出现横向溢出。
- 颜色与主题：保留项目既有背景、终端纹理和主题变量；运营商使用绿／红／蓝标签。选中状态同时使用边框、底色、勾选和 `aria-pressed`。项目背景与参考图纯白背景的差异属于现有产品主题适配。
- 图标与素材：参考图没有照片或插画。搜索、添加、勾选、编辑、排序和关闭使用 Lucide Vue 标准图标。把原目录的复制按钮改为整行选择操作，是监测配置场景的有意调整。
- 文案与内容：省级／市级分组、IPv4／IPv6／双栈及匹配组数与参考结构一致。新增选择上限、整组添加和已选节点提示。省级地址切换参照 Zstatic 自身目录实现；市级只显示接口提供的 IPv4 地址。

## Comparison history

1. 初次手机检查发现：已选节点的同行按钮挤压地址，长域名分成多段；按 P2 处理。
2. 修复：手机已选项采用三列网格，把操作放到地址下方；按钮改为 32 × 32px，节点库点选行至少 50px 高。
3. 修复后重新捕获手机已选区和节点库截图：地址可读，控件不重叠，页面宽度 382px 小于 390px 视口。
4. 最终完整及首个地区卡片对比：地区卡片和三网选择结构符合参考方向，无须进一步视觉修复。主题、保存栏和监测节点配置区属于现有产品场景适配。

## 交互与验证

- 浏览器验证：单个选择／取消、三网整组添加、8 个上限、满额替换、IPv6／双栈切换、地址搜索、市级分组、手动 IPv6、重复地址校验。
- 全局配置保存后重载保持节点与排序；单机继承、排序自动转为独立设置、首页数量覆盖、恢复默认均验证通过。
- 编辑弹窗自动聚焦输入框；Tab 循环、Escape 关闭、关闭后焦点返回入口验证通过。
- 最终页面 console error / warning 检查：无记录。
- `npm run build:frontend` 通过。
- `TRUST_STORES=none npm run test:all` 通过：69 个主测试、Agent 配置校验、6 个历史查询测试。
- 数据库及 Agent 协议无变更，无需执行数据库升级。
- 验证结束后已停止 Wrangler 及其子进程，清理浏览器工具运行时；8787 端口无监听。

## Implementation checklist

- [x] 参考图的地区分组与三网并排结构
- [x] 可实际点选的节点库与简洁已选区
- [x] 地址族、搜索、排序、编辑与保存
- [x] 手机布局和键盘操作
- [x] 实际浏览器截图对比及功能验证
- [x] 构建与相关测试

final result: passed
