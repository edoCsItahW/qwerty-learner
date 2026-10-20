import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { dictionaries } from '@/resources/dictionary'
import { currentDictInfoAtom } from '@/store'
import type { LanguageCategoryType, LanguageType } from '@/typings'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import IconUpload from '~icons/tabler/upload'

type ImportMode = 'create' | 'append'

type DictionaryMeta = {
  id: string
  name: string
  description: string
  category: string
  tags: string
  language: LanguageType
}

type Status = {
  type: 'error' | 'success'
  text: string
} | null

const LANGUAGE_OPTIONS: { value: LanguageType; label: string; category: LanguageCategoryType }[] = [
  { value: 'en', label: '英语', category: 'en' },
  { value: 'ja', label: '日语', category: 'ja' },
  { value: 'de', label: '德语', category: 'de' },
  { value: 'kk', label: '哈萨克语', category: 'kk' },
  { value: 'id', label: '印尼语', category: 'id' },
  { value: 'code', label: '代码', category: 'code' },
  { value: 'romaji', label: '日语罗马字', category: 'ja' },
  { value: 'hapin', label: '哈萨克语拼音', category: 'kk' },
]

const INITIAL_META: DictionaryMeta = {
  id: '',
  name: '',
  description: '',
  category: '个人词典',
  tags: '个人',
  language: 'en',
}

const FIELD_CLASSNAME =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'

const STATUS_CLASSNAME: Record<NonNullable<Status>['type'], string> = {
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLanguageOption(value: unknown): value is LanguageType {
  return typeof value === 'string' && LANGUAGE_OPTIONS.some((option) => option.value === value)
}

function isValidWord(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string' || !value.name.trim()) return false

  if (Array.isArray(value.trans)) {
    return value.trans.some((item) => typeof item === 'string' && item.trim().length > 0)
  }

  return typeof value.trans === 'string' && value.trans.trim().length > 0
}

function extractWordList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (isRecord(value) && Array.isArray(value.words)) return value.words
  return null
}

