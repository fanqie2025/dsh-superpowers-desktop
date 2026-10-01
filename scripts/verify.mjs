#!/usr/bin/env node
/**
 * dsh-superpowers-desktop 结构校验
 *
 * 用法：
 *   node scripts/verify.mjs
 *   node scripts/verify.mjs --dsh-version 0.2.0-rc.2
 *   node scripts/verify.mjs --quiet      # 只输出失败项与总结
 *
 * 本脚本刻意只依赖 node 内置模块，并**复用 src/superpowers.js 里真正跑在运行时的那套
 * frontmatter 解析器**——校验器和运行时用的是同一份代码，不会出现「校验通过、运行时不认」。
 *
 * 退出码：0 全部通过；1 有失败项。
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseFrontmatter, readInvocation } from '../src/superpowers.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 本包应当且仅当包含的技能（与上游 obra/superpowers skills/ 一一对应）。 */
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

/** 插件运行时允许 import 的裸标识符前缀（零依赖不变式）。 */
const FORBIDDEN_IMPORT_PREFIXES = ['@deepseek-ai/', 'yaml', 'js-yaml', 'zod']

/** 正文长度下限，防止移植时把内容砍成空壳。 */
const MIN_BODY_LENGTH = 300

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_DESCRIPTION_LENGTH = 1024

// ---------------------------------------------------------------------------
// 极简 semver —— 只为校验 peerDependencies 是否覆盖某个 dsh 运行时版本。
// 支持：比较运算符 >= > < <=、^、~、空格分隔的 AND、预发布版本（rc/alpha）。
// 不支持：||、通配符、连字符区间、x 占位。这些没用到，写全反而是没测过的代码。
// ---------------------------------------------------------------------------

/**
 * 解析 semver 字符串。
 * @param {string} input - 形如 0.2.0-rc.2 的版本。
 * @returns {{major:number,minor:number,patch:number,pre:string[]}} 解析结果。
 */
function parseVersion(input) {
  const [core, pre = ''] = String(input).trim().split('-')
  const [major = 0, minor = 0, patch = 0] = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return { major, minor, patch, pre: pre ? pre.split('.') : [] }
}

/**
 * 比较两个版本。
 * @param {ReturnType<typeof parseVersion>} a - 左。
 * @param {ReturnType<typeof parseVersion>} b - 右。
 * @returns {number} a>b 为 1，a<b 为 -1，相等为 0。
 */
function compareVersion(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1
  }
  if (!a.pre.length && !b.pre.length) return 0
  if (!a.pre.length) return 1 // 正式版 > 预发布版
  if (!b.pre.length) return -1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i += 1) {
    const left = a.pre[i]
    const right = b.pre[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const leftNum = /^\d+$/.test(left)
    const rightNum = /^\d+$/.test(right)
    if (leftNum && rightNum) {
      if (Number(left) !== Number(right)) return Number(left) > Number(right) ? 1 : -1
    } else if (left !== right) {
      return left > right ? 1 : -1
    }
  }
  return 0
}

/**
 * 判断版本是否落在区间内。
 * @param {string} version - 待测版本。
 * @param {string} range - 区间表达式。
 * @returns {boolean} 是否满足。
 */
