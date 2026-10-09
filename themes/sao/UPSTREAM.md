# 内置 SAO 主题

来源：[WAOR/CFSM-SAO](https://github.com/WAOR/CFSM-SAO)，MIT License，版权声明保留在 LICENSE。

导入版本：`8d26ca481d260e4b03fd132a9d2775234621d092`，2026-10-10。

本地适配：以 npm workspace 构建，静态资源输出到 `/builtin/sao/`；首页使用后台下发的 Ping 数量、顺序、启用状态与单机别名。管理入口继续使用 `/admin#/admin`，兼容原来的 `/#/admin` 链接。更新上游时需保留这些适配及其测试。

GitHub Pages 导出同样默认使用 SAO，原页面另存为 `classic.html`。主题资源与 MIT 许可一起进入构建产物。

构建：项目根目录 `npm run build:frontend`。独立检查：`npm run test:sao`、`npm run typecheck --workspace cfsm-theme-sao`。
