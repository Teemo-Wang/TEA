# 换电脑继续开发 TEA

本文用于迁移源码、规划和开发进度。Git 仓库不保存依赖缓存、本地数据库、任务运行记录、账号登录状态或密钥。

## 1. 克隆和安装

需要 Git、Node.js `>=24.11.0` 和 pnpm `9.15.4`。

```sh
git clone https://github.com/Teemo-Wang/TEA.git
cd TEA
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm dev
```

全新环境默认访问 `http://localhost:3100`。原验证实例使用过自定义端口 `3127`，它不是项目的固定端口。

## 2. 恢复 Agent 能力

在新电脑上重新安装并登录需要使用的 Agent CLI，例如 Codex。API 密钥、CLI 登录状态和 `.env` 不进入 Git，需要在新电脑单独配置。

首次启动会创建新的本地开发数据。Git 中的源码和规划可以完整恢复，但旧电脑里的 TEA-11 至 TEA-18 等测试任务不会自动出现在新数据库中。

如果确实需要迁移旧任务历史，应在旧电脑单独导出数据库和对应文件存储，并通过受保护的方式传输；不要把数据库备份或密钥提交到 GitHub。

## 3. 接续当前进度

开始开发前依次阅读：

1. [仓库协作规则](../../AGENTS.md)
2. [完整产品规划 V0.3.1](./product-plan-v0.3.1.md)
3. [MVP-0 开发规划 v1.1](./mvp0-plan-v1.1.md)
4. [M1 实施与验证记录](../plans/2026-10-15-team-os-reuse-stability.md)

当前 M1 已完成，下一步从 M2 开始：

- 探测并接入 DSH 的真实非交互执行、取消和错误路径。
- 验证 Codex 与 DSH 并行执行时不串任务、状态、会话或项目文件。
- 实现持久化能力表和最小模板/Agent 扩展入口。
- 保持 Paperclip 为唯一任务和运行事实源，不另建调度器或任务数据库。

交给新电脑上的 Codex 时，可以直接使用下面的任务说明：

> 请先阅读 `AGENTS.md`、`doc/team-os/README.md`、`doc/team-os/mvp0-plan-v1.1.md` 和 `doc/plans/2026-10-15-team-os-reuse-stability.md`。M1 已收尾，请从 M2 的 DSH 探测与能力矩阵开始，继续复用 Paperclip 作为唯一任务与运行事实源。

## 4. 提交前检查

至少执行与本次修改相关的测试，并检查：

```sh
pnpm typecheck
pnpm check:token-gates
git diff --check
```

不要提交 `node_modules`、`dist`、`.env`、本地数据库、运行缓存或 `.paperclip-health*`。
