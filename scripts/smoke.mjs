#!/usr/bin/env node
/**
 * 冒烟测试：在不启动宿主的前提下，真正执行一遍插件代码。
 *
 * `scripts/verify.mjs` 只做**结构与不变式**校验（frontmatter、peer 区间、零依赖……），
 * 它不证明 `ctx.skills.registerProvider` 那条路径真的能跑通。本脚本补上这一环：
 * 用一个**符合 @deepseek-ai/dsh-skill@0.2.0-rc.2 契约**的桩 ctx 调用 apply()，
 * 再对 provider 的 list() / get() 逐项断言。
 *
 * 桩只需要宿主真正提供给插件的四个东西：ctx.logger、ctx.effect、ctx.skills.registerProvider、
 * 以及 control{signal, invalidate}。若插件的实际依赖超出这个面，本脚本会立刻失败——
 * 那正是它要发现的问题。
 *
 * 用法：node scripts/smoke.mjs        （退出码 0 = 全部通过）
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply, name as pluginName } from '../src/superpowers.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const EXPECTED_SKILLS = [
  'brainstorming',
  'diagnosing-superpowers',
  'dispatching-parallel-agents',
  'executing-plans',
  'finishing-a-development-branch',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
]

let passed = 0
const failures = []

/**
 * 断言。
 * @param {boolean} ok - 条件。
 * @param {string} label - 描述。
 * @param {string} [detail] - 失败细节。
 */
