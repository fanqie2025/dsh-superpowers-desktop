---
name: using-git-worktrees
description: 开始需要与主线隔离的功能开发或实验性改动前，先确认当前是否在 git 仓库内、是否已有隔离工作区，是则创建或复用 git worktree 并跑通干净基线，不是则明确判定「本技能不适用」并给出工作区内的退化方案。适用于「别污染当前分支」「开个隔离工作区做实验」「做废了想整体丢掉」「执行实现计划前先隔离」这类请求。触发词：worktree、隔离工作区、别动主分支、实验性改动、整体回滚、git worktree add。
whenToUse: 要动代码且希望改动与主线隔离，或准备执行一份实现计划之前。
---

# 用 Git Worktree 开隔离工作区

让改动发生在隔离的工作区里。**隔离的意义**：实验性改动不污染主线，做废了能整体丢弃——一条
`git worktree remove` 回到原点，不留半成品分支和中间提交。核心纪律是**先检测、再创建**：
先确认是不是 git 仓库、是否已经在隔离工作区里，然后才动手。

开工时说明一句：「我正在用 using-git-worktrees 技能建立隔离工作区。」

## 何时用 / 何时不用

**用**：改动会持续多步、带不确定性、需与当前分支隔离；准备执行实现计划；用户要求「别污染主线」。

**不用**：改动很小且马上合并；只是读代码查资料；**根本不是 git 仓库**（本机最常见的形态，
此时本技能不适用，走第 0 步的退化方案）。

## 核心原则

1. **先检测已存在的隔离**，再创建——宿主造的隔离和 submodule 都能骗过肉眼。
2. **先确认工作区干净**，再开工——脏基线会让之后每一个失败都含义不明。
3. **worktree 是同一仓库的另一个检出，不是副本**：未提交改动不会自动跟过去。
4. 本机 DSH 工具表里没有原生 worktree 工具，所以直接用 git 即可。

## 流程

### 第 0 步：前置检查——这里是不是 git 仓库

```powershell
git rev-parse --is-inside-work-tree
```

判据：输出 `true` → 继续第 1 步。非零退出码、或输出不是 `true` → **本技能不适用**，明确
告诉用户「当前工作区不是 git 仓库，无法使用 worktree」，并改用退化替代。

若 `pwsh` 返回 `0xC0000142` 且零输出（本机已知故障），**不要反复重试同一条命令**：改用
`glob` 查找 `.git` 痕迹来判断，或直接用 `read`/`write`/`edit` 继续工作。

