/**
 * dsh-superpowers-desktop —— DeepSeek Harness 原生 SkillProvider
 *
 * 把包内 skills/ 下的技能目录，通过 ctx.skills.registerProvider() 注入 harness 的
 * 技能注册表，随 dsh.bundle 的挂载/卸载自动登记/清理。
 *
 * ---------------------------------------------------------------------------
 * 三个刻意的工程决策（与第三方 @wenaixi/dsh-superpower 不同，理由在此）
 * ---------------------------------------------------------------------------
 *
 * 1) 零运行时依赖：本文件不 import 任何 @deepseek-ai/* 包，也不依赖 yaml。
 *
 *    原因：DSH 的插件以同进程对象被加载，而 profile 的 node_modules 里**没有**
 *    @deepseek-ai/*（它们由宿主 app.asar 提供）。插件 import 它们的裸标识符时能否
 *    解析，取决于宿主是否做了外部化映射；一旦没做到，插件会在 apply() 阶段直接
 *    抛错，而那时你只能看到一个语焉不详的挂载失败。技能 frontmatter 是极小的
 *    YAML 子集，自己解析（见 parseFrontmatter）比赌一次解析器可用更划算。
 *    结果：本包安装时不需要解析任何依赖，唯一能失败的地方就是 skills/ 目录本身。
 *
 * 2) rank 用官方 BUNDLED_SKILL_RANK = 600，而不是抢到最前面的 10。
 *
 *    dsh-skill 的裁决规则是：同层内先比 rank（小者胜），再比 Provider 注册顺序。
 *    第三方版本用 rank 10 让「本包技能永远赢」，代价是用户/项目里任何同名技能
 *    （filesystem 根通常是 100–500）会被**静默吃掉**，且没有 API 能查回被遮蔽的定义。
 *    本包反过来：默认 600，同名时**本地技能优先**，插件只做补位。要改可以用
 *    config.rank（例如设 10 抢位，风险自负）。
 *
 * 3) 纯 ESM、无构建步骤：main 直接指向本文件。
 *
 *    没有 tsc/打包链，就没有「忘了编译」「lib 与 src 漂移」这两类故障；代价是没有
 *    编译期类型检查，所以本文件的契约以内联 JSDoc 标注，并靠 scripts/verify.mjs
 *    做结构与不变式校验。
 *
 * ---------------------------------------------------------------------------
 * API 契约（依据 @deepseek-ai/dsh-skill@0.2.0-rc.2 的 lib/types/index.d.ts）
 * ---------------------------------------------------------------------------
 *   ctx.skills.registerProvider(create: (control) => SkillProvider): () => void
 *   SkillProvider.list(options) -> readonly SkillCandidate[] | SkillProviderObservation
 *   SkillProvider.get(candidate, options) -> SkillDefinition | undefined
 *   SkillCandidate = SkillSummary + { rank, locator, metadata? }
 *   SkillSummary   = { path?, name, description, whenToUse?, invocation, source, provider, resourceBase? }
 *   SkillDefinition= SkillSummary + { content, metadata? }
 *   invocation     = { modelInvocable: boolean, userInvocable: boolean }
 *   保留的 provider 名：'runtime'
 *
 * @module dsh-superpowers-desktop
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名（行 id、日志前缀用它）。 */
export const name = 'superpowers-desktop'

/** 声明对 skills 服务的依赖：没有它本插件不该被加载。 */
export const inject = ['skills']

/** 包根目录（src/ 的上一级），用来定位默认的 skills/。 */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 默认技能目录：包内 skills/。 */
const DEFAULT_SKILL_DIR = join(PACKAGE_ROOT, 'skills')

/** 默认 provider 名。与第三方包的 `superpowers` 区分，避免同时安装时重名。 */
const DEFAULT_PROVIDER = 'superpowers-desktop'

/**
 * 默认 rank。等于 @deepseek-ai/dsh-skill 导出的 BUNDLED_SKILL_RANK，
 * 即「与官方 bundled 同档，不抢本地技能」——见文件头决策 2。
 */
const DEFAULT_RANK = 600

/** dsh-skill 保留的 provider 名，注册它会抛错。 */
const RESERVED_PROVIDER = 'runtime'