function expect(ok, label, detail = '') {
  if (ok) {
    passed += 1
    return
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

/**
 * 造一个宿主桩，按真实契约把插件注册的 provider 抓出来。
 * @returns {{ ctx: object, providers: object[], disposed: () => boolean }}
 */
function makeHost() {
  const providers = []
  const controls = []
  let disposed = false

  const ctx = {
    logger: { info() {}, warn() {}, debug() {}, error() {} },
    // cordis 的 effect：立即执行并返回 disposer
    effect(factory) {
      const dispose = factory()
      return () => {
        disposed = true
        dispose?.()
      }
    },
    skills: {
      registerProvider(create) {
        const control = {
          signal: new AbortController().signal,
          invalidate() {},
        }
        controls.push(control)
        providers.push(create(control))
        return () => {
          disposed = true
        }
      },
    },
  }

  return { ctx, providers, controls, disposed: () => disposed }
}

const log = (msg) => console.log(msg)

log(`\n${pluginName} 冒烟测试（真执行 apply → list → get）\n`)

// --- 1) apply() 能跑通并注册一个 provider ---------------------------------
const host = makeHost()
let applyError
try {
  apply(host.ctx, {})
} catch (error) {
  applyError = error
}
expect(!applyError, 'apply() 不抛错', applyError ? String(applyError) : '')
expect(host.providers.length === 1, '恰好注册一个 provider', `实际 ${host.providers.length}`)

const provider = host.providers[0]
if (!provider) {
  log(`  FAIL  没有拿到 provider，后续断言跳过\n`)
  console.log(failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}

// --- 2) provider 的形状符合 SkillProvider 契约 -----------------------------
expect(provider.name === 'superpowers-desktop', 'provider 名为 superpowers-desktop', String(provider.name))
expect(typeof provider.list === 'function', 'provider.list 是函数')
expect(typeof provider.get === 'function', 'provider.get 是函数')

// --- 3) list() 返回 15 个合格候选项 ---------------------------------------
const candidates = await provider.list({})
expect(Array.isArray(candidates), 'list() 返回数组', typeof candidates)
expect(candidates.length === 15, 'list() 返回 15 个技能', `实际 ${candidates.length}`)

const names = candidates.map((c) => c.name).sort()
expect(
  JSON.stringify(names) === JSON.stringify([...EXPECTED_SKILLS].sort()),
  '技能名集合与预期一致',
  names.join(','),
)

for (const c of candidates) {
  const problems = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.name)) problems.push('name 不是 kebab-case')
  if (!c.description || typeof c.description !== 'string') problems.push('description 缺失')
  if (c.rank !== 600) problems.push(`rank=${c.rank}（应为 600）`)
  if (c.source !== 'bundled') problems.push(`source=${c.source}`)
  if (c.provider !== 'superpowers-desktop') problems.push(`provider=${c.provider}`)
  if (c.invocation?.modelInvocable !== true) problems.push('modelInvocable 不为 true')
  if (c.invocation?.userInvocable !== true) problems.push('userInvocable 不为 true')
  if (c.locator?.path === undefined) problems.push('locator.path 缺失')
  if (c.resourceBase?.kind !== 'directory') problems.push('resourceBase 不是 directory')
  if (typeof c.path !== 'string') problems.push('path 缺失')
  if (problems.length) failures.push(`候选项 ${c.name}: ${problems.join('; ')}`)
}
expect(
  failures.filter((f) => f.startsWith('候选项 ')).length === 0,
  '15 个候选项字段全部合格（rank/source/provider/invocation/locator/resourceBase）',
  failures.filter((f) => f.startsWith('候选项 ')).join(' | '),
)

// --- 4) get() 对每一个候选项都能载入正文 -----------------------------------
let loaded = 0
const getProblems = []
for (const c of candidates) {
  let def
  try {
    def = await provider.get(c, {})
  } catch (error) {
    getProblems.push(`${c.name}: get() 抛错 ${String(error)}`)
    continue
  }
  if (!def) {
    getProblems.push(`${c.name}: get() 返回 undefined`)
    continue
  }
  if (def.name !== c.name) getProblems.push(`${c.name}: 返回的 name 漂移为 ${def.name}`)
  if (typeof def.content !== 'string' || def.content.trim().length < 300) {
    getProblems.push(`${c.name}: content 过短（${def.content?.length ?? 0}）`)
  }
  if (def.content.startsWith('---')) getProblems.push(`${c.name}: content 里残留 frontmatter`)
  if (def.resourceBase?.kind !== 'directory') getProblems.push(`${c.name}: resourceBase 缺失`)
  if (def.provider !== 'superpowers-desktop') getProblems.push(`${c.name}: provider 字段不对`)
  loaded += 1
}
expect(loaded === 15, 'get() 成功载入 15 个正文', `实际 ${loaded}`)
expect(getProblems.length === 0, '载入的正文无问题（名字一致/不残留 frontmatter/长度足够）', getProblems.join(' | '))

// --- 5) get() 对伪造的 locator 返回 undefined 而不是抛错 --------------------
let bogus
try {
  bogus = await provider.get({ name: 'brainstorming', locator: { path: join(ROOT, 'nope.md'), directory: ROOT } }, {})
} catch (error) {
  bogus = `threw: ${String(error)}`
}
expect(bogus === undefined, '对不存在的文件 get() 返回 undefined', String(bogus))

// --- 6) 配置面：include / exclude / skillDir / rank / 保留名 -----------------
const filtered = makeHost()
apply(filtered.ctx, { include: ['brainstorming', 'writing-plans'], rank: 5 })
const filteredList = await filtered.providers[0].list({})
expect(filteredList.length === 2, 'include 只放行两个技能', `实际 ${filteredList.length}`)
expect(filteredList.every((c) => c.rank === 5), 'rank 配置生效', filteredList.map((c) => c.rank).join(','))

const excluded = makeHost()
apply(excluded.ctx, { exclude: 'brainstorming,writing-skills' })
const excludedList = await excluded.providers[0].list({})
expect(
  excludedList.length === 13 && !excludedList.some((c) => c.name === 'brainstorming'),
  'exclude 剔除两个技能',
  `实际 ${excludedList.length}`,
)

const missingDir = makeHost()
apply(missingDir.ctx, { skillDir: join(ROOT, 'does-not-exist') })
const missingList = await missingDir.providers[0].list({})
expect(Array.isArray(missingList) && missingList.length === 0, 'skillDir 不存在时返回空数组而不是抛错')

let reservedThrew = false
try {
  apply(makeHost().ctx, { providerName: 'runtime' })
} catch {
  reservedThrew = true
}
expect(reservedThrew, 'providerName 用保留名 runtime 时抛错')

// --- 7) 卸载路径：apply 注册的东西能被 disposer 清掉 ------------------------
const disposable = makeHost()
let dispose
disposable.ctx.effect = (factory) => {
  const inner = factory()
  dispose = inner
  return inner
}
apply(disposable.ctx, {})
expect(typeof dispose === 'function', 'effect 返回了可用的 disposer')
let disposeThrew
try {
  dispose()
} catch (error) {
  disposeThrew = String(error)
}
expect(!disposeThrew, 'disposer 可调用且不抛错', disposeThrew ?? '')

// --- 汇总 -----------------------------------------------------------------
log(`  通过 ${passed} 项，失败 ${failures.length} 项`)
if (failures.length) {
  log('')
  for (const f of failures) log(`  FAIL  ${f}`)
  log('')
  process.exit(1)
}
log(`\n  冒烟测试通过：插件代码在桩宿主下可正常注册、列出与载入。\n`)
