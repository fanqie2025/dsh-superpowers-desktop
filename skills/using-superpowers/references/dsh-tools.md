# DSH 工具映射（DeepSeek Harness 桌面端）

上游 superpowers 是围绕 Claude Code 的工具词汇写的。本文件把那些词汇逐个映射到本机
DeepSeek Harness 桌面端真正存在的工具上。**读到上游文本里出现 `Bash`/`Read`/`Write`/`Task`
之类的名字时，一律按本表翻译**，不要照着叫。

## 一、逐项映射

| 上游写法（Claude Code） | 本机工具 | 说明 |
|---|---|---|
| `Bash` | `pwsh` | PowerShell，不是 bash。语法、路径分隔、环境变量写法都不同 |
| `Read` | `read` | 文本按行号返回；图片用 `read_image` |
| `Write` | `write` | 覆盖式创建/整体替换 |
| `Edit` / `MultiEdit` | `edit` | 字面量替换；改前必须先读过该文件 |
| `Glob` | `glob` | 按路径模式找**文件** |
| `Grep` | `grep` | 按正则搜内容（ripgrep 语法） |
| `WebFetch` | `web_fetch` | 取单个 URL 并转文本 |
| `WebSearch` | `web_search` | 多查询合并检索 |
| `Task` / subagent | `subagent`、`subagent_fork` | 见第四节 |
| `TodoWrite` | `todo_write` | 一次性提交**完整**列表（是替换，不是追加） |
| `Skill` | `skill` | 按技能名加载，例如 `skill(name="brainstorming")` |
| `AskUserQuestion` | `ask_user_question` | 一次可带多个问题与选项 |
| `SlashCommand` | 无对应 | 本机没有斜杠命令层 |
| `NotebookEdit` | 无对应 | 用 `read` + `edit` 处理 .ipynb |
| `Bash(run_in_background)` | `pwsh` + `run_in_background` | 配合 `job_list` / `job_output` / `job_kill` |

本机**额外**有、上游没有的能力（该用就用）：

| 工具 | 用途 |
|---|---|
| `read_image` | 读 PNG/JPEG/WebP/GIF 并直接看图（截图排查、验证 UI） |
| `present` | 把文件声明为交付物，用户在界面上直接打开 |
| `workflow` | 用 JS 脚本编排**大规模**扇出（几十上百个独立单元），带 phase/并发 |
| `create_goal` / `update_goal` / `get_goal` | 跨自动续轮的长目标（多轮才可能完成的任务） |
| `schedule_create` 等 | 会话内定时提醒（cron / 间隔 / 每日 / 每周） |
| `apply_patch`（若存在） | 结构化补丁；不确定时优先用 `edit` |
| `hindsight_*` | 本仓库的长期记忆与知识页（检索/写入/纠错） |
| MCP 资源工具 | `list_mcp_resources` / `read_mcp_resource`（例如 obsidian） |

## 二、`pwsh` 的两个本机陷阱（必记）

1. **沙箱下起不来**：文件策略为 `workspace-write` 时，`pwsh` 调用可能返回
   `0xC0000142`（`STATUS_DLL_INIT_FAILED`）且**零 stdout**，换命令、换工作目录、走后台都一样。
   判据要分清：
   - 沙箱明确拒绝 → 打印 `[sandbox: file access denied under … mode]`，这是策略拒绝；
   - `0xC0000142` + 零输出 → 是**另一种**形态。
   遇到第二种**不要反复重试同一条命令**，改用 `read`/`write`/`edit`/`glob`/`grep`（不受影响）
   把能做的做完；确实需要执行程序时，请用户放行或切换策略。
2. **代理伪造响应**：本机设了 `http_proxy`/`HTTPS_PROXY` 时，访问 `127.0.0.1`、局域网 IP、
   `*.local` 可能拿到伪造的 `502 upstream connect failed`、401 或畸形响应，把"服务正常"误判成
   "服务故障"。探测本机端口用 `curl.exe --noproxy '*'`（或 `-NoProxy`）。

## 三、文件与沙箱

- 文件策略常见为 `workspace-write`：**只有当前会话工作区可写**。工作区之外的路径
  （`C:\Users\...\.dsh\profiles\...`、别的磁盘/知识库目录）会被拒绝，且拒绝是**策略性**的，
  换写法重试没有意义——要么请用户放行，要么把产物落到工作区内。
- Windows 下技能目录常是 junction/符号链接；`glob` 的 `**` **不跟随** junction，
  所以「glob 没列出」**不能**用来判断某个技能/文件不存在，要用 `read` 直接穿透读。
- 中文路径：命令行里给 `pdftotext` 之类的工具传中文路径可能报 I/O Error，必要时先复制到英文临时路径。

## 四、子智能体与编排

| 需求 | 用哪个 | 关键约束 |
|---|---|---|
| 一个自包含的子任务 | `subagent` | 子智能体**看不到**本会话；提示词必须自带背景、目标、约束、判据、交付物、回报格式 |
| 需要本会话上下文的子任务 | `subagent_fork` | 继承已完成轮次（不含当前进行中的那轮） |
| 追问 / 继续某个子智能体 | `send_message` | 空闲的会被唤醒，工作中的在下一步收到 |
| 停掉 | `interrupt_agent` | 立即返回，不等它停 |
| 看状态 | `list_agents` | 可看 children / descendants |
| 几十上百个独立单元的扇出 | `workflow` | 只有"真大规模"才值得写编排脚本；一两个委派用 `subagent` 即可 |

子智能体同样受沙箱与文件策略约束；**不要假设它们能跑 `pwsh`**，也不要假设它们记得你刚说过的话。

## 五、技能之间的协作

- 技能目录由宿主注入；用 `skill` 按名字加载（如 `skill(name="writing-plans")`）。
- 本机技能有两个来源：**skillshare 分发的本地技能**（真源 `D:\Tools\skillshare\skills`，
  分发到 7 个目标）与**本插件提供的 15 个 superpowers 技能**。
- 同名时**本地技能优先**：本插件的 rank 用的是官方 bundled 档（600），不会抢占用户/项目技能
  （它们通常是 100–500）。这是刻意的设计，见 `src/superpowers.js` 文件头。
- 写新技能时要落到 skillshare 真源再分发，不要只写进某个目标的 `skills/` 目录。

## 六、记忆与留痕

- 检索先用 `hindsight_search_knowledge_pages`，需要"为什么"再上 `hindsight_reflect`；
  凡是用到了记忆里的结论，回复里要显式标注来源。
- 发现记忆过时/错误时，用 `hindsight_ingest_document` 写一条
  `Correction: <主题>`（说明原说法、现在的真相、证据），别只是无视。
- 本工作区的硬规则记在 `.workbuddy/memory/MEMORY.md`（跨会话成立）与 `.workbuddy/memory/YYYY-MM-DD.md`
  （流水）；动手前值得先看一眼。
