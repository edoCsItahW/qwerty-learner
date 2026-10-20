import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

const API_PREFIX = '/__dict-api'
const MAX_BODY_SIZE = 50 * 1024 * 1024
const DICT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const DICT_URL_PATTERN = /^\/dicts\/([a-zA-Z0-9_.-]+\.json)$/
const RESERVED_DICT_IDS = new Set(['local-index', '__proto__', 'prototype', 'constructor'])

const LANGUAGE_CATEGORY_BY_LANGUAGE: Record<string, string> = {
  en: 'en',
  ja: 'ja',
  de: 'de',
  kk: 'kk',
  id: 'id',
  code: 'code',
  romaji: 'ja',
  hapin: 'kk',
  zh: 'en',
}
const LANGUAGE_CATEGORY_SET = new Set(Object.values(LANGUAGE_CATEGORY_BY_LANGUAGE))

type Word = {
  name: string
  trans: string[]
  usphone: string
  ukphone: string
  notation?: string
}

type DictionaryResource = {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  url: string
  length: number
  language: string
  languageCategory: string
  defaultPronIndex?: number
}

type LocalIndex = {
  dictionaries: DictionaryResource[]
  lengthOverrides: Record<string, number>
}

class HttpError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'])
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) {
      reject(new HttpError('文件过大，最大支持 50MB', 413))
      return
    }

    let size = 0
    let settled = false
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        settled = true
        reject(new HttpError('文件过大，最大支持 50MB', 413))
        req.resume()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new HttpError('不是有效的 JSON 文件'))
      }
    })

    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function normalizeWord(raw: unknown): Word | null {
  if (!isRecord(raw)) return null

  const name = asString(raw.name)
  if (!name) return null

  let trans: string[] = []
  if (Array.isArray(raw.trans)) {
    trans = raw.trans.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  } else if (typeof raw.trans === 'string' && raw.trans.trim()) {
    trans = [raw.trans.trim()]
  }
  if (trans.length === 0) return null

  const word: Word = {
    name,
    trans,
    usphone: asString(raw.usphone),
    ukphone: asString(raw.ukphone),
  }

  const notation = asString(raw.notation)
  if (notation) word.notation = notation

  return word
}

