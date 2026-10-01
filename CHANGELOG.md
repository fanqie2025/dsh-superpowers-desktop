# 变更记录

## 1.0.0

首个版本。

- 新增 `src/superpowers.js`：DeepSeek Harness 原生 SkillProvider，**零运行时依赖**
  （只用 `node:` 内置模块），内联 frontmatter 解析（BOM / CRLF / 引号 / 嵌套跳过）。
- 默认 `rank` 取官方 `BUNDLED_SKILL_RANK`（600），同名技能本地优先；可用 `config.rank` 覆盖。
- 移植上游 `obra/superpowers`（固定提交 `8ca22dba9a94f28898bbce59f2537ff4d87c747d`）的全部 15 个技能，
  中文改写并适配 DSH 工具词汇：
  `using-superpowers`、`brainstorming`、`writing-plans`、`executing-plans`、
  `subagent-driven-development`、`dispatching-parallel-agents`、`test-driven-development`、
  `systematic-debugging`、`verification-before-completion`、`requesting-code-review`、
  `receiving-code-review`、`using-git-worktrees`、`finishing-a-development-branch`、
  `diagnosing-superpowers`、`writing-skills`。
- 新增 `skills/using-superpowers/references/dsh-tools.md`：上游工具词汇（Claude Code）到本机
  真实工具的映射表，以及本机两个已知陷阱（`pwsh` 的 `0xC0000142`、`http_proxy` 伪造 502）。
- 新增 `cordis.patch.yml`：随 `dsh.bundle` 自动挂载/卸载，行 id 与第三方包区分。
- 新增 `scripts/verify.mjs`：结构 + peer 区间兼容性校验（89 项），复用运行时的 frontmatter 解析器。
- 新增 `scripts/smoke.mjs`：桩宿主冒烟测试（19 项），真正执行 `apply()` → `list()` → `get()`，
  覆盖候选项字段、配置面（include/exclude/rank/skillDir/保留名）与卸载路径。
- 新增 `scripts/install-desktop.cmd`、`scripts/verify.cmd`：本机一键安装/校验（自动清空
  `NODE_OPTIONS`、自动找 runtime node；`.cmd` 由 `.gitattributes` 强制 CRLF）。
- 新增 `.gitattributes`：仓库内 LF，`*.cmd` 强制 CRLF（cmd.exe 处理 LF-only 批处理的 `goto`/标签不可靠）。
- 新增 `docs/SKILL-TEMPLATE.md`（移植契约）、`docs/UPSTREAM.md`（溯源与漂移说明）、
  `AGENTS.md`（仓库不变式）。
