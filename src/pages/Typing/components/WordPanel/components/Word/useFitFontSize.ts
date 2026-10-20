import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/** 长句最多占用多少行，超过后自动缩小字号 */
const MAX_LINES = 3
/** 预留换行余量，避免单词边界导致实际行数超出预期 */
const LINE_WIDTH_SLACK = 0.92
/** 字号下限，保证再长的句子也尽量可读 */
const MIN_FONT_SIZE = 20
/** 与 leading-normal 保持一致 */
const LINE_HEIGHT = 1.5
/** 实际排版超过目标行数时，每次缩小的比例 */
const LINE_OVERFLOW_SHRINK_STEP = 0.94

/**
 * 根据可视宽度和句子长度自动计算外语字号。
 *
 * 短单词保持用户设置的字号；长句子在不超出可视宽度、
 * 且大致不超过 {@link MAX_LINES} 行的前提下等比缩小。
 */
export function useFitFontSize(
  viewportRef: RefObject<HTMLElement>,
  measureRef: RefObject<HTMLElement>,
  contentRef: RefObject<HTMLElement>,
  baseFontSize: number,
  contentKey: string,
) {
  const [fontSize, setFontSize] = useState(baseFontSize)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const measure = measureRef.current
    if (!viewport || !measure) {
      setFontSize(baseFontSize)
      return
    }

    const fit = () => {
      const availableWidth = viewport.clientWidth
      const naturalWidth = measure.getBoundingClientRect().width
      if (availableWidth <= 0 || naturalWidth <= 0) return

      const linesAtBaseSize = Math.max(1, Math.ceil(naturalWidth / availableWidth))
      const targetLines = Math.min(linesAtBaseSize, MAX_LINES)

      // 按宽度计算：让内容有机会在 targetLines 行内排下
      const widthLimit = (baseFontSize * availableWidth * targetLines * LINE_WIDTH_SLACK) / naturalWidth

      // 按高度计算：避免字号过大时单词区域把页面撑出窗口
      const maxWordHeight = Math.max(140, window.innerHeight * 0.4)
      const heightLimit = maxWordHeight / (targetLines * LINE_HEIGHT)

      const nextFontSize = Math.max(MIN_FONT_SIZE, Math.min(baseFontSize, widthLimit, heightLimit))
      const rounded = Math.floor(nextFontSize)
      setFontSize((prev) => (prev === rounded ? prev : rounded))
    }

    fit()
    const resizeObserver = new ResizeObserver(fit)
    resizeObserver.observe(viewport)
    window.addEventListener('resize', fit)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [baseFontSize, contentKey, measureRef, viewportRef])

  // 按宽度估算仍可能因单词边界多出一行，这里用实际排版结果再收缩一次
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const measure = measureRef.current
    const content = contentRef.current
    if (!viewport || !measure || !content) return

    const availableWidth = viewport.clientWidth
    const naturalWidth = measure.getBoundingClientRect().width
    if (availableWidth <= 0 || naturalWidth <= 0) return

    const targetLines = Math.min(Math.max(1, Math.ceil(naturalWidth / availableWidth)), MAX_LINES)
    const lineTops = new Set(Array.from(content.children).map((child) => Math.round((child as HTMLElement).getBoundingClientRect().top)))

    if (lineTops.size > targetLines && fontSize > MIN_FONT_SIZE) {
      const nextFontSize = Math.max(MIN_FONT_SIZE, Math.floor(fontSize * LINE_OVERFLOW_SHRINK_STEP))
      if (nextFontSize < fontSize) setFontSize(nextFontSize)
    }
  }, [contentKey, contentRef, fontSize, measureRef, viewportRef])

  return fontSize
}
