# Lager 仓储 · 安全设计

版本：1.1  
日期：2026-11-09  
适用范围：v1.1 单机/单容器部署  
关联：[架构](02-architecture.md)、[API](04-api-spec.md)、[部署](09-deployment.md)

## 1. 安全目标与假设

**目标**

1. 未登录者不能读取任何业务数据。
2. 已登录用户只能执行其角色允许的操作；越权请求被后端拒绝，而非仅隐藏按钮。
3. 密码、会话令牌、审计日志不被泄露或篡改。
4. 库存写操作具备事务原子性，不能通过并发/重复请求造成负库存或重复入账。
5. 常见 Web 攻击（SQL 注入、XSS、CSRF、点击劫持、暴力破解）有明确缓解。
6. 容器以最小权限运行，数据可备份、可恢复。

**假设**

- 部署在受信任的内网或由反向代理提供 HTTPS；默认 compose 暴露 HTTP，仅适合内网/本机。
- 操作系统、Docker、Python 运行时由运维方及时打补丁。
- 单实例运行；不支持多副本共享 SQLite。

**不在范围**

- 多租户隔离、SSO/LDAP、硬件密钥、WAF、DDoS 防护、端到端加密、字段级加密。
- 供应链攻击的完整防御（仅做依赖锁定与审计建议）。

## 2. 威胁模型（STRIDE 简表）

| 威胁 | 示例 | 缓解 |
|---|---|---|
| Spoofing 伪造身份 | 窃取 Cookie、撞库 | HttpOnly+SameSite Cookie、PBKDF2、登录限流、通用错误文案 |
| Tampering 篡改 | 改单据/库存 | 后端校验、状态机、事务、审计、确认后不可变 |
| Repudiation 抵赖 | 否认确认入库 | 审计日志记录用户、动作、对象、IP、时间 |
| Information Disclosure 泄露 | 越权读单据、错误堆栈 | RBAC、404 不泄露存在性、统一错误、生产关闭 docs |
| Denial of Service 拒绝服务 | 登录爆破、超大请求 | 限流、1MB 请求体限制、分页上限、SQLite busy_timeout |
| Elevation of Privilege 提权 | 普通用户改角色 | 用户管理仅 ADMIN；角色从数据库读取；禁止批量赋值 |

## 3. 认证

### 3.1 密码存储

- 算法：PBKDF2-HMAC-SHA256，迭代 600,000，16 字节随机盐，32 字节派生密钥。
- 存储格式：`pbkdf2_sha256$600000$<salt_hex>$<hash_hex>`。
- 校验使用 `hmac.compare_digest`，防时序攻击。
- 密码策略：8–64 位，至少 1 个字母 + 1 个数字；允许特殊字符；不强制定期更换（NIST 建议）；禁止与用户名相同。
- 不记录明文密码；日志、审计、错误信息均不含密码。
- 修改密码需验证旧密码；成功后 `token_version += 1`，清除 Cookie，旧令牌立即失效。

### 3.2 会话令牌

- JWT：HS256；claims：`sub`（user id）、`role`、`ver`（token_version）、`iat`、`exp`、`jti`。
- 有效期 8 小时；不提供 refresh token；过期后重新登录。
- 密钥：优先 `SECRET_KEY` 环境变量（≥32 字节随机）；未设置时生成 `data/secret.key`（`0600`）并复用。
- 令牌只存 HttpOnly Cookie，不出现在响应体、localStorage、URL。
- 每次请求查库确认用户存在、`is_active`、`token_version` 匹配、角色以数据库为准。
- 登出清除 Cookie 并将 `token_version += 1`，该用户所有旧令牌立即失效（含其他设备）；不做逐会话黑名单。

### 3.3 Cookie 属性

```text
lager_session=<jwt>; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800
```

- `Secure`：`COOKIE_SECURE=true` 时添加；生产 HTTPS 必须开启。
- `Domain`：不设置，保持 host-only。
- 不使用 URL 重写传令牌。

### 3.4 登录防爆破