function getMetaValue(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export default function ImportDictionary() {
  const currentDictInfo = useAtomValue(currentDictInfoAtom)

  const [open, setOpen] = useState(false)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [mode, setMode] = useState<ImportMode>('create')
  const [sourceName, setSourceName] = useState('')
  const [words, setWords] = useState<unknown[] | null>(null)
  const [meta, setMeta] = useState<DictionaryMeta>(INITIAL_META)
  const [targetId, setTargetId] = useState(currentDictInfo.id)
  const [status, setStatus] = useState<Status>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validWordCount = useMemo(() => (words ? words.filter(isValidWord).length : 0), [words])
  const languageCategory = useMemo(
    () => LANGUAGE_OPTIONS.find((option) => option.value === meta.language)?.category ?? 'en',
    [meta.language],
  )
  const sortedDictionaries = useMemo(() => {
    const seenIds = new Set<string>()
    return dictionaries
      .filter((dictionary) => {
        if (seenIds.has(dictionary.id)) return false
        seenIds.add(dictionary.id)
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [])
  const targetDictionary = useMemo(
    () => sortedDictionaries.find((dictionary) => dictionary.id === targetId),
    [sortedDictionaries, targetId],
  )

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setApiAvailable(null)

    fetch('/__dict-api/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return false
        const data: unknown = await response.json().catch(() => null)
        return isRecord(data) && data.available === true
      })
      .then((available) => {
        if (!cancelled) setApiAvailable(available)
      })
      .catch(() => {
        if (!cancelled) setApiAvailable(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        setStatus(null)
        setTargetId((previous) => (dictionaries.some((dictionary) => dictionary.id === previous) ? previous : currentDictInfo.id))
      }
    },
    [currentDictInfo.id],
  )

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setSourceName(file.name)
    setWords(null)
    setStatus(null)

    try {
      const parsed: unknown = JSON.parse(await file.text())
      const wordList = extractWordList(parsed)
      if (!wordList) {
        throw new Error('JSON 必须是单词数组，或包含 words 数组')
      }

      const validCount = wordList.filter(isValidWord).length
      if (validCount === 0) {
        throw new Error('没有找到有效单词，请确认每项包含 name 和 trans')
      }

      const baseName = file.name.replace(/\.json$/i, '')
      const autoId = baseName
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
      const packageMeta =
        !Array.isArray(parsed) && isRecord(parsed) && isRecord(parsed.meta) ? (parsed.meta as Record<string, unknown>) : null
      const packageTags =
        packageMeta && Array.isArray(packageMeta.tags)
          ? packageMeta.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          : null

      setWords(wordList)
      setMeta((previous) => ({
        ...previous,
        id: (packageMeta && getMetaValue(packageMeta, 'id')) || autoId,
        name: (packageMeta && getMetaValue(packageMeta, 'name')) || baseName,
        description: (packageMeta && getMetaValue(packageMeta, 'description')) || previous.description,
        category: (packageMeta && getMetaValue(packageMeta, 'category')) || previous.category,
        tags: packageTags && packageTags.length > 0 ? packageTags.join(',') : previous.tags,
        language: packageMeta && isLanguageOption(packageMeta.language) ? packageMeta.language : previous.language,
      }))
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? error.message : '读取文件失败' })
    }
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!words || apiAvailable !== true || isSubmitting) return

      if (mode === 'append' && !targetDictionary) {
        setStatus({ type: 'error', text: '请选择要追加的词典' })
        return
      }

      setIsSubmitting(true)
      setStatus(null)

      const existingIds = dictionaries.map((dictionary) => dictionary.id)
      const payload =
        mode === 'create'
          ? {
              mode,
              words,
              sourceName,
              existingIds,
              meta: {
                ...meta,
                languageCategory,
                tags: meta.tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              },
            }
          : {
              mode,
              words,
              existingIds,
              targetId: targetDictionary?.id,
              targetUrl: targetDictionary?.url,
            }

      try {
        const response = await fetch('/__dict-api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data: unknown = await response.json().catch(() => null)

        if (!response.ok || !isRecord(data) || data.ok !== true) {
          throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : '导入失败')
        }

        const added = typeof data.added === 'number' ? data.added : 0
        const skipped = typeof data.skipped === 'number' ? data.skipped : 0
        const createdName =
          mode === 'create' && isRecord(data.dictionary) && typeof data.dictionary.name === 'string'
            ? data.dictionary.name
            : targetDictionary?.name

        setStatus({
          type: 'success',
          text:
            mode === 'create'
              ? `已创建词典「${createdName}」，共 ${added} 词，页面即将刷新...`
              : `已追加 ${added} 词${skipped > 0 ? `，跳过 ${skipped} 个重复词` : ''}，页面即将刷新...`,
        })

        window.setTimeout(() => window.location.reload(), 1200)
      } catch (error) {
        setStatus({ type: 'error', text: error instanceof Error ? error.message : '导入失败' })
        setIsSubmitting(false)
      }
    },
    [apiAvailable, isSubmitting, languageCategory, meta, mode, sourceName, targetDictionary, words],
  )

  const isSubmitDisabled =
    apiAvailable !== true ||
    !words ||
    isSubmitting ||
    (mode === 'create' && (!meta.id.trim() || !meta.name.trim())) ||
    (mode === 'append' && !targetDictionary)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group flex items-center space-x-2 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2.5 text-sm font-medium text-emerald-700 shadow-sm transition-all duration-200 hover:scale-105 hover:border-emerald-300 hover:from-emerald-100 hover:to-teal-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:border-emerald-800 dark:from-gray-800 dark:to-gray-700 dark:text-emerald-400 dark:hover:from-gray-700 dark:hover:to-gray-600"
        >
          <IconUpload className="h-4 w-4" />
          <span>导入词典</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] w-[42rem] max-w-[calc(100vw-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导入本地词典</DialogTitle>
          <DialogDescription>
            导入会写入 <code>public/dicts/</code> 并更新 <code>local-index.json</code>，下次启动仍然生效。该功能仅在使用
            <code className="mx-1">pnpm dev</code> 本地运行时可用。
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {apiAvailable === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              当前页面无法写回项目文件。请停止静态服务，在项目目录运行 <code>pnpm dev</code> 后通过本地地址访问，再使用导入功能。
            </div>
          )}

          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-sm transition ${
              apiAvailable === false
                ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-800 dark:text-slate-600'
                : 'border-indigo-200 bg-indigo-50/60 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:border-indigo-700'
            }`}
          >
            <IconUpload className="h-5 w-5" />
            <span>{words ? `已选择：${sourceName}` : '选择词典 JSON 文件'}</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={apiAvailable === false || isSubmitting}
              onChange={handleFileChange}
            />
          </label>

          {words && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              已读取 {validWordCount} 个有效单词（原始 {words.length} 项），重复和无效项会自动忽略。
            </p>
          )}

          <div className="flex gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                mode === 'create'
                  ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              新建词典
            </button>
            <button
              type="button"
              onClick={() => setMode('append')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                mode === 'append'
                  ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              追加到已有词典
            </button>
          </div>

          {mode === 'create' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>词典 ID（英文、数字、下划线、短横线）</span>
                <input
                  className={FIELD_CLASSNAME}
                  value={meta.id}
                  onChange={(event) => setMeta((previous) => ({ ...previous, id: event.target.value }))}
                  placeholder="my_dict"
                  required
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>显示名称</span>
                <input
                  className={FIELD_CLASSNAME}
                  value={meta.name}
                  onChange={(event) => setMeta((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="我的词典"
                  required
                />
              </label>
              <label className="col-span-full flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>描述</span>
                <input
                  className={FIELD_CLASSNAME}
                  value={meta.description}
                  onChange={(event) => setMeta((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder="可选"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>分类</span>
                <input
                  className={FIELD_CLASSNAME}
                  value={meta.category}
                  onChange={(event) => setMeta((previous) => ({ ...previous, category: event.target.value }))}
                  placeholder="个人词典"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>标签（逗号分隔）</span>
                <input
                  className={FIELD_CLASSNAME}
                  value={meta.tags}
                  onChange={(event) => setMeta((previous) => ({ ...previous, tags: event.target.value }))}
                  placeholder="个人, CET4"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>语言</span>
                <select
                  className={FIELD_CLASSNAME}
                  value={meta.language}
                  onChange={(event) => setMeta((previous) => ({ ...previous, language: event.target.value as LanguageType }))}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>目标词典</span>
                <select
                  className={FIELD_CLASSNAME}
                  value={targetDictionary?.id ?? ''}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  {sortedDictionaries.map((dictionary) => (
                    <option key={dictionary.id} value={dictionary.id}>
                      {dictionary.name}（{dictionary.length} 词）
                    </option>
                  ))}
                </select>
              </label>
              {targetDictionary && (
                <p className="break-all text-xs text-slate-500 dark:text-slate-400">
                  写入文件：<code>{targetDictionary.url}</code>
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">按单词名去重，已存在的单词会跳过；总数和章节数会同步更新。</p>
            </div>
          )}

          {status && (
            <div className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${STATUS_CLASSNAME[status.type]}`}>{status.text}</div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isSubmitting ? '写入中...' : '开始导入'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
