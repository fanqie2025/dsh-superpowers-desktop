# 上游溯源与移植范围

## 一、上游与固定提交

| 项 | 值 |
|---|---|
| 上游仓库 | [obra/superpowers](https://github.com/obra/superpowers) |
| 许可 | MIT，Copyright © 2025 Jesse Vincent（全文见仓库根 `NOTICE`） |
| 固定提交 | `8ca22dba9a94f28898bbce59f2537ff4d87c747d`（`main`，抓取于 2026-10-01） |
| 上游技能数 | 15（与 `scripts/verify.mjs` 的 `EXPECTED_SKILLS` 一一对应） |

本仓库是**移植**，不是 fork：技能名与上游一致，正文重新用中文写并针对 DeepSeek Harness
的工具体系做了适配。上游的许可与署名随包保留（`NOTICE`）。

## 二、移植原则

1. **保留判据与门禁，重写表达。** 上游每条进入/退出条件、每步证据要求、每个完成判据、
   反模式清单都保留语义；重复论述、多 harness 安装说明、与上游仓库自身维护相关的内容删掉。
2. **工具词汇全部本地化。** 上游的 `Bash`/`Read`/`Write`/`Task`/`TodoWrite` 等一律映射为
   `pwsh`/`read`/`write`/`subagent`/`todo_write`；映射表与两个本机陷阱见
   `skills/using-superpowers/references/dsh-tools.md`。
3. **条件式而非硬假设。** 上游默认"有 git 仓库、有测试运行器、有 CI"；本版把这类前提写成
   条件分支，并明确**退化不等于豁免**——没有等价判据就不算完成。
4. **附属文件不移植，但要点内联或显式登记。** 本仓库每个技能只有一个 `SKILL.md`。
   上游同目录的 `references/`、`scripts/`、`prompts/`、`*.md` 附属文件不随包分发；
   其中影响执行的要点已并入正文，其余在下表登记为「已省略」。**不假装它们存在。**
5. **不编造。** 上游没有的流程不添加。本机特有的判据（沙箱、`pwsh` 故障、`http_proxy`、
   skillshare 真源）都集中在各技能的「本机适配注意」一节，与上游方法论分开。

## 三、逐技能移植范围

「已省略」列出的文件在上游该技能目录下存在，但**不在本包内**；正文若用到其要点，已在
对应技能的「本机适配注意」里标明。

| 技能 | 上游 `SKILL.md` | 已省略的上游同目录文件 |
|---|---|---|
| `brainstorming` | 有（约 17.5 KB） | `visual-companion.md`、`spec-document-reviewer-prompt.md`、`scripts/`（可视化伴随整节不移植，明确改为纯文本对话） |
| `diagnosing-superpowers` | 有（约 6.9 KB） | `prompts/`、`references/`、`templates/`（本版重写为面向本插件的故障排查手册） |
| `dispatching-parallel-agents` | 有（约 6.1 KB） | 无（上游该目录只有 `SKILL.md`） |
| `executing-plans` | 有（约 20.4 KB） | `scripts/`（`sdd-workspace`、`task-start`、`task-done`、`review-package` 等脚本调用改写为文件工具等价动作，判据不变） |
| `finishing-a-development-branch` | 有（约 7.8 KB） | 无 |
| `receiving-code-review` | 有（约 6.2 KB） | 无 |
| `requesting-code-review` | 有（约 3.0 KB） | `code-reviewer.md`（评审者提示词模板；要点已并入正文流程第 3 步） |
| `subagent-driven-development` | 有（约 32.6 KB） | `implementer-prompt.md`、`task-reviewer-prompt.md`、`re-review-prompt.md`、`scripts/`（提示词改写为「六要素」契约，脚本驱动的台账改为手工等价动作） |
| `systematic-debugging` | 有 | `root-cause-tracing.md`、`defense-in-depth.md`、`condition-based-waiting.md`(+`.ts`)、`find-polluter.sh`、`CREATION-LOG.md`、`test-academic.md`、`test-pressure-1~3.md`（共 11 个文件；其中三个要点已内联：回溯到源头再修、修完根因可在多层补校验、用条件轮询代替固定超时） |
| `test-driven-development` | 有（约 9.6 KB） | `writing-good-tests.md` |
| `using-git-worktrees` | 有（约 6.8 KB） | 无 |
| `using-superpowers` | 有（约 3.2 KB） | `references/*-tools.md`（8 份，claude-code / codex / gemini / pi / antigravity / hermes / muse 等；本仓库用 `references/dsh-tools.md` **替换**它们） |
| `verification-before-completion` | 有（约 3.6 KB） | 无 |
| `writing-plans` | 有（约 10.3 KB） | 无 |
| `writing-skills` | 有（约 26.6 KB） | `anthropic-best-practices.md`、`testing-skills-with-subagents.md`、`persuasion-principles.md`、`graphviz-conventions.dot`、`render-graphs.js`、`examples/CLAUDE_MD_TESTING.md` |

> 字节数取自 GitHub contents API（固定提交处的树）。`systematic-debugging` 的上游 `SKILL.md`
> 当时未单独记录大小，故留空——这不影响再同步，再同步应比对内容而不是大小。

## 四、与第三方移植版的关系

生态里另有一个同源移植 `@wenaixi/dsh-superpower`（GitHub: `Wenaixi/dsh-superpower`）。
两者是同一份上游的独立移植，各自合法。工程取舍差异见 `README.md` 的对照表，最关键的三条是：
零运行时依赖、`rank` 用官方 bundled 档（不抢本地同名技能）、无构建步骤。

同时安装两者不会撞行 id（本包 `superpowers-desktop` vs 其 `superpowers`），
但会有 15 个同名技能竞争——本包 rank 600，若对方仍是 rank 10，则**对方胜出**。

## 五、再同步流程

上游更新时按此流程推进（本仓库没有自动化 diff 工具，靠这份清单保证不漂移）：

1. **取新的固定提交**：`https://api.github.com/repos/obra/superpowers/commits/main`，
   记下 sha，替换本文档第一节的「固定提交」。
2. **逐技能取上游内容**：
   - 目录：`https://api.github.com/repos/obra/superpowers/contents/skills/<name>`
   - 正文：`https://raw.githubusercontent.com/obra/superpowers/main/skills/<name>/SKILL.md`
3. **按 `docs/SKILL-TEMPLATE.md` 重写/修订**对应技能的中文 `SKILL.md`。注意：
   - 只改需要改的段落，不要为了让 diff 好看而整篇重写；
   - 上游新增的附属文件要么内联要点，要么补进本文档第三节的「已省略」列表；
   - 上游删掉/改名的技能要同步 `scripts/verify.mjs` 的 `EXPECTED_SKILLS`。
4. **更新本文档第三节**的移植范围表。
5. **跑校验**：`node scripts/verify.mjs`（或 `scripts\verify.cmd`）。
6. **升版本号**并写 `CHANGELOG.md`：技能内容变更 → minor；仅文档/工具变更 → patch。

## 六、已知的移植折损（诚实清单）

- **附属文件的深度内容有损**：不移植附属文件是刻意的取舍，代价是上游在这些文件里展开的
  细节（例如 `writing-skills` 的 46 KB 最佳实践、`subagent-driven-development` 的三份完整
  提示词模板）在本包里只剩要点。需要原文时请回上游读。
- **可视化能力缺失**：上游 `brainstorming` 的浏览器可视化伴随（brainstorm server）未移植，
  本包用纯文本 + Markdown 草图替代。
- **正文长度是人工估算**：移植时本机 `pwsh` 不可用，各技能的字节数由字数估算，未经命令实测。
- **有两个技能超出常规长度**：`using-git-worktrees`（≈9.9 KB）与 `finishing-a-development-branch`
  （≈12–13 KB）超出 `docs/SKILL-TEMPLATE.md` 的 3–8 KB 常规目标约 30–60%。这是**刻意的取舍**：
  正文是按需加载的，常驻上下文的只有 `description`，因此保留上游全部门禁与判据优先于压字数。
  若将来需要瘦身，先砍例子与重复论述，不要删判据。
- **语言**：正文是中文改写，不是上游英文原文的逐句翻译；引用上游原句时以 `README.md`
  与本文档给出的固定提交为准。