- 进程内滑动窗口：同一 `IP + username` 15 分钟内失败 5 次 → 429，锁定 15 分钟。
- 成功登录清除该键计数。
- 未知用户名也执行一次 dummy PBKDF2 校验，降低用户名枚举的时序差异。
- 统一错误文案：「用户名或密码错误」，不区分用户是否存在/停用。
- 反向代理层建议再加 IP 级限流（文档给出 Nginx 示例）。

## 4. 授权（RBAC）

### 4.1 角色权限矩阵

| 能力 | ADMIN | MANAGER | OPERATOR | VIEWER |
|---|:--:|:--:|:--:|:--:|
| 登录/改密/查看自己 | ✓ | ✓ | ✓ | ✓ |
| 工作台 | ✓ | ✓ | ✓ | ✓ |
| 商品/仓库/供应商/客户 查看 | ✓ | ✓ | ✓ | ✓ |
| 商品/仓库/供应商/客户 新建/编辑/停用 | ✓ | ✓ | — | — |
| 库存余额/流水 查看 | ✓ | ✓ | ✓ | ✓ |
| 商品清空库存/删除含库存商品 | ✓ | ✓ | — | — |
| 入库/出库/调拨/盘点 查看 | ✓ | ✓ | ✓ | ✓ |
| 单据 新建/编辑/删除草稿 | ✓ | ✓ | ✓ | — |
| 单据 确认/取消/完成盘点 | ✓ | ✓ | ✓ | — |
| 报表查看/导出 | ✓ | ✓ | ✓ | ✓ |
| 审计日志 | ✓ | ✓ | — | — |
| 用户管理 | ✓ | — | — | — |

### 4.2 强制规则

- 每个写路由显式声明 `require_roles(...)`；默认拒绝。
- 前端隐藏无权菜单只是体验优化，后端必须再次校验。
- 对象级授权：v1 无多租户，所有登录用户共享数据；越权主要是角色越权。单据编辑还需状态校验（仅 DRAFT）。
- 防止 IDOR：所有按 id 的操作先查对象，再校验状态/角色；不存在返回 404。
- 角色变更立即生效（每次请求读库），无需重新登录。
- 最后一个启用 ADMIN 不可停用/降级；用户不能停用自己。

## 5. 输入与输出安全

### 5.1 注入

- 全部使用 SQLAlchemy 参数化查询/ORM；禁止字符串拼接 SQL。
- 报表原生 SQL 若使用，必须 `text()` + 绑定参数，字段名来自白名单。
- 排序字段白名单：`created_at`、`order_no`、`quantity`、`updated_at`；方向仅 `asc/desc`。
- 路径参数用 FastAPI 类型校验（int），非法返回 422/400。

### 5.2 XSS

- React 默认转义；禁止 `dangerouslySetInnerHTML`。
- 用户输入（备注、名称）不以 HTML 渲染；审计 `detail` 以 `<pre>` 文本展示。
- CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`。
- 不使用第三方 CDN 脚本/字体；依赖本地打包。
- `X-Content-Type-Options: nosniff` 防止 MIME 嗅探。

### 5.3 CSRF

- Cookie `SameSite=Lax`：跨站 POST 不带 Cookie。
- 所有写接口仅接受 `application/json`，简单表单跨站提交无法伪造 JSON Content-Type（仍可能通过 CORS 预检被阻止）。
- 生产同源部署，不开放 CORS；开发环境仅允许 `http://localhost:5173`、`http://127.0.0.1:5173`。
- 不使用 GET 执行写操作。
- 残余风险：若浏览器不支持 SameSite 或存在同站子域 XSS，仍可能 CSRF；通过 HTTPS、子域隔离、CSP 降低。

### 5.4 点击劫持与传输

- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`。
- `Referrer-Policy: same-origin`。
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`。
- `Cross-Origin-Opener-Policy: same-origin`。
- HTTPS 部署时启用 HSTS（`max-age=31536000; includeSubDomains`），HTTP 内网不启用以免锁死。
- 静态资源与 API 同源，无第三方请求。

### 5.5 文件与导出