**退化替代（不是 git 仓库时）**——目标是让「整体丢弃」仍然成立：
- 本次全部产物限定在工作区里**一个**子目录内（如 `<工作区>\scratch\<任务名>\`），不要四处散落。
- 改任何既有文件前先用 `write` 留一份 `.bak` 副本，或先用 `read` 把原文完整记下。
- 判据：回到改前状态只需「删掉那个子目录 + 还原备份」，不靠记忆逐处回退。

### 第 1 步：检测是否已经在隔离工作区里

```powershell
$gitDir    = git rev-parse --git-dir
$gitCommon = git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree   # 有输出 = 在 submodule 里
```

判据：`$gitDir -ne $gitCommon` **且**不在 submodule → 已在 linked worktree 里，
**跳到第 3 步，不要再建**。否则是普通检出，继续第 2 步。在 submodule 里时按普通仓库处理。

已在 worktree 里就报告分支名；detached HEAD 要说明「分支需在收尾时创建」。

### 第 2 步：征得同意 + 创建 worktree

用户没在指令里声明偏好时，先用 `ask_user_question` 问：「要不要开一个隔离的 worktree？
它能保护你当前分支不被改动。」已声明的偏好照办不问；用户拒绝就在当前目录原地做，跳到第 3 步。

**放哪**（优先级，显式指定永远优先）：
1. 用户或指令里已声明的目录 → 照用。
2. 本机默认：**仓库外部的同级目录**，如 `G:\家庭网络\<仓库名>-worktrees\<分支名>`。放在仓库外
   就不必担心 worktree 内容被误提交进仓库（它仍须落在会话工作区内，否则会被沙箱拒绝）。
3. 只有用户明确要求放仓库内时才用项目内目录（`.worktrees\` 优先于 `worktrees\`），此时
   **必须先确认它已被忽略**：

```powershell
git check-ignore -q .worktrees
if ($LASTEXITCODE -ne 0) { <先加进 .gitignore 并提交，再继续> }
```

**创建**：

```powershell
$branch = "feature/xxx"
$path   = "G:\家庭网络\<仓库名>-worktrees\feature-xxx"   # Windows 路径里把 / 换成 -
git worktree add $path -b $branch
```

**验证建成功**（三条判据都要过）：

```powershell
git worktree list                        # 列表里能看到 $path 与 $branch
git -C $path rev-parse --show-toplevel   # 输出等于 $path
git -C $path status --short              # 应为空（新检出是干净的）
```

之后所有操作都指向新目录：`pwsh` 用 `workdir` 或 `-C $path`，`read`/`write`/`glob`/`grep`
的路径也必须是新目录，别改错边。

若 `git worktree add` 报权限错误（沙箱拒绝）：告诉用户沙箱拦住了创建，改在原目录做，跳到第 3 步。

**必须提醒**：`git worktree add` 从某个提交拉出干净工作树，你原来 `git status` 里的
**未提交改动不会自动跟过去**，它们留在原目录。要带过去就先 commit 或 stash，再在新 worktree 里恢复。

### 第 3 步：项目初始化（在目标目录里）

新检出 = 空工作树：构建产物、`node_modules`、虚拟环境都**不在**，忘了装依赖会得到一堆假失败。

```powershell
if (Test-Path package.json)     { npm install }
if (Test-Path Cargo.toml)       { cargo build }
if (Test-Path requirements.txt) { pip install -r requirements.txt }
if (Test-Path go.mod)           { go mod download }
```

都不存在就跳过，并在报告里注明「无依赖安装步骤」。

### 第 4 步：干净基线（开工前的门禁）

```powershell
git status --short     # 应当为空；有输出说明基线不干净，先问用户怎么处理
npm test               # 或 cargo test / pytest / go test ./...
```

判据：测试通过 → 报告就绪并进入实现；测试失败 → 把失败原样报告给用户，问是继续还是先排查，
**不要在红灯基线上开工**；没有测试运行器 → 明说「无测试套件，基线未验证」，退化为以
`git status` 为空 + 构建成功作为基线证据。报告时给出 worktree 完整路径、分支名与基线结论。

### 收尾：怎么清理

```powershell
git -C <仓库> worktree remove <路径>            # 干净时直接删
git -C <仓库> worktree remove --force <路径>    # 有未提交改动才用，会丢东西
git -C <仓库> worktree prune                    # 目录被手删过，清掉登记
git branch -d <分支>                            # 连分支一起丢
```

判据：`git worktree list` 里不再出现该路径，且该目录已消失。合并完或确认判废后再删；
用 `--force` 之前先确认那些改动确实不要了。

## 反模式

| 借口 | 现实 |
| --- | --- |
| 「我肯定不在 worktree 里，不用查」 | 跑第 1 步，宿主造的隔离和 submodule 都能骗过肉眼 |
| 「那目录肯定已被忽略」 | 跑 `git check-ignore`，否则整棵 worktree 被提交进仓库 |
| 「工作区是新的，基线测试可以等等」 | 脏基线让之后每个失败都含义不明，现在就跑 |
| 「建好就能直接开干」 | 新检出没有依赖和构建产物，先初始化再跑基线 |
| 「我在原目录改的，worktree 里应该也有」 | 未提交改动不会跟过去，先 commit 或 stash |
| 「改动很小也开一个 worktree」 | 小改、马上合并的，直接用主检出更快 |

## 完成判据

- 第 0 步结论明确：在 git 仓库内（继续），或不在（已声明不适用并给出退化方案）。
- 建了 worktree 时：`git worktree list` 含该路径；`git -C <路径> rev-parse --show-toplevel`
  等于该路径；该路径下 `git status --short` 为空。
- 依赖已在新目录安装/构建，或已注明无此步骤。
- 基线测试跑过并有明确结论（通过项数，或明说没有测试套件）。
- 收尾后 `git worktree list` 不再包含该路径。

## 与其它技能的关系

- 执行实现计划类技能之前先加载本技能，把实现放进隔离工作区。
- 交付产物用 `present`；需要多步任务清单时配合 `todo_write`。
- 需要用户拍板（是否建 worktree、基线红灯怎么办）时用 `ask_user_question`。

## 本机适配注意

- 宿主是 DeepSeek Harness 桌面端（Electron，Windows）。文件策略常为 `workspace-write`，
  **只有会话工作区可写**：worktree 落在工作区之外会被沙箱拒绝，所以「仓库外同级目录」指的是
  **工作区内的仓库兄弟目录**；仓库本身在工作区外时创建多半失败，走原地退化。
- `pwsh` 在该策略下有已知故障：返回 `0xC0000142`、零 stdout。两种拒绝形态要分清：沙箱明确拒绝
  会打印 `[sandbox: file access denied ...]`，`0xC0000142` 是另一种。遇到后者不要反复重试同一条
  命令，改用 `read`/`write`/`edit`/`glob`/`grep` 继续；确需执行程序再请用户放行。
- 工作目录**通常不是 git 仓库**、也常常没有测试运行器，所以本技能整体是条件式的：前提不成立就
  说不适用并给退化等价判据，不要硬套。
- 命令示例一律 PowerShell 语法；访问 `127.0.0.1` 或局域网服务时注意本机 `http_proxy` 会伪造 502。
