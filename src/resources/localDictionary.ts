import { dictionaries, dictionaryResources, idDictionaryMap } from './dictionary'
import type { Dictionary, DictionaryResource, LanguageCategoryType, LanguageType } from '@/typings'
import { calcChapterCount } from '@/utils'

/**
 * 运行时本地词典索引。
 *
 * 该文件位于 public/dicts/local-index.json，由前端在应用启动前读取，
 * 因此新增/追加的词典不需要修改 src/resources/dictionary.ts，也不需要重新构建。
 */
type LanguageMeta = {
  language: LanguageType
  languageCategory: LanguageCategoryType
}

const URL_PREFIX = REACT_APP_DEPLOY_ENV === 'pages' ? '/qwerty-learner' : ''
const LOCAL_INDEX_URL = `${URL_PREFIX}/dicts/local-index.json`
const FETCH_TIMEOUT = 2500
const DICT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const RESERVED_DICT_IDS = new Set(['local-index', '__proto__', 'prototype', 'constructor'])

const LANGUAGE_CATEGORY_BY_LANGUAGE: Record<LanguageType, LanguageCategoryType> = {
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

const LANGUAGE_SET = new Set<string>(Object.keys(LANGUAGE_CATEGORY_BY_LANGUAGE))
const LANGUAGE_CATEGORY_SET = new Set<string>(Object.values(LANGUAGE_CATEGORY_BY_LANGUAGE))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLanguage(value: unknown): value is LanguageType {
  return typeof value === 'string' && LANGUAGE_SET.has(value)
}

function isLanguageCategory(value: unknown): value is LanguageCategoryType {
  return typeof value === 'string' && LANGUAGE_CATEGORY_SET.has(value)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function getLanguageMeta(value: Record<string, unknown>): LanguageMeta {
  const language = isLanguage(value.language) ? value.language : 'en'
  const languageCategory = isLanguageCategory(value.languageCategory) ? value.languageCategory : LANGUAGE_CATEGORY_BY_LANGUAGE[language]

  return { language, languageCategory }
}

function normalizeResource(raw: unknown): DictionaryResource | null {
  if (!isRecord(raw)) return null

  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''

  if (!id || !DICT_ID_PATTERN.test(id) || RESERVED_DICT_IDS.has(id)) return null
  if (!url.startsWith('/dicts/') || !url.endsWith('.json') || url.includes('..') || url.includes('\\')) return null

  const { language, languageCategory } = getLanguageMeta(raw)
  const lengthValue = typeof raw.length === 'number' ? raw.length : Number(raw.length)
  const length = Number.isFinite(lengthValue) ? Math.max(0, Math.floor(lengthValue)) : 0
  const tags = Array.from(new Set(asStringArray(raw.tags)))

  const resource: DictionaryResource = {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : '个人词典',
    tags: tags.length > 0 ? tags : ['个人'],
    url,
    length,
    language,
    languageCategory,
  }

  if (typeof raw.defaultPronIndex === 'number' && Number.isFinite(raw.defaultPronIndex)) {
    resource.defaultPronIndex = raw.defaultPronIndex
  }

  return resource
}

function applyLengthOverride(id: string, rawLength: unknown) {
  const length = typeof rawLength === 'number' ? rawLength : Number(rawLength)
  if (!Number.isFinite(length) || length < 0) return

  const dictionary = idDictionaryMap[id]
  if (!dictionary) return

  dictionary.length = Math.floor(length)
  dictionary.chapterCount = calcChapterCount(dictionary.length)

  const resource = dictionaryResources.find((item) => item.id === id)
  if (resource) resource.length = dictionary.length
}

/**
 * 将 public/dicts/local-index.json 的内容合并进内置词典列表。
 * 必须在 React 渲染前调用，避免 currentDictId 因找不到自定义词典而被重置。
 */
export function applyLocalDictionaryIndex(rawIndex: unknown) {
  if (!isRecord(rawIndex)) return

  if (Array.isArray(rawIndex.dictionaries)) {
    const localIds = new Set<string>()

    for (const rawDictionary of rawIndex.dictionaries) {
      const resource = normalizeResource(rawDictionary)
      if (!resource || localIds.has(resource.id)) continue
      localIds.add(resource.id)
      // 内置词典优先，避免本地索引意外覆盖内置数据
      if (idDictionaryMap[resource.id]) continue

      const dictionary: Dictionary = {
        ...resource,
        chapterCount: calcChapterCount(resource.length),
      }

      dictionaryResources.push(resource)
      dictionaries.push(dictionary)
      idDictionaryMap[dictionary.id] = dictionary
    }
  }

  if (isRecord(rawIndex.lengthOverrides)) {
    Object.entries(rawIndex.lengthOverrides).forEach(([id, length]) => applyLengthOverride(id, length))
  }
}

/**
 * 读取本地词典索引。索引文件不存在或损坏时不影响应用启动。
 */
export async function loadLocalDictionaryIndex(): Promise<void> {
  if (typeof fetch !== 'function') return

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timeoutId =
    controller !== undefined && typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), FETCH_TIMEOUT) : undefined

  try {
    const response = await fetch(LOCAL_INDEX_URL, { cache: 'no-store', signal: controller?.signal })
    if (!response.ok) return

    applyLocalDictionaryIndex(await response.json())
  } catch (error) {
    // 静态部署或索引还没创建时静默降级
    if ((error as Error)?.name !== 'AbortError') {
      console.warn('[local-dictionary] 读取本地词典索引失败，已跳过', error)
    }
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}