- 唯一文件上传入口是 `/api/v1/ai/analyze` 的购买截图：仅内存读取，不落盘；校验魔数（PNG/JPEG/WebP/GIF）与大小，文件名不参与路径。
- 其他接口不接收文件上传；无路径穿越风险。
- CSV 导出防公式注入：以 `= + - @ \t \r` 开头的单元格前加 `'`；字段含逗号/引号/换行时按 RFC 4180 转义。
- 导出上限 50,000 行；文件名固定，不含用户输入。
- `Content-Disposition: attachment`；`Content-Type: text/csv; charset=utf-8`。

### 5.6 请求大小与超时

- 请求体上限 1 MB（中间件检查 `Content-Length`，缺失时读取上限）。
- 例外：`/api/v1/ai/analyze` 上限 6 MB，用于一张压缩后的购买截图；其他 AI 接口仍 1 MB。
- 字符串长度按数据模型限制；明细最多 200 行；AI 预览最多 50 行；分页最大 100。
- 数据库 `busy_timeout=10000`；普通请求前端 20s，AI 分析前端 120s；反向代理建议 180s 仅对 AI 路径。
- 登录接口单独限流；不做全站复杂限流（单机场景）。

### 5.7 AI 来源与 SSRF

- 链接只允许 `http://` / `https://`；拒绝 `userinfo`、`localhost`、`.local` 和裸 IP 内网。
- 先解析 DNS，再逐个地址拒绝 private / loopback / link-local / multicast / reserved / unspecified / IPv4-mapped IPv6。
- 自定义重定向处理器对每一跳重新校验，防止 DNS rebinding/开放重定向绕过。
- 限制 8s 超时、HTML 1.5 MB、正文 12k 字符、图片 4 MB；不执行 JavaScript。
- 抓取内容作为“数据”包裹，系统提示明确忽略其中的指令；模型输出只按 JSON 解析。
- Ollama 地址与 `/ai/ollama/models` 仅 ADMIN 可用；仅允许 http/https、拒绝带 userinfo 的地址，返回模型名/大小/时间/参数，不返回宿主文件或环境。Ollama 通常位于内网，因此这里不做“禁私网”校验，但只有管理员能改地址。

## 6. 业务安全与一致性

1. **状态机**：仅 DRAFT 可编辑/删除/确认；确认后不可变；重复确认 409。
2. **库存非负**：条件更新 `WHERE quantity >= :q`；任一失败整单回滚。
3. **幂等**：确认前条件更新状态 `WHERE status='DRAFT'`，rowcount=0 → 409。
4. **事务边界**：单据确认、库存余额、流水、审计同一事务提交。
5. **成本不可为负**：`avg_cost >= 0`；数量/单价量化到 4 位。
6. **盘点完整性**：完成前所有行必须录入实盘数；差异按当前平均成本入账。
7. **审计不可变**：应用层不提供更新/删除审计接口；数据库账号仅有应用权限。
8. **越权修改**：所有更新使用服务端加载的对象，禁止客户端传 `created_by/status/confirmed_at` 等敏感字段（Pydantic 白名单）。
9. **AI 不直接写库**：`/ai/analyze` 只返回预览；`/ai/import` 重新校验行、仓库、供应商和商品，复用入库服务和库存服务。
10. **AI 令牌一次性**：只存 SHA-256；30 分钟 TTL；`PREVIEW→IMPORTED` 状态机；重复/过期/他人令牌均拒绝。
11. **AI 密钥**：Fernet 加密存储；GET 只回掩码；日志、错误、审计 detail 不记录明文。
12. **自动确认失败补偿**：若草稿已创建但 `confirm_order` 失败，删除草稿并把 `AiRun` 置 `FAILED`，不留下半成品。

## 7. 审计

记录以下动作：登录成功/失败、登出、改密、用户创建/修改/重置密码/停用、主数据创建/修改/停用、库存调整、单据创建/修改/删除/确认/取消、盘点完成、AI 设置修改、AI 分析、AI 导入。

