# dsh-superpowers-desktop

[obra/superpowers](https://github.com/obra/superpowers) 的 **DeepSeek Harness 桌面端**移植：
15 个中文技能，以**零运行时依赖**的 SkillProvider 注入 `ctx.skills`，随 `dsh.bundle` 安装/卸载。

面向的宿主：DeepSeek Harness 桌面端（Electron），核心 `@deepseek-ai/dsh` **0.2.0-rc.2**，Windows。

---

## 与第三方移植版（`@wenaixi/dsh-superpower`）的差异

两者是同一份上游的独立移植，都合法（上游 MIT）。差别在工程取舍上，不是谁"更完整"：

| 维度 | 第三方版 | 本仓库 | 为什么 |
|---|---|---|---|
| 同名技能优先级 | `rank 10`，**本包技能永远赢** | `rank 600`（官方 bundled 档），**本地技能优先** | rank 10 会把用户/项目里的同名技能静默吃掉，且没有 API 能查回被遮蔽的定义 |
| 运行时依赖 | import `@deepseek-ai/dsh-skill`、`@deepseek-ai/schemastery`、`yaml` | **零依赖**，只用 `node:` 内置模块 | profile 的 `node_modules` 里没有 `@deepseek-ai/*`（它们由宿主 `app.asar` 提供），裸标识符能否解析取决于宿主是否做了外部化映射；不赌这一把 |
| frontmatter 解析 | 依赖 `yaml` 包 | 内联极小子集解析器（BOM / CRLF / 引号 / 嵌套跳过） | 需要解析的就是几个顶层标量 |
| 构建 | TypeScript 源码 + 提交 `lib/` | 纯 ESM，`main` 直指 `src/superpowers.js`，**无构建步骤** | 没有编译步骤，就没有"忘了编译""lib 与 src 漂移"这两类故障 |
| 行 id / Provider 名 | `superpowers` | `superpowers-desktop` | 两者可同时安装而不撞 id |
| 技能名 | 上游原名（v7 起去掉前缀） | 上游原名 | 同上，且本包不抢位，重名时用户赢 |
| 正文 | 中文 | 中文 | 本机工作语言 |

> 本仓库**不声称**比第三方版功能更多。15 个技能一一对应，额外做的是：把工具词汇换成 DSH 真实的
> 工具名（见 `skills/using-superpowers/references/dsh-tools.md`）、把条件式流程写实（本工作区常常
> 不是 git 仓库、没有测试套件）、以及一份可跑的 `scripts/verify.mjs`。

## 包含的技能

| 技能 | 何时用 |
|---|---|
| `using-superpowers` | 会话起点；判断该加载哪个技能（1% 原则） |
| `brainstorming` | 新功能/新方案动手前，把设计问清楚并分级 |
| `writing-plans` | 设计获批后，切成一项一个可校验结果的任务 |
| `executing-plans` | 按计划内联执行，末尾一次终审 |
| `subagent-driven-development` | 按计划逐任务派子智能体 + 两阶段评审 |
| `dispatching-parallel-agents` | 多个互不依赖的子任务并行派发 |
| `test-driven-development` | 先失败测试/等价验证，再实现，再重构 |
| `systematic-debugging` | 缺陷与环境故障的系统化定位 |
| `verification-before-completion` | 宣布"完成"之前的证据检查 |
| `requesting-code-review` | 请求评审时怎么组织材料 |
| `receiving-code-review` | 收到评审意见时怎么处理（不辩解、先核实） |
| `using-git-worktrees` | 需要隔离工作区时的 git worktree 用法 |
| `finishing-a-development-branch` | 分支收尾：验证、清理、合并 |
| `diagnosing-superpowers` | 技能本身不生效/行为异常时的自我诊断 |
| `writing-skills` | 写新技能的方法论 |

## 安装（本机 desktop profile）

前置：本机 dsh 是**桌面端**，profile 目录 `C:\Users\Administrator\.dsh\profiles\desktop`，
装插件必须走桌面端 runtime 的 CLI。

```powershell
# 1) 先退出 DeepSeek Harness 桌面端（它会锁住 profile 的 node_modules）
# 2) 清空宿主注入的 NODE_OPTIONS（那个 shim 会让 dsh 假启动失败），再装本地路径：
$env:NODE_OPTIONS=''
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "G:\家庭网络\DeepSeek Harness\dsh-superpowers"
# 3) 重新打开桌面端，技能才会注册生效
```

也可以直接在桌面端的插件管理器对话框里填本地绝对路径。

已经在 npm / GitHub 上的话，把最后一段换成包名或 `github:` 地址即可：

```powershell
dsh plugin --profile desktop add dsh-superpowers-desktop
dsh plugin --profile desktop add github:<你>/dsh-superpowers-desktop
```

**要求**：`@deepseek-ai/dsh-skill` 区间 `>=0.1.0-rc.1 <0.3.0-0`。桌面端核心 0.2.0-rc.2 落在区间内，
不需要 `dsh plugin allow-version` 豁免。

## 验证

```powershell
node scripts/verify.mjs                                   # 默认按 dsh 0.2.0-rc.2 校验
node scripts/verify.mjs --dsh-version 0.2.1-rc.1          # 换目标版本再校验
```

它检查：`package.json` 与 `dsh.bundle.patch` 契约、bundle patch 文件内容、**运行时源码零第三方
依赖**（扫 import 裸标识符）、peer 区间是否覆盖目标 dsh 版本、15 个技能是否齐全、每个
`SKILL.md` 的 frontmatter 能否解析且 `name` 与目录一致、正文是否为空壳。

校验器和运行时**共用同一份 frontmatter 解析器**（`src/superpowers.js` 导出），不会出现
"校验通过、运行时不认"。

## 配置

在 profile 的 `cordis.patch.yml` 里按行 id 覆盖：

```yaml
- id: superpowers-desktop
  config:
    rank: 600            # 越小优先级越高；600 = 官方 bundled 档，不抢本地技能
    providerName: superpowers-desktop
    # skillDir: 绝对或相对本包路径，默认包内 skills/
    # include: [brainstorming, writing-plans]   # 只暴露这些
    # exclude: [using-git-worktrees]            # 屏蔽这些
- id: superpowers-desktop
  disabled: true         # 或整个关掉
```

## 卸载

```powershell
$env:NODE_OPTIONS=''
& "D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove dsh-superpowers-desktop
```

随 `dsh.bundle` 一起登记/撤销，不会在用户目录留残留。

## 目录结构

```
src/superpowers.js                  # 插件本体：SkillProvider + 极简 frontmatter 解析（零依赖）
skills/<name>/SKILL.md              # 15 个技能
skills/using-superpowers/references/dsh-tools.md   # 工具映射层（DSH ↔ 上游词汇）
cordis.patch.yml                    # 挂载行
scripts/verify.mjs                  # 结构 + 兼容性校验（89 项检查）
scripts/install-desktop.cmd         # 本机一键安装（自动清空 NODE_OPTIONS、检查宿主未运行）
scripts/verify.cmd                  # 一键校验（自动找 node）
docs/SKILL-TEMPLATE.md              # 技能写作规范（再同步时照它改）
docs/UPSTREAM.md                    # 上游固定提交、逐技能移植范围与漂移说明
AGENTS.md                           # 仓库不变式（给未来的维护者/智能体）
CHANGELOG.md                        # 变更记录
NOTICE                              # 上游 MIT 声明与署名
```

## 已知限制

- **没有文件监视**：改完 `skills/` 下的内容需要重启宿主（或触发一次注册表失效）才会重新发现；
  上游那种热重载不在本包范围内。
- **description 是唯一路由依据**：技能是否被加载取决于它写得够不够准；本包不提供 eval 工具，
  改完描述请用真实提问试一次。
- **上游附属文件未移植**：`references/`、`scripts/`、`prompts/` 等按 `docs/UPSTREAM.md` 的登记省略。
  上游若在某技能里引用这些文件，本版已把关键内容并入正文或改写为可执行步骤。
- **工具适配基于本机现状**：`pwsh` 在 `workspace-write` 沙箱下有 `0xC0000142` 的已知故障，
  技能里对此的写法是"换文件工具、别重试"，若你的策略不同请按 `docs/SKILL-TEMPLATE.md` 调整。

## 许可

本仓库 MIT（见 `LICENSE`）。`skills/` 内容移植自 MIT 许可的
[obra/superpowers](https://github.com/obra/superpowers)（Copyright © 2025 Jesse Vincent），
上游声明与固定提交见 `NOTICE` 与 `docs/UPSTREAM.md`。
