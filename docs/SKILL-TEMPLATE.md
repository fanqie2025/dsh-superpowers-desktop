# 技能移植契约（15 个技能的作者必读）

本文件是 `dsh-superpowers-desktop` 里每个 `skills/<name>/SKILL.md` 的写作规范。
上游是 [obra/superpowers](https://github.com/obra/superpowers)（MIT），本仓库做的是
**中文化 + DeepSeek Harness 工具适配**，不是逐字翻译。

## 一、文件与命名

- 路径：`skills/<skill-name>/SKILL.md`，`<skill-name>` 必须与上游同名（kebab-case）。
- 正文语言：**中文**。技能名、工具名、文件路径、代码标识符保持英文原样。
- 每个技能只写一个 `SKILL.md`。上游的 references/、scripts/、*.md 附属文件**不移植**，
  但在 `docs/UPSTREAM.md` 里登记为「已省略」，不要假装它们存在。

## 二、frontmatter（严格）

```markdown
---
name: <与目录同名的 kebab-case>
description: <中文一句话说明「做什么」+「什么时候用」+ 触发词，120–300 字，单行>
whenToUse: <可选，中文，一句触发时机>
---
```

- `description` 会直接进模型的技能目录消息，**是路由的唯一依据**：写清「做什么 / 何时用 /
  用户会怎么开口（触发词）」，不要写营销话术。
- 不要写 `license`、`version`、`tools`、`allowed-tools` 等本 harness 不消费的键。
- 需要「只能人工调用、不给模型自动触发」时加 `disable-model-invocation: true`；
  本批 15 个技能**都不要加**。

## 三、正文骨架（按需取舍，但顺序保持）

```markdown
# <中文标题>

<一段话：这个技能解决什么问题，为什么值得遵守。>

## 何时用 / 何时不用
## 核心原则
## 流程
## 反模式（会怎么错）
## 完成判据
## 与其它技能的关系
## 本机适配注意
```

- **流程**是主体：编号步骤，每步写清「做什么 → 用哪个工具 → 判据是什么」。
- **完成判据**必须可核验（跑什么、看什么输出、什么算过）。这正是上游的精髓，不许砍。
- **反模式**保留上游点名的典型失败（跳过设计直接写码、一次改多处、无证据宣布完成……）。
- 「与其它技能的关系」用技能名互指（例如 `brainstorming` → `writing-plans` →
  `subagent-driven-development`），让模型知道下一步该加载谁。

## 四、DeepSeek Harness 工具词汇（只能用这些名字）

文件：`read`、`write`、`edit`、`glob`、`grep`、`read_image`、`present`
执行：`pwsh`（PowerShell，**不是** Bash）
检索：`web_search`、`web_fetch`
编排：`todo_write`、`subagent`、`subagent_fork`、`send_message`、`workflow`、`list_agents`、
`interrupt_agent`、`job_list`、`job_output`、`job_kill`
其它：`skill`、`ask_user_question`、`create_goal`、`update_goal`、`get_goal`

**禁止**出现 Claude Code / 其它 harness 的工具名：`Bash`、`Read`、`Write`、`Edit`、`Task`、
`TodoWrite`、`AskUserQuestion`、`SlashCommand`、`Grep`、`Glob`、`NotebookEdit`。上游文本里的
这些名字要逐个替换成上表对应项；上游提到的 `Skill` 工具在本机叫 `skill`。

## 五、本机环境事实（写「本机适配注意」时用）

- 宿主是 **DeepSeek Harness 桌面端**（Electron），Windows，核心 `@deepseek-ai/dsh` 0.2.0-rc.2。
- 文件策略常为 `workspace-write`：**只有会话工作区可写**，工作区外的路径（例如
  `C:\Users\...\.dsh\profiles\...`、知识库磁盘）会被沙箱拒绝。
- 该策略下 `pwsh` 有已知故障：调用返回 `0xC0000142`、零 stdout。**判据**：沙箱明确拒绝会打印
  `[sandbox: file access denied ...]`；`0xC0000142` 是另一种形态。遇到它**不要反复重试同一条命令**，
  改用 `read`/`write`/`edit`/`glob`/`grep` 继续（它们不受影响），确需执行程序再请用户放行。
- 工作目录**通常不是 git 仓库**，也常常没有测试套件。所以涉及 worktree、分支、TDD 的技能要写成
  **条件式**：「若当前是 git 仓库 / 若有测试运行器……否则退化为……」，并明确退化后的等价判据。
- 技能真源与分发：本机用 skillshare 管理技能，真源 `D:\Tools\skillshare\skills`，分发到 7 个目标。
  这条是**写给技能正文的内容**（`writing-skills` 应当告诉执行者：新技能要落到真源再分发，
  不要只写进某个目标的 `skills/` 目录），**不是**给移植执笔人的动作指令——执笔人只写本仓库内
  那一个文件，不要往仓库外的任何路径写东西。
- 长命令示例给 PowerShell 语法；访问 `127.0.0.1`/局域网服务时注意本机 `http_proxy` 会伪造 502
  （需要 `curl.exe --noproxy '*'` 或 `-NoProxy`）。

## 六、长度与取舍

- 正文常规目标是 **3–8 KB**（约 1500–4000 汉字）。这只防臃肿，**不是硬指标**：
  技能正文是按需加载的（常驻上下文的只有 `description`），所以**判据与门禁优先于字数**。
- 必须先砍的：例子、重复论述、多 harness 安装说明、上游特有的脚本调用、示例对话、
  与上游仓库自身维护相关的内容。
- 不许砍：进入/退出条件、步骤顺序、每步判据、反模式、完成判据。
- 如果砍完仍然超出 8 KB，**保留内容并把实测长度如实写进回报**（不要为了对齐数字而删门禁）。
  已知超出者：`using-git-worktrees`、`finishing-a-development-branch`（见 `docs/UPSTREAM.md` 第六节）。
- 不要为了「看起来完整」而编造上游没有的流程；不确定的地方宁可写得更保守。

## 七、交付要求

- 只写 `skills/<name>/SKILL.md` 这一个文件，不要改本仓库其它文件。
- 不要运行 `pwsh`（可能不可用）；需要上游内容就用 `web_fetch` 取
  `https://raw.githubusercontent.com/obra/superpowers/main/skills/<name>/SKILL.md`，
  必要时再取同目录下的附属文件名（用 GitHub contents API 列目录）。
- 写完后回报：技能名、是否读到上游原文、保留了哪些门禁、砍掉了什么、正文字符数。