function satisfies(version, range) {
  const target = parseVersion(version)
  const parts = String(range).trim().split(/\s+/).filter(Boolean)

  for (const part of parts) {
    const match = /^(>=|<=|>|<|\^|~)?\s*(.+)$/.exec(part)
    if (!match) return false
    const op = match[1] ?? '='
    const bound = parseVersion(match[2])

    if (op === '>=' && compareVersion(target, bound) < 0) return false
    if (op === '>' && compareVersion(target, bound) <= 0) return false
    if (op === '<=' && compareVersion(target, bound) > 0) return false
    if (op === '<' && compareVersion(target, bound) >= 0) return false
    if (op === '=' && compareVersion(target, bound) !== 0) return false
    if (op === '^') {
      if (compareVersion(target, bound) < 0) return false
      // ^0.x.y / ^0.0.z 的次版本号语义与 ^1+ 不同，本仓库只用 ^4.x，按通用规则处理即可
      const ceiling =
        bound.major > 0
          ? { major: bound.major + 1, minor: 0, patch: 0, pre: [] }
          : { major: 0, minor: bound.minor + 1, patch: 0, pre: [] }
      if (compareVersion(target, ceiling) >= 0) return false
    }
    if (op === '~') {
      if (compareVersion(target, bound) < 0) return false
      const ceiling = { major: bound.major, minor: bound.minor + 1, patch: 0, pre: [] }
      if (compareVersion(target, ceiling) >= 0) return false
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// 检查框架
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const QUIET = args.includes('--quiet')
const versionFlag = args.indexOf('--dsh-version')
const RUNTIME_VERSION = versionFlag >= 0 ? args[versionFlag + 1] : '0.2.0-rc.2'

/** @type {{ok:boolean,label:string,detail:string}[]} */
const results = []

/**
 * 记录一条检查结果。
 * @param {boolean} ok - 是否通过。
 * @param {string} label - 检查项。
 * @param {string} [detail] - 说明。
 * @returns {boolean} 原样返回 ok，便于串联。
 */
function check(ok, label, detail = '') {
  results.push({ ok: Boolean(ok), label, detail })
  if (!ok || !QUIET) {
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  }
  return Boolean(ok)
}

/**
 * 文件是否存在且为普通文件。
 * @param {string} path - 路径。
 * @returns {Promise<boolean>} 结果。
 */
async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * 读取 JSON 文件。
 * @param {string} path - 路径。
 * @returns {Promise<any>} 解析结果。
 */
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

console.log(`\ndsh-superpowers-desktop 结构校验（目标 dsh 运行时 ${RUNTIME_VERSION}）\n`)

// 1) package.json 与 dsh.bundle 契约
const pkg = await readJson(join(ROOT, 'package.json'))
check(pkg.name === 'dsh-superpowers-desktop', 'package.json name', pkg.name)
check(typeof pkg.version === 'string' && pkg.version.length > 0, 'package.json version', pkg.version)
check(pkg.type === 'module', 'package.json type=module', String(pkg.type))

const mainPath = join(ROOT, pkg.main ?? '')
check(Boolean(pkg.main) && (await isFile(mainPath)), 'package.json main 指向存在的文件', String(pkg.main))

const patchRel = pkg.dsh?.bundle?.patch
check(Boolean(patchRel), 'package.json 声明 dsh.bundle.patch', String(patchRel))
const patchPath = join(ROOT, patchRel ?? '')
check(Boolean(patchRel) && (await isFile(patchPath)), 'bundle patch 文件存在', String(patchRel))

if (await isFile(patchPath)) {
  const patchText = await readFile(patchPath, 'utf8')
  check(patchText.includes('id: superpowers-desktop'), 'patch 内含行 id superpowers-desktop')
  check(patchText.includes('name: "dsh-superpowers-desktop"'), 'patch 内的包名与 package.json 一致')
}

// 2) 零依赖不变式：运行时源码不得 import 任何第三方裸标识符
const srcDir = join(ROOT, 'src')
const srcFiles = (await readdir(srcDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)

for (const file of srcFiles) {
  const source = await readFile(join(srcDir, file), 'utf8')
  const specifiers = [...source.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1])
  const offenders = specifiers.filter(
    (spec) => !spec.startsWith('node:') && FORBIDDEN_IMPORT_PREFIXES.some((prefix) => spec.startsWith(prefix)),
  )
  check(offenders.length === 0, `src/${file} 无第三方运行时依赖`, offenders.join(', '))
}

// 3) peerDependencies 覆盖目标 dsh 运行时
const peers = pkg.peerDependencies ?? {}
const skillRange = peers['@deepseek-ai/dsh-skill']
check(Boolean(skillRange), '声明 @deepseek-ai/dsh-skill 版本区间', String(skillRange))
if (skillRange) {
  let ok = false
  let detail = ''
  try {
    ok = satisfies(RUNTIME_VERSION, skillRange)
  } catch (error) {
    detail = String(error)
  }
  check(ok, `@deepseek-ai/dsh-skill 区间覆盖 dsh ${RUNTIME_VERSION}`, ok ? String(skillRange) : `${skillRange} 不覆盖 → ${detail}`)
}
const coreRange = peers['@deepseek-ai/cordis']
if (coreRange) {
  check(satisfies('4.0.4', coreRange), '@deepseek-ai/cordis 区间覆盖宿主 cordis 4.0.x', String(coreRange))
}

// 4) skills/ 目录：数量、命名、frontmatter、正文
const skillsDir = join(ROOT, 'skills')
const dirs = (await readdir(skillsDir, { withFileTypes: true })).filter((entry) => !entry.name.startsWith('.'))

/** @type {string[]} */
const actual = []
for (const entry of dirs) {
  // 目录本身可能是符号链接/junction，用 stat 跟随
  try {
    const info = await stat(join(skillsDir, entry.name))
    if (!info.isDirectory()) continue
  } catch {
    continue
  }
  actual.push(entry.name)
}

const missing = EXPECTED_SKILLS.filter((skill) => !actual.includes(skill))
const extra = actual.filter((skill) => !EXPECTED_SKILLS.includes(skill))
check(missing.length === 0, '技能齐全（无缺失）', missing.join(', '))
check(extra.length === 0, '技能无多余目录', extra.join(', '))

for (const skill of EXPECTED_SKILLS) {
  const skillPath = join(skillsDir, skill, 'SKILL.md')
  if (!(await isFile(skillPath))) {
    check(false, `skills/${skill}/SKILL.md 存在`)
    continue
  }
  const parsed = parseFrontmatter(await readFile(skillPath, 'utf8'))
  if (!parsed) {
    check(false, `skills/${skill} frontmatter 可解析`)
    continue
  }
  const { data, body } = parsed
  check(data.name === skill, `skills/${skill} frontmatter name 与目录一致`, String(data.name))
  check(SKILL_NAME_RE.test(data.name ?? ''), `skills/${skill} name 是 kebab-case`, String(data.name))
  check(Boolean(data.description) && data.description.length <= MAX_DESCRIPTION_LENGTH, `skills/${skill} 有 description 且不超长`, `${(data.description ?? '').length} 字符`)
  check(body.trim().length >= MIN_BODY_LENGTH, `skills/${skill} 正文不空`, `${body.trim().length} 字符`)
  const invocation = readInvocation(data)
  check(typeof invocation.modelInvocable === 'boolean', `skills/${skill} 调用策略可解析`, JSON.stringify(invocation))
}

// 5) 总结
const failed = results.filter((item) => !item.ok)
console.log(`\n共 ${results.length} 项检查，${results.length - failed.length} 通过，${failed.length} 失败。`)
if (failed.length) {
  console.log('\n失败项：')
  for (const item of failed) console.log(`  - ${item.label}${item.detail ? ` — ${item.detail}` : ''}`)
}
console.log('')
process.exit(failed.length ? 1 : 0)