function normalizeWords(input: unknown): Word[] {
  const list = Array.isArray(input) ? input : isRecord(input) && Array.isArray(input.words) ? input.words : null
  if (!list) {
    throw new HttpError('词库内容必须是 JSON 数组，或包含 words 数组')
  }

  const words: Word[] = []
  const seenNames = new Set<string>()

  for (const item of list) {
    const word = normalizeWord(item)
    if (!word || seenNames.has(word.name)) continue
    seenNames.add(word.name)
    words.push(word)
  }

  if (words.length === 0) {
    throw new HttpError('没有找到有效单词，请确认每项包含 name 和 trans')
  }

  return words
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function resolveDictionaryFile(publicDir: string, url: string): string {
  const match = DICT_URL_PATTERN.exec(url.trim())
  if (!match || match[1] === 'local-index.json') {
    throw new HttpError('非法的词典文件路径')
  }
  return path.join(publicDir, 'dicts', match[1])
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readWords(filePath: string): Promise<unknown[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    throw new HttpError('目标词典文件不存在或不是有效的 JSON', 404)
  }

  if (Array.isArray(parsed)) return parsed
  if (isRecord(parsed) && Array.isArray(parsed.words)) return parsed.words
  throw new HttpError('目标词典格式不正确')
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const content = `${JSON.stringify(data, null, 4)}\n`
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`

  await fs.writeFile(tempFile, content, 'utf8')
  try {
    await fs.rename(tempFile, filePath)
  } catch {
    // Windows 下目标文件被占用时 rename 可能失败，降级为直接覆盖
    await fs.writeFile(filePath, content, 'utf8')
    await fs.rm(tempFile, { force: true })
  }
}

function createEmptyIndex(): LocalIndex {
  return { dictionaries: [], lengthOverrides: {} }
}

async function readLocalIndex(filePath: string): Promise<LocalIndex> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    if (!isRecord(parsed)) return createEmptyIndex()

    const dictionaries = Array.isArray(parsed.dictionaries)
      ? parsed.dictionaries.filter((item): item is DictionaryResource => isRecord(item) && typeof item.id === 'string')
      : []

    const lengthOverrides: Record<string, number> = {}
    if (isRecord(parsed.lengthOverrides)) {
      Object.entries(parsed.lengthOverrides).forEach(([id, value]) => {
        const length = typeof value === 'number' ? value : Number(value)
        if (Number.isFinite(length) && length >= 0) {
          lengthOverrides[id] = Math.floor(length)
        }
      })
    }

    return { dictionaries, lengthOverrides }
  } catch {
    return createEmptyIndex()
  }
}

async function createDictionary(body: Record<string, unknown>, publicDir: string) {
  const words = normalizeWords(body.words)
  const meta = isRecord(body.meta) ? body.meta : {}
  const sourceName = asString(body.sourceName)
  const rawId = asString(meta.id) || sourceName.replace(/\.json$/i, '')
  const id = sanitizeId(rawId)

  if (!id || !DICT_ID_PATTERN.test(id) || RESERVED_DICT_IDS.has(id)) {
    throw new HttpError('词典 ID 不合法，只能包含字母、数字、下划线和短横线，且不能使用保留名称')
  }

  const existingIds = new Set(asStringArray(body.existingIds))
  if (existingIds.has(id)) {
    throw new HttpError(`词典 ID「${id}」已存在，请换一个 ID 或使用“追加到已有词典”`, 409)
  }

  const indexFile = path.join(publicDir, 'dicts', 'local-index.json')
  const index = await readLocalIndex(indexFile)
  if (index.dictionaries.some((dictionary) => dictionary.id === id)) {
    throw new HttpError(`词典 ID「${id}」已存在，请换一个 ID 或使用“追加到已有词典”`, 409)
  }

  const targetFile = path.join(publicDir, 'dicts', `${id}.json`)
  if (await fileExists(targetFile)) {
    throw new HttpError(`public/dicts/${id}.json 已存在，请换一个 ID`, 409)
  }

  const language = asString(meta.language)
  const languageValue = LANGUAGE_CATEGORY_BY_LANGUAGE[language] ? language : 'en'
  const requestedLanguageCategory = asString(meta.languageCategory)
  const languageCategoryValue = LANGUAGE_CATEGORY_SET.has(requestedLanguageCategory)
    ? requestedLanguageCategory
    : LANGUAGE_CATEGORY_BY_LANGUAGE[languageValue]
  const tags = Array.from(new Set(asStringArray(meta.tags)))

  const resource: DictionaryResource = {
    id,
    name: asString(meta.name) || id,
    description: asString(meta.description),
    category: asString(meta.category) || '个人词典',
    tags: tags.length > 0 ? tags : ['个人'],
    url: `/dicts/${id}.json`,
    length: words.length,
    language: languageValue,
    languageCategory: languageCategoryValue,
  }

  await writeJsonFile(targetFile, words)
  index.dictionaries.push(resource)
  await writeJsonFile(indexFile, index)

  return {
    dictionary: resource,
    added: words.length,
    skipped: 0,
  }
}

async function appendDictionary(body: Record<string, unknown>, publicDir: string) {
  const words = normalizeWords(body.words)
  const targetId = asString(body.targetId)
  if (!targetId) throw new HttpError('缺少目标词典 ID')

  const indexFile = path.join(publicDir, 'dicts', 'local-index.json')
  const index = await readLocalIndex(indexFile)
  const localDictionary = index.dictionaries.find((dictionary) => dictionary.id === targetId)
  const targetUrl = asString(body.targetUrl) || localDictionary?.url

  if (!targetUrl) throw new HttpError('缺少目标词典文件路径')

  const targetFile = resolveDictionaryFile(publicDir, targetUrl)
  const existingWords = await readWords(targetFile)
  const existingNames = new Set(
    existingWords
      .filter(isRecord)
      .map((word) => asString(word.name))
      .filter(Boolean),
  )
  const wordsToAppend = words.filter((word) => !existingNames.has(word.name))

  if (wordsToAppend.length > 0) {
    await writeJsonFile(targetFile, [...existingWords, ...wordsToAppend])
  }

  const length = existingWords.length + wordsToAppend.length
  if (localDictionary) {
    localDictionary.length = length
    delete index.lengthOverrides[targetId]
  } else {
    index.lengthOverrides[targetId] = length
  }
  await writeJsonFile(indexFile, index)

  return {
    id: targetId,
    length,
    added: wordsToAppend.length,
    skipped: words.length - wordsToAppend.length,
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, publicDir: string): Promise<void> {
  const pathname = (req.url ?? '').split('?')[0]

  if (pathname === `${API_PREFIX}/status`) {
    if (req.method !== 'GET') throw new HttpError('不支持的请求方法', 405)
    sendJson(res, 200, { available: true })
    return
  }

  if (pathname === `${API_PREFIX}/import`) {
    if (req.method !== 'POST') throw new HttpError('不支持的请求方法', 405)
    if (!publicDir) throw new HttpError('当前项目没有配置 public 目录', 500)
    if (!req.headers['content-type']?.includes('application/json')) {
      throw new HttpError('请求内容必须是 application/json', 415)
    }

    const body = await readJsonBody(req)
    if (!isRecord(body)) throw new HttpError('请求内容格式错误')

    const result = body.mode === 'append' ? await appendDictionary(body, publicDir) : await createDictionary(body, publicDir)
    sendJson(res, 200, { ok: true, ...result })
    return
  }

  sendJson(res, 404, { ok: false, error: '未知接口' })
}

/**
 * 本地开发服务器写回接口。
 *
 * 浏览器无法直接写入项目文件，因此由 Vite dev server 暴露一个仅本机使用的 API：
 * - POST /__dict-api/import  { mode: 'create' | 'append', words, meta?, targetId?, targetUrl? }
 *
 * 注意：只在 `pnpm dev` 下可用，生产静态部署无法写回文件。
 */
export default function localDictionaryApi(): Plugin {
  return {
    name: 'qwerty-local-dictionary-api',
    apply: 'serve',
    configureServer(server) {
      const publicDir = server.config.publicDir

      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (!pathname.startsWith(`${API_PREFIX}/`)) {
          next()
          return
        }

        handleRequest(req, res, publicDir).catch((error: unknown) => {
          if (res.writableEnded) return

          if (error instanceof HttpError) {
            sendJson(res, error.status, { ok: false, error: error.message })
            return
          }

          console.error('[local-dictionary-api]', error)
          sendJson(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : '写入词典失败',
          })
        })
      })
    },
  }
}
