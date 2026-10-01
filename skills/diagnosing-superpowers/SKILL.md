---
name: diagnosing-superpowers
description: 诊断 dsh-superpowers-desktop 这类技能包插件「自己为什么没生效」：技能完全没出现、出现了但加载失败、被同名技能顶掉、只出现一部分、插件挂载即报错。按登记层→挂载层→发现层→裁决层逐层取证，用 profile 的 package.json（dsh.profile.bundles）、cordis.patch.yml、.plugin-manager/logs/*/pnpm.log 与 node scripts/verify.mjs 下结论，结论必须挂文件路径:行号或日志原文。触发词：技能没出现、技能没加载、技能被顶掉、superpowers 技能不见了、插件装了没反应、frontmatter 报错、skill 不生效、rank 冲突、provider 重名、profile bundles、include exclude 过滤。
whenToUse: 技能包插件装上了却看不到技能、看不到全部技能、或挂载报错时。
---

# 诊断技能包不生效（diagnosing-superpowers）

本技能只管一类问题：技能包/插件**自己没生效**——装了看不到技能、只看到一部分、看到的不是本包那份、挂载就报错。本机最常见的误判是拿「可能是缓存问题」「重启一下试试」收场，而真因往往就写在一个 JSON 数组或一行日志里。

## 何时用 / 何时不用

**用**：`dsh-superpowers-desktop`（或其它 `ctx.skills.registerProvider` 型插件）装完、重启后技能目录里没有预期技能、只有一部分、同名技能不是本包的、或挂载阶段报错。

**不用**：技能能加载但正文不合意 → `writing-skills`；技能描述的路由/触发问题 → `skill-creator`；与技能无关的报错 → `systematic-debugging`；沙箱拒绝写文件 → `diagnose-windows-sandbox-acl`。

## 核心原则

1. **四层逐层证伪，不跳层**：登记层（装上了吗）→ 挂载层（provider 注册了吗）→ 发现层（`SKILL.md` 被认了吗）→ 裁决层（认了却被同名顶掉了吗）。哪层坐实，根因锁哪层。
2. **证据硬性**：每条结论挂 `文件路径:行号` 或日志原文。本包没有文件监视，改完必须重启宿主——但那是**已知机制**，只有在登记层已被证明就绪时才能拿它当解释。
3. **用文件工具取证**：本机 `pwsh` 在 `workspace-write` 下可能返回 `0xC0000142` 且零 stdout，这是环境形态而不是命令写错，别反复换写法；改用 `read`/`grep`/`glob` 推进。
4. **只报告，不越界**：profile 在会话工作区之外，安装与改配置属于用户动作。

| 层 | 要证伪什么 | 本机证据 |
|---|---|---|
| 登记 | 包装进 profile 了吗 | profile 的 `package.json`（`dependencies`、`dsh.profile.bundles`）、`.plugin-manager/logs/*/pnpm.log` |
| 挂载 | provider 注册了吗、`apply` 抛了吗 | 宿主日志 `[superpowers-desktop] 注册技能提供方 "…"（rank N，目录 …）`（`src/superpowers.js:441`） |
| 发现 | 这份 `SKILL.md` 被认了吗 | `src/superpowers.js:262-353` 的每个跳过条件；`node scripts/verify.mjs` |
| 裁决 | 被同名别家顶掉了吗 | 默认 rank 600（`src/superpowers.js:72`）、provider 名（`:248`） |

## 流程

1. **固定症状**：一句话写清期望与实际看到的技能名、缺的是全部还是一部分、有无报错，并确认是哪个 profile（本机桌面端 `C:\Users\Administrator\.dsh\profiles\desktop`）。用 `todo_write` 给下面各步建待办。
2. **跑结构校验**：在包目录执行 `node scripts/verify.mjs`（`--quiet` 只看失败项，`--dsh-version` 换目标版本）。它复用运行时那份 frontmatter 解析器，**报 FAIL 的项就是挂载不了的静态原因**；跑不动（零输出）就按它的清单用 `read`/`grep` 静态取证，并说明这是环境原因而非通过。
3. **按下面五张表逐层定位**，每命中一行就记下证据行号。
4. **下结论**：写明命中哪一层、证据是什么、修复只落在这一层，并标注该动作需用户执行还是你已执行。
5. **复现验证**：重启后在新会话列出技能，确认预期技能名出现（有 `include` 就核对子集是否恰好一致）。

### (a) 技能完全没出现

| 症状 | 检查 | 结论 |
|---|---|---|
| 预期技能一个都没有 | `read` profile 的 `package.json`：包名在 `dependencies` 与 `dsh.profile.bundles` 里吗（本机实测键名是 `dsh.profile.bundles`；profile 的 `cordis.yml:1-3` 写明树的组成顺序是 bundles → `cordis.patch.yml` → `--patch`） | 不在 = **没装上或装完被回滚**，与"技能写错"无关，去装 |
| 登记项在，却仍不出现 | `grep` profile 的 `cordis.patch.yml`，看有没有 `id: superpowers-desktop` 的 `disabled: true` | 有 = 被显式关掉；没有则进挂载层取证 |
| 登记项在、宿主装完没重启 | 当前会话技能目录里没有这 15 个 | 本包无文件监视与热重载，**必须重启宿主**才重新发现；只有这时"重启"才是解释 |
| 安装命令非 0 退出，或"装了没反应" | `read`/`grep` profile 的 `.plugin-manager/logs/*/pnpm.log`，找 `installation rejected`、`restored package.json, pnpm-lock.yaml, and node_modules` | 命中 = **版本闸门拒绝并已回滚**（本机实测原文见 `operation-oIJiVv/pnpm.log:23,25`），profile 里根本没留下这个包。放行用 `dsh plugin allow-version` 或插件管理器；本包 peer 区间 `>=0.1.0-rc.1 <0.3.0-0` 覆盖 0.2.0-rc.2，正常不需要豁免 |
| 想确认是不是"装了一半" | `pnpm.log` 是 0 行（本机 `operation-V95AhW`、`operation-JxEcMU` 即为空） | 空日志 = 这次操作没跑到 pnpm（常见于宿主没退干净、`node_modules` 被锁），**不能当成装成功** |

### (b) 出现了但加载失败 / 名字不对

| 症状 | 检查 | 结论 |
|---|---|---|
| 期望的名字不在，却多出一个没见过的名字 | `grep` 该目录 `SKILL.md` 的 `^name:`，对照目录名 | `name` 与目录名不一致**只是 warning、不跳过**（`src/superpowers.js:325-327`），技能以 frontmatter 的名注册；`verify.mjs` 判 FAIL。改 `name` 或改目录名，两边一起核对 |
| 该技能彻底不出现 | `grep` `^name:` 与 `^description:` | 二者缺一即跳过（`:313-316`） |
| name/description 都在，仍不出现 | 核对 `name` 是否 kebab-case（`:78`）、`description` 是否超 1024 字符（`:321-324`） | 不合法 = 跳过，宿主日志里有对应 warn |
| 首行不是 `---`，或缺收尾 `---` | `read` 文件头几行 | `parseFrontmatter` 返回 undefined → 跳过（`:306-309`、`:162-171`）。**注意**：UTF-8 BOM 会被自动剥掉（`:158`），单独"带 BOM"不构成失败；致命的是首个非空行不是 `---` 或缺闭合行——别把 BOM 当结论 |
| 明明写了 name/description 却说缺失 | 看它们是否**缩进**在别的键下 | 行首有空白的行一律跳过（`:177`），缩进等于没写 |
| 两个目录同名 | `grep` 各目录的 `^name:` | 第二个被跳过（`:328-331`），表现为"改了 A 目录没反应"——生效的是先被读到的那份 |

### (c) 技能被别家顶掉（同名裁决）

| 症状 | 检查 | 结论 |
|---|---|---|
| 技能名在，但内容/描述不是本包的 | 用 `glob` 的 `**` 或 basename 模式找同名 `SKILL.md` 并 `grep` 其 `^name:`；再对照本包 rank（`apply` 日志或 profile 里 `- id: superpowers-desktop` 的 `config.rank`，默认 600） | 同层同名时 **rank 小者胜，再比 provider 注册顺序**；filesystem 本地根通常 100–500，**本地赢是刻意设计**（`src/superpowers.js:22-25`）。要本包赢只能由用户显式调小 `config.rank`，风险自负 |
| 想"让插件技能更生效" | — | **不要**改默认 rank 抢位：那会静默遮蔽用户自己的同名技能，且没有 API 能查回被遮蔽的定义 |
| 想直接看是谁提供的 | — | 会话里的技能目录只有名字与描述，不含 provider/rank，别靠肉眼；证据只能是文件（同名 `SKILL.md` 在哪）与配置（rank、providerName） |

### (d) 只出现一部分技能

| 症状 | 检查 | 结论 |
|---|---|---|
| 缺的恰好是一组 | `grep` profile 的 `cordis.patch.yml` 里 `id: superpowers-desktop` 下的 `include`/`exclude` | 被配置过滤（`:332-333`）：`include` 只暴露列出的，`exclude` 屏蔽列出的 |
| 缺零散几个 | 对每个缺失目录 `read` 它的 `SKILL.md` | 目录里没有 `SKILL.md`（或它不是普通文件）即跳过（`:291-297`）。本机 `glob` 模式**中间**的单个 `*` 不生效、`**` 不跟随 junction，所以"glob 没列出"不能证明文件不存在，要用 `read` 穿透确认 |
| 整个插件的技能都看不到 | 宿主日志 `技能目录不存在：<路径>`（`:271-273`） | `skillDir` 指错：相对路径按**包根**解析（`:103-106`），不是按 config 文件所在目录 |
| 某个目录被无视 | 看目录名是否以 `.` 开头 | 点开头目录直接跳过（`:284`） |

### (e) 插件挂载就报错

| 症状 | 检查 | 结论 |
|---|---|---|
| 挂载失败、provider 名非法 | `grep` profile 的 `cordis.patch.yml` 里该行的 `providerName` | 配成 `runtime` 会抛错——它是保留名（`:75`、`:99-101`），`apply` 阶段直接抛；删掉该项即可 |
| 与已装的第三方同名插件互相干扰 | `read` profile 的 `package.json` 与 `cordis.patch.yml`，列出所有行 id 与各自 `providerName` | 注册表**按 provider 名去重**（`:248`）。第三方 `@wenaixi/dsh-superpower` 的行 id/provider 名是 `superpowers`，本包是 `superpowers-desktop`，名牌不撞；把 `providerName` 手工改成一样才会互相顶 |
| 插件压根没被加载 | — | 本插件 `inject = ['skills']`（`:57`）：宿主没有 skills 服务时它不该被加载，这是设计不是故障 |

## 反模式

| 想法 | 现实 |
|---|---|
| 「技能没出来，先重启试试」 | 先看 `dsh.profile.bundles`；没登记，重启一万次也没有 |
| 「可能是缓存问题」 | 本包没有可指的缓存层。要么文件，要么配置，给路径行号 |
| 「`verify.mjs` 过了，所以是好的」 | 它只查包内结构与技能文件；查不到 profile 是否登记、是否被 rank 顶掉、宿主是否重启过 |
| 「本地技能把插件顶了，把 rank 改成 10」 | 那是静默遮蔽用户自己的技能，必须由用户显式决定 |
| 「`pwsh` 没输出，换个写法再跑」 | `0xC0000142` 零 stdout 是环境形态，换写法无用；改用文件工具 |

## 完成判据

逐条给证据，缺一条不许说"修好了"：

1. 一句话结论 + 明确命中的是**哪一层**（登记/挂载/发现/裁决）。
2. 每条结论挂 `文件路径:行号` 或日志原文（`grep` 的匹配行、`pnpm.log` 那几行）。
3. `node scripts/verify.mjs` 的原始输出（通过/失败项数）已附；若因 `0xC0000142` 跑不动，写明是环境原因并给出静态等价检查的逐条结果。
4. 修复动作只落在唯一一层，且标注"需用户执行"（profile 在工作区外）或"已执行"。
5. 复现验证：重启后新会话的技能列表里预期技能出现，并说明这份列表是从哪里看到的。
6. 未验证部分、残余风险，以及你**没能**取到的证据，写明拿不到。

## 与其它技能的关系

- 通用排障骨架（复现→根因→假设→修复）→ `systematic-debugging`；本技能是它在"技能包/插件不生效"上的专门化，冲突时四层顺序优先。
- 写或改技能正文 → `writing-skills`；描述路由与触发率 → `skill-creator`。
- 宣布完成前的证据检查 → `verification-before-completion`。
- 沙箱拒绝与 `0xC0000142` 的区分 → `diagnose-windows-sandbox-acl`。
- 上游本技能还包含会话转录取证、子智能体分析师分派、案例/报告模板、GitHub issue 与脱敏 bundle 流程（上游目录下的 `prompts/`、`references/`、`templates/`）；本版未移植这些附属文件，只保留"读盘取证 + 结论挂路径"的方法，把对象换成插件自身。

## 本机适配注意

- **profile**：桌面端 `C:\Users\Administrator\.dsh\profiles\desktop`，关键三处是 `package.json`（`dsh.profile.bundles` + `dependencies`）、`cordis.patch.yml`（行 id 级覆盖/disable/`insert`）、`.plugin-manager/logs/<operation>/pnpm.log`。它在工作区之外：**只读取证可以，写入必须由用户放行**。
- **组成顺序**（profile 的 `cordis.yml:1-3` 原文）：先 `package.json` 的 `dsh.profile.bundles` 里每个 bundle，再 `cordis.patch.yml`，再 `--patch` 覆盖层；按这个顺序找"谁把这一行关掉了"。
- **本包自带挂载点**：`package.json` 声明 `dsh.bundle.patch` → `./cordis.patch.yml`，其中 `- insert:` 一行 id `superpowers-desktop`、包名 `dsh-superpowers-desktop`。这一处名字、`package.json` 的 `name`、源码 `DEFAULT_PROVIDER` 必须一致，改名要三处同改。
- **入口**：校验用 `node scripts/verify.mjs`（或双击 `scripts/verify.cmd`，它用桌面端 runtime 的 node）；安装用 `scripts/install-desktop.cmd`（清空 `NODE_OPTIONS`、找 runtime CLI、装本地路径）。**必须先完全退出桌面端**，否则 profile 的 `node_modules` 被锁，安装会失败或半途回滚。
- **技能真源**：本机技能由 skillshare 管理，真源 `D:\Tools\skillshare\skills`，分发目标由用户执行；本插件的 15 个技能在包内 `skills/`，与真源是两回事，别改错地方。