/** 公开的技能名语法：kebab-case（与 isSkillName 的约定一致）。 */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 单个 description 的长度上限，避免把目录消息撑爆。 */
const MAX_DESCRIPTION_LENGTH = 1024

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

/**
 * 把外部传入的 config 归一化成内部形状。任何非法值都退回默认，不抛错——
 * 插件挂载失败比配置写错更难排查。
 *
 * @param {unknown} raw - cordis 传入的插件配置。
 * @returns {{ providerName: string, skillDir: string, rank: number, include: Set<string>|undefined, exclude: Set<string> }}
 */
function normalizeConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}

  const providerName =
    typeof cfg.providerName === 'string' && cfg.providerName.trim() ? cfg.providerName.trim() : DEFAULT_PROVIDER
  if (providerName === RESERVED_PROVIDER) {
    throw new Error(`[${name}] providerName "${RESERVED_PROVIDER}" 是 dsh-skill 的保留名，不可用`)
  }

  let skillDir = DEFAULT_SKILL_DIR
  if (typeof cfg.skillDir === 'string' && cfg.skillDir.trim()) {
    const raw = cfg.skillDir.trim()
    skillDir = isAbsolute(raw) ? raw : resolve(PACKAGE_ROOT, raw)
  }

  const rank = Number.isFinite(cfg.rank) ? Number(cfg.rank) : DEFAULT_RANK

  return {
    providerName,
    skillDir,
    rank,
    include: toNameSet(cfg.include),
    exclude: toNameSet(cfg.exclude),
  }
}

/**
 * 把 include/exclude 配置项转成集合。
 * @param {unknown} value - 字符串数组或逗号分隔字符串。
 * @returns {Set<string>|undefined} 空集合视为未配置。
 */
function toNameSet(value) {
  if (value === undefined || value === null) return undefined
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const names = list.map((item) => String(item).trim()).filter(Boolean)
  return names.length ? new Set(names) : undefined
}

// ---------------------------------------------------------------------------
// Frontmatter —— 只解析 DSH skill 需要的那个极小子集，不引入 YAML 依赖
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Frontmatter
 * @property {Record<string, string>} data - 顶层标量键值。
 * @property {string} body - frontmatter 之后的正文。
 */

/**
 * 解析 SKILL.md 的 YAML frontmatter。
 *
 * 支持的形态：顶层 `key: value` 标量（值可带成对引号），`#` 注释行，
 * CRLF 行尾，以及开头的 UTF-8 BOM。嵌套（缩进行）一律跳过——
 * DSH 的目录只消费 name/description/whenToUse/invocation 这几个顶层键。
 *
 * @param {string} raw - 文件全文。
 * @returns {Frontmatter|undefined} 无法解析时返回 undefined。
 */
export function parseFrontmatter(raw) {
  let text = raw
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // 去 BOM：Windows 编辑器常带

  const lines = text.split('\n')
  if (lines.length < 2) return undefined
  if (lines[0].replace(/\r$/, '') !== '---') return undefined

  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].replace(/\r$/, '') === '---') {
      end = i
      break
    }
  }
  if (end < 0) return undefined

  /** @type {Record<string, string>} */
  const data = {}
  for (let i = 1; i < end; i += 1) {
    const line = lines[i].replace(/\r$/, '')
    if (!line || /^\s/.test(line) || line.startsWith('#')) continue // 空行 / 嵌套块 / 注释
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    data[match[1]] = unquote(match[2].trim())
  }

  return { data, body: lines.slice(end + 1).join('\n') }
}

/**
 * 去掉成对的单/双引号。
 * @param {string} value - 原始标量文本。
 * @returns {string} 去引号后的值。
 */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * 读取布尔型 frontmatter 字段。接受 true/false/1/0/yes/no/on/off。
 * @param {Record<string, string>} data - frontmatter 键值。
 * @param {string} key - 字段名。
 * @returns {boolean|undefined} 未声明时返回 undefined。
 */
