# Lager 仓储 · 文档中心

一套面向中小企业、单机可部署的仓库管理系统（WMS）设计与实施文档。  
技术栈：React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui 风格组件 · FastAPI + SQLite。  
当前版本：**1.1.0**（2026-11-09，新增列表全选、Intro.js 新手指引、AI 智能入库）。

## 快速导航

| 文档 | 内容 | 读者 |
|---|---|---|
| [00 调研](erp-warehouse-research.md) | WMS 业务流程、ERPNext 借鉴点、范围取舍 | 产品/全员 |
| [01 产品需求](01-product-requirements.md) | 目标、角色、功能需求 ID、验收标准 | 产品/测试 |
| [02 架构](02-architecture.md) | 模块化单体、依赖规则、目录、请求链、库存一致性 | 开发 |
| [03 数据模型](03-data-model.md) | 表、字段、约束、索引、迁移策略 | 开发/DBA |
| [04 API](04-api-spec.md) | 端点、请求/响应、错误码、权限 | 前后端/测试 |
| [05 UI/UX](05-ui-design.md) | macOS 风格令牌、布局、页面、交互、无障碍 | 前端/设计 |
| [06 安全](06-security.md) | 威胁模型、认证授权、注入/XSS/CSRF、容器加固 | 开发/运维 |
| [07 性能](07-performance.md) | 目标、SQLite 调优、索引、查询模式、基准计划 | 开发/运维 |
| [08 测试](08-testing.md) | 测试阶段、用例、门禁、追溯矩阵 | 测试/全员 |
| [09 部署](09-deployment.md) | Docker Compose、Windows bat、备份、排障 | 运维 |
| [10 路线图](10-roadmap.md) | 里程碑、WBS、风险、版本规划 | 项目管理 |
| [11 用户手册](11-user-manual.md) | 登录、库存、单据、盘点、报表、常见问题 | 最终用户 |
| [12 测试报告](test-report.md) | 验收结果、覆盖率、缺陷、未验证项 | 测试/全员 |
| [13 性能报告](performance-report.md) | 数据集、实测指标、优化前后对比 | 开发/运维 |
| [14 AI 与引导](14-ai-and-onboarding.md) | 列表全选、Intro.js 新手指引、AI 截图/链接入库、提示词与安全设计 | 产品/开发/测试 |

## 一页纸设计摘要

- **形态**：模块化单体 + 单页应用；生产由 FastAPI 同源托管 `frontend/dist`。
- **范围**：登录/RBAC、工作台、商品（统一管理库存）、仓库/供应商/客户、库存余额/流水（只读）、入库/出库/调拨/盘点、报表 CSV、用户/审计；v1.1 增加列表全选与批量清除、Intro.js 新手指引、DeepSeek/Ollama AI 截图与链接入库。
- **不做**：采购销售全流程、财务、生产、批次效期、序列号、库位、多单位、多租户。
- **库存**：`(product, warehouse)` 唯一余额；确认单据在同一事务写余额 + 不可变流水；条件更新保证不超卖；移动加权平均成本。
- **单据**：`DRAFT → CONFIRMED`；确认后不可变；重复确认 409；取消仅草稿。
- **安全**：PBKDF2-SHA256 600k；JWT 仅存 HttpOnly/SameSite=Lax Cookie；后端 RBAC；审计；CSP；登录限流；容器非 root/只读。
- **界面**：macOS 风格（SF 系统字体、#007AFF、毛玻璃侧栏、10–12px 圆角）；一屏一主任务；加载/空/错三态；移动端可用。
- **部署**：`docker compose up -d --build`；Windows 双击 `start.bat`；SQLite 数据卷持久化。

## 关键约定

1. 文档中的“必须/禁止”为实现与测试的硬约束；变更需同步更新文档。
2. API 字段以 [04-api-spec.md](04-api-spec.md) 为准；数据库以 [03-data-model.md](03-data-model.md) 为准。
3. 时间以 UTC 存储，API 输出 `Z`；日期筛选按 `APP_TIMEZONE`。
4. 数量/金额 4 位小数存储；页面金额 2 位、数量最多 4 位。
5. 先完成全部功能，再统一测试（用户要求）。

## 术语

| 术语 | 含义 |
|---|---|
| SKU | 商品唯一编码 |
| 余额 | 某商品在某仓库的当前数量与平均成本 |
| 流水 | 每一次库存变化的不可变记录 |
| 单据 | 入库/出库/调拨/盘点的业务凭证 |
| 确认 | 草稿生效并写库存的动作，不可逆 |
| 移动加权平均 | 每次入库后按数量加权更新平均成本 |
| 收发存 | 期初 + 入库 − 出库 + 调整 = 期末 |

## 文档状态

| 文档 | 状态 |
|---|---|
| 00–11 | 已完成；01–11 已同步至 v1.1（2026-11-11） |
| 12 测试报告 | 已完成（2026-11-11）：后端 143/143、AI 29/29、安全 15/15、覆盖率 90%、桌面 21 路由、移动端 21/21 无溢出、全量 UI 交互通过；另含剪贴板 2/2、Ollama 动态模型、stop.bat 安全拒杀、单据编号不复用 |
| 13 性能报告 | 已完成（2026-11-09），核心 API 指标达标；AI 路径未做独立基准 |
| 14 AI 与引导 | 已完成并实现（2026-11-11） |
| Docker 运行验证 | 未执行（本机无 Docker）；`verify_docker.py` 静态检查通过（DOCKER CONFIG OK） |

## 本地预览

文档为纯 Markdown，可用 VS Code 预览或：

```bash
npx markdownlint-cli2 "doc/*.md"   # 可选
```

Mermaid 图在 GitHub、VS Code（Markdown Preview Mermaid）中可直接渲染。