字段：用户 id + 用户名快照、动作、对象类型/id/单号、摘要、IP、时间、可选 detail JSON。  
脱敏：不记录密码、令牌、Cookie；detail 中手机号/邮箱可按需脱敏（v1 记录业务摘要即可）。  
保留：永久；仅 ADMIN/MANAGER 可查；无删除接口。  
审计写入与业务同事务；写审计失败则业务失败（保证可追溯）。

## 8. 日志与错误

- 应用日志：时间、级别、request_id、方法、路径、状态码、耗时、user_id；**不记录请求体、密码、Cookie、Authorization**。
- 错误响应不含堆栈、SQL、文件路径；生产 `DEBUG=false`。
- 500 返回 request_id，便于对照日志。
- 登录失败记录审计（用户名可不存在时记录输入名，注意不要记录密码）。
- 日志轮转由 Docker `json-file` 的 `max-size/max-file` 控制（10m × 3）。

## 9. 依赖与供应链

- 后端依赖固定版本（`requirements.txt` 使用 `==`）；前端 `pnpm-lock.yaml` 锁定。
- 仅使用维护活跃的库；避免引入不必要的依赖。
- 建议 CI 执行 `pip-audit`、`pnpm audit`；v1 文档提供命令，不强制阻塞构建。
- Docker 基础镜像固定 minor 版本（如 `python:3.11-slim-bookworm`），定期重建获取补丁。
- 不在镜像中放置 `.env`、密钥、数据库文件；`.dockerignore` 排除。

## 10. 容器与主机加固

- 多阶段构建；运行阶段不含 Node、构建缓存、测试依赖。
- 非 root 用户 `lager`（UID 10001）；文件属主只读。
- `read_only: true`；仅数据卷 `/app/data` 与 `tmpfs /tmp` 可写。
- `security_opt: no-new-privileges:true`；`cap_drop: ALL`。
- 只暴露 8000（或由反向代理映射 80/443）；不暴露数据库端口（SQLite 无端口）。
- 数据卷权限 0700；备份文件加密/受限访问。
- 主机防火墙仅放行必要端口；SSH 密钥登录。
- 健康检查使用 `/api/v1/system/health`。

## 11. 密钥与配置

| 配置 | 说明 | 默认 |
|---|---|---|
| `SECRET_KEY` | JWT 签名密钥，≥32 字节 | 未设置时生成 `data/secret.key` |
| `ADMIN_INITIAL_PASSWORD` | 首次种子管理员密码 | `Admin@12345` |
| `COOKIE_SECURE` | HTTPS 时设 true | `false` |
| `ENABLE_DOCS` | 是否暴露 Swagger | 开发 true，生产 false |
| `CORS_ORIGINS` | 开发跨域来源 | 空/本地 |
| `DATABASE_URL` | SQLite 路径 | `sqlite:///./data/lager.db` |
| `APP_TIMEZONE` | 报表日期时区 | `Asia/Shanghai` |
| `AI_MAX_REQUEST_BYTES` | AI 分析请求体上限 | 6 MB（内部固定） |
| DeepSeek API Key | 设置页写入，Fernet 加密 | 无；未配置时禁用分析 |

- `.env` 不入库；提供 `.env.example`。
- 首次部署后立即修改默认管理员密码；生产必须设置随机 `SECRET_KEY` 与强密码。
- 密钥轮换会使所有会话失效，需在低峰期执行。

## 12. 备份与恢复

- 备份：`sqlite3 data/lager.db ".backup '/backup/lager-$(date +%F).db'"`；或停止容器后复制。
- 频率：每日一次，保留 14 天；重要操作前手动备份。
- 恢复：停止服务 → 替换 `lager.db` → 启动 → 校验登录、库存数量、最近单据。
- 备份文件含业务数据，按敏感数据管理；建议加密存储、异机保存。
- 定期演练恢复；文档记录 RPO 24h、RTO 1h（单机场景）。

## 13. 安全测试清单（功能完成后执行）