function readBoolean(data, key) {
  if (!Object.hasOwn(data, key)) return undefined
  const value = data[key].toLowerCase()
  if (value === 'true' || value === '1' || value === 'yes' || value === 'on') return true
  if (value === 'false' || value === '0' || value === 'no' || value === 'off') return false
  return undefined
}

/**
 * 解析调用策略。规范键是 kebab-case，同时接受历史驼峰写法（宽容优先：
 * 一个写错的键不该让技能静默消失）。
 *
 * - `disable-model-invocation: true` / `disableModelInvocation: true` → 模型不可调用
 * - `user-invocable: false` / `userInvocable: false` → 用户不可调用
 *
 * @param {Record<string, string>} data - frontmatter 键值。
 * @returns {{ modelInvocable: boolean, userInvocable: boolean }} 调用策略。
 */
export function readInvocation(data) {
  const disableModel = readBoolean(data, 'disable-model-invocation') ?? readBoolean(data, 'disableModelInvocation')
  const userInvocable = readBoolean(data, 'user-invocable') ?? readBoolean(data, 'userInvocable')
  return {
    modelInvocable: disableModel !== true,
    userInvocable: userInvocable !== false,
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** @typedef {import('@deepseek-ai/dsh-skill').SkillCandidate} SkillCandidate */
/** @typedef {import('@deepseek-ai/dsh-skill').SkillDefinition} SkillDefinition */

class SuperpowersProvider {
  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文（只用于日志）。
   * @param {{ providerName: string, skillDir: string, rank: number, include: Set<string>|undefined, exclude: Set<string> }} cfg - 归一化配置。
   */
  constructor(ctx, cfg) {
    /** @type {string} Provider 名，注册表按它去重。 */
    this.name = cfg.providerName
    this.ctx = ctx
    this.skillDir = cfg.skillDir
    this.rank = cfg.rank
    this.include = cfg.include
    this.exclude = cfg.exclude
  }

  /**
   * 列出技能目录下的全部候选项。只读 frontmatter，不读正文。
   * @param {import('@deepseek-ai/dsh-skill').SkillLookupOptions} options - 查询上下文。
   * @returns {Promise<readonly SkillCandidate[]>} 候选项；目录不存在时返回空数组。
   */
  async list(options) {
    options?.signal?.throwIfAborted()

    /** @type {import('node:fs').Dirent[]} */
    let entries
    try {
      entries = await readdir(this.skillDir, { withFileTypes: true })
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        this.log('warn', `技能目录不存在：${this.skillDir}`)
        return []
      }
      throw error
    }

    /** @type {SkillCandidate[]} */
    const candidates = []
    const seen = new Set()

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      options?.signal?.throwIfAborted()
      if (entry.name.startsWith('.')) continue

      const dir = join(this.skillDir, entry.name)
      const skillPath = join(dir, 'SKILL.md')

      // 用 stat 而不是 Dirent：技能目录在 Windows 上常是 junction/符号链接
      // （例如 skillshare 分发出来的目标），isDirectory() 对符号链接会返回 false。
      try {
        const info = await stat(skillPath)
        if (!info.isFile()) continue
      } catch {
        this.log('debug', `跳过 ${entry.name}：没有 SKILL.md`)
        continue
      }

      let parsed
      try {
        parsed = parseFrontmatter(await readFile(skillPath, 'utf8'))
      } catch (error) {
        this.log('warn', `跳过 ${skillPath}：读取失败（${String(error)}）`)
        continue
      }
      if (!parsed) {
        this.log('warn', `跳过 ${skillPath}：缺少或无法解析 frontmatter`)
        continue
      }

      const skillName = parsed.data.name?.trim()
      const description = parsed.data.description?.trim()
      if (!skillName || !description) {
        this.log('warn', `跳过 ${skillPath}：frontmatter 必须同时有 name 与 description`)
        continue
      }
      if (!SKILL_NAME_RE.test(skillName)) {
        this.log('warn', `跳过 ${skillPath}：技能名 "${skillName}" 不是 kebab-case`)
        continue
      }
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        this.log('warn', `跳过 ${skillPath}：description 超过 ${MAX_DESCRIPTION_LENGTH} 字符`)
        continue
      }
      if (skillName !== entry.name) {
        this.log('warn', `技能名 "${skillName}" 与目录名 "${entry.name}" 不一致，以 frontmatter 为准`)
      }
      if (seen.has(skillName)) {
        this.log('warn', `跳过 ${skillPath}：技能名 "${skillName}" 重复`)
        continue
      }
      if (this.include && !this.include.has(skillName)) continue
      if (this.exclude?.has(skillName)) continue

      seen.add(skillName)
      candidates.push(
        /** @type {SkillCandidate} */ ({
          name: skillName,
          description,
          ...(parsed.data.whenToUse ? { whenToUse: parsed.data.whenToUse } : {}),
          invocation: readInvocation(parsed.data),
          source: 'bundled',
          provider: this.name,
          rank: this.rank,
          locator: { path: skillPath, directory: dir },
          resourceBase: { kind: 'directory', path: dir },
          path: skillPath,
        }),
      )
    }

    return candidates
  }

  /**
   * 载入某个候选项的完整正文。
   * @param {SkillCandidate} candidate - list() 返回的候选项。
   * @param {import('@deepseek-ai/dsh-skill').SkillLookupOptions} options - 查询上下文。
   * @returns {Promise<SkillDefinition|undefined>} 定义；已不可加载时返回 undefined。
   */
  async get(candidate, options) {
    options?.signal?.throwIfAborted()

    const locator = /** @type {{ path?: string, directory?: string }|undefined} */ (candidate.locator)
    if (!locator?.path || !locator?.directory) return undefined

    let raw
    try {
      raw = await readFile(locator.path, 'utf8')
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error)?.code
      if (code === 'ENOENT') return undefined
      this.log('warn', `载入 ${candidate.name} 失败：${String(error)}`)
      return undefined
    }

    options?.signal?.throwIfAborted()

    const parsed = parseFrontmatter(raw)
    if (!parsed) {
      this.log('warn', `载入 ${candidate.name}：frontmatter 无法解析`)
      return undefined
    }

    const skillName = parsed.data.name?.trim()
    const description = parsed.data.description?.trim()
    if (!skillName || !description) return undefined
    if (skillName !== candidate.name) {
      // 发现与载入之间名字漂移：返回 undefined，让注册表作废缓存并重新发现。
      this.log('warn', `载入 ${candidate.name}：名字漂移为 "${skillName}"`)
      return undefined
    }

    return /** @type {SkillDefinition} */ ({
      name: skillName,
      description,
      ...(parsed.data.whenToUse ? { whenToUse: parsed.data.whenToUse } : {}),
      invocation: readInvocation(parsed.data),
      source: 'bundled',
      provider: this.name,
      resourceBase: { kind: 'directory', path: locator.directory },
      path: locator.path,
      content: parsed.body.trim(),
    })
  }

  /**
   * 尽力而为地写日志；宿主没有 logger 时静默。
   * @param {'debug'|'info'|'warn'} level - 日志级别。
   * @param {string} message - 消息。
   */
  log(level, message) {
    const logger = this.ctx?.logger
    if (!logger) return
    try {
      const fn = typeof logger[level] === 'function' ? logger[level] : logger.info
      fn?.call(logger, `[${name}] ${message}`)
    } catch {
      /* 日志失败不能影响技能发现 */
    }
  }
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

/**
 * Cordis 插件入口。所有副作用都挂在 ctx.effect 上，随 fiber 卸载自动清理。
 *
 * 注意：本插件**不导出 Config**（那需要 @deepseek-ai/schemastery，而本包刻意零依赖）。
 * Cordis 未声明 schema 时会把原始 config 直接传进来，normalizeConfig 负责兜底校验。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {unknown} config - 插件配置。
 * @returns {void}
 */
export function apply(ctx, config) {
  const cfg = normalizeConfig(config)

  ctx.logger?.info?.(`[${name}] 注册技能提供方 "${cfg.providerName}"（rank ${cfg.rank}，目录 ${cfg.skillDir}）`)

  ctx.effect(() => {
    const disposeProvider = ctx.skills.registerProvider((_control) => new SuperpowersProvider(ctx, cfg))
    return () => {
      disposeProvider()
    }
  })
}

export default { name, inject, apply }
