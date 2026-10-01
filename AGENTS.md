# AGENTS.md —— 给在本仓库干活的智能体

本文件是**仓库级不变式**。改动之前先读它；与它冲突的"看起来更优雅"的做法，默认不做。

## 一、四条硬不变式

1. **运行时零第三方依赖。** `src/` 只允许 `import ... from 'node:...'`。
   不要引入 `@deepseek-ai/*`、`yaml`、`zod` 或任何其它包——哪怕它已经在 profile 里存在。
   原因：DSH 插件以同进程对象加载，而 profile 的 `node_modules` 里没有 `@deepseek-ai/*`
   （由宿主 `app.asar` 提供），裸标识符能否解析取决于宿主是否做了外部化映射。不赌这一把。
   `scripts/verify.mjs` 会扫这条，违反即校验失败。
2. **不抢同名技能。** `DEFAULT_RANK` 是官方 `BUNDLED_SKILL_RANK`（600），含义是「本地技能优先，
   本包补位」。不要为了"让技能更生效"把它调小——那会让用户/项目里的同名技能被静默遮蔽，
   且没有 API 能查回被遮蔽的定义。要抢位只能由用户通过 `config.rank` 显式选择。
3. **没有构建步骤。** `main` 直指 `src/superpowers.js`。不要引入 tsc/打包链，也不要提交 `lib/`。
   没有编译步骤，就没有"忘了编译""lib 与 src 漂移"这两类故障。
4. **技能内容以 `docs/SKILL-TEMPLATE.md` 为准。** 加技能、改技能都照它写；frontmatter 的
   `name` 必须与目录同名且是 kebab-case，`description` 是唯一路由依据，必须写清
   「做什么 / 何时用 / 用户会怎么开口」。

## 二、目录职责

| 路径 | 职责 | 改它的时机 |
|---|---|---|
| `src/superpowers.js` | SkillProvider 本体 + 内联 frontmatter 解析 | 只有接口契约变化时才动；改动要同步 `scripts/verify.mjs` 的不变式 |
| `skills/<name>/SKILL.md` | 技能正文（15 个） | 按模板改；不要增删技能目录而不更新 `verify.mjs` 的 `EXPECTED_SKILLS` |
| `skills/using-superpowers/references/dsh-tools.md` | 上游工具词汇 ↔ 本机工具的映射 | 本机工具集变化时更新；技能正文里出现其它 harness 工具名时以它为准 |
| `cordis.patch.yml` | 挂载行（`id: superpowers-desktop`） | 改名要三处同时改：本文件、`package.json` 的 `name`、`src` 的 `DEFAULT_PROVIDER` |
| `scripts/verify.mjs` | 结构 + peer 区间校验 | 新增不变式时加检查项 |
| `docs/UPSTREAM.md` | 上游固定提交与逐技能移植范围 | 再同步上游后必须更新 |

## 三、常用动作

**改完技能或插件后自检**

```powershell
node scripts/verify.mjs          # 结构 + peer 区间（或双击 scripts\verify.cmd）
node scripts/smoke.mjs           # 桩宿主下真跑 apply → list → get
```

改了 `src/superpowers.js` 时**两个都要跑**：`verify.mjs` 只管结构与不变式，
它不会发现"provider 注册逻辑写坏了"这类问题——那是 `smoke.mjs` 的职责。

**装到本机桌面端**（必须**先完全退出** DeepSeek Harness，否则 profile 的 `node_modules` 被锁）

```powershell
# 双击 scripts\install-desktop.cmd 即可；它做三件事：清空 NODE_OPTIONS、找 runtime CLI、装本地路径
```

**再同步上游**：见 `docs/UPSTREAM.md` 的「再同步流程」。

## 四、本机环境注意事项

- **`pwsh` 可能整个不可用**：文件策略为 `workspace-write` 时调用返回 `0xC0000142`、零 stdout。
  区分判据：策略拒绝会打印 `[sandbox: file access denied ...]`；`0xC0000142` 是另一种形态。
  遇到后者**不要反复重试同一条命令**，改用 `read`/`write`/`edit`/`glob`/`grep`（不受影响）。
- **写权限**：`workspace-write` 只允许写会话工作区。桌面端 profile
  （`C:\Users\Administrator\.dsh\profiles\desktop`）在工作区之外，所以安装动作必须由用户执行，
  或先请用户放行。
- **`glob` 的模式坑**：本机 glob 实现里，模式**中间**的单个 `*` 不生效
  （`skills/*/SKILL.md` 恒为空），要么用 `**`（`**/SKILL.md`），要么只用 basename 模式。
  另外 `**` 不跟随 junction，所以「glob 没列出」不能用来判断文件不存在——用 `read` 穿透确认。
- **`http_proxy` 会伪造响应**：探测 `127.0.0.1`/局域网服务时可能拿到假的 502/401；
  用 `curl.exe --noproxy '*'` 直连为准，别据此判断服务故障。

## 五、不要做的事

- 不要往仓库外的路径写文件（技能真源 `D:\Tools\skillshare\skills` 的分发由用户执行）。
- 不要把上游附属文件（`references/`、`scripts/`、`prompts/`）悄悄补进来充完整——
  本仓库的约定是「要么内联要点，要么在 `docs/UPSTREAM.md` 登记为省略」，不假装它们存在。
- 不要在技能正文里使用其它 harness 的工具名（`Bash`/`Read`/`Write`/`Task`/`TodoWrite`…）。