- [ ] 未登录访问所有 API → 401；仅 health/login 公开。
- [ ] VIEWER 调用所有写接口 → 403。
- [ ] OPERATOR 调用主数据写、库存调整、用户管理 → 403。
- [ ] 普通用户访问 `/users` → 403。
- [ ] 修改他人 id / 不存在 id → 404，不泄露存在性。
- [ ] 重复确认单据 → 409，库存只变一次。
- [ ] 并发出库（两请求同时扣同一库存）→ 最多一单成功，库存不为负。
- [ ] 库存不足出库 → 409 `INSUFFICIENT_STOCK`，整单无变化。
- [ ] 登录失败 6 次 → 429；成功登录重置计数。
- [ ] 响应头包含 CSP、nosniff、DENY、Referrer-Policy。
- [ ] Cookie 含 HttpOnly、SameSite=Lax；HTTPS 下含 Secure。
- [ ] 密码哈希非明文；日志无密码/令牌。
- [ ] 搜索框输入 `<script>alert(1)</script>` → 原样文本，不执行。
- [ ] 搜索 `' OR 1=1 --` → 无异常、无全量泄露。
- [ ] CSV 中以 `=` 开头的商品名被转义。
- [ ] 停用最后一个 ADMIN、停用自己 → 409/400。
- [ ] 已确认单据编辑/删除 → 409。
- [ ] 请求体 >1MB → 413；AI 分析 >6MB → 413。
- [ ] AI 设置仅 ADMIN；VIEWER 调 analyze/import → 403。
- [ ] AI Key 保存后 GET 不回显；数据库为 Fernet 密文；日志无 Key。
- [ ] AI 预览 token 只存 SHA-256；重复/过期/他人 token → 409/404。
- [ ] 链接 `http://127.0.0.1`、`file://`、重定向到内网 → 400 `AI_PRIVATE_URL` / `AI_INVALID_URL`。
- [ ] 伪造/超大/非图片文件 → 400 `AI_IMAGE_INVALID` / `AI_IMAGE_TOO_LARGE`。
- [ ] 模型返回 HTML/Markdown/非 JSON → 不执行、不渲染，返回 `AI_BAD_RESPONSE`。
- [ ] 容器内 `id` 非 root；根文件系统只读；数据卷可写。

## 14. 事件响应

1. 发现异常：保留日志与数据库快照，不破坏现场。
2. 遏制：停止容器/断开网络；轮换 `SECRET_KEY` 使会话失效；重置相关用户密码。
3. 评估：查审计日志（登录、确认、调整）、应用日志、数据库变更。
4. 恢复：从可信备份恢复；验证库存与单据一致性。
5. 复盘：记录时间线、根因、改进项；更新本文档与测试清单。

## 15. 已知残余风险

| 风险 | 影响 | 接受理由/后续 |
|---|---|---|
| 默认 HTTP 部署 | 凭证可被嗅探 | 内网使用；公网必须 HTTPS + COOKIE_SECURE |
| 无逐会话黑名单 | 登出会使所有设备下线，无法只踢一个会话 | 单用户单会话为主；后续可加 jti 黑名单 |
| 单进程内存限流 | 重启清零；多副本不共享 | 单容器架构；反向代理可补充 |
| SQLite 单写者 | 高并发写锁等待 | 目标规模小；后续迁 PostgreSQL |
| 单管理员账号共享 | 审计无法定位到人 | 为每人创建账号；禁止共享 |
| 默认管理员密码 | 未改则被入侵 | 首次部署后立即修改；生产检查清单强制 |
| 依赖漏洞 | 供应链风险 | 锁版本 + 定期审计更新 |
| 模型幻觉/错误提取 | 数量或单价错误 | 强制人工预览；服务端重算合计；导入后审计；可关闭自动确认 |
| 提示词注入 | 模型被来源网页诱导 | 系统提示隔离数据；不执行模型指令；输出严格 JSON |
| 第三方模型数据出境 | 截图/链接内容发送到 DeepSeek | 设置页明确提示；敏感场景切换本地 Ollama |
| 链接抓取绕过 | SSRF | DNS 后校验 + 每跳重定向校验；仍建议容器出站防火墙白名单 |
