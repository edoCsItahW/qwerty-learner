/* eslint-disable react/prop-types */
import { LoadingWordUI } from '../LoadingWordUI'
import useGetWord from '../hooks/useGetWord'
import { currentRowDetailAtom } from '../store'
import type { groupedWordRecords } from '../type'
import DataTag from './DataTag'
import RowPagination from './RowPagination'
import type { WordPronunciationIconRef } from '@/components/WordPronunciationIcon'
import { WordPronunciationIcon } from '@/components/WordPronunciationIcon'
import { EXPLICIT_SPACE } from '@/constants'
import Phonetic from '@/pages/Typing/components/WordPanel/components/Phonetic'
import Letter from '@/pages/Typing/components/WordPanel/components/Word/Letter'
import { useFitFontSize } from '@/pages/Typing/components/WordPanel/components/Word/useFitFontSize'
import { idDictionaryMap } from '@/resources/dictionary'
import { fontSizeConfigAtom } from '@/store'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useMemo, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import HashtagIcon from '~icons/heroicons/chart-pie-20-solid'
import CheckCircle from '~icons/heroicons/check-circle-20-solid'
import ClockIcon from '~icons/heroicons/clock-20-solid'
import XCircle from '~icons/heroicons/x-circle-20-solid'
import IconX from '~icons/tabler/x'

type RowDetailProps = {
  currentRowDetail: groupedWordRecords
  allRecords: groupedWordRecords[]
}

const RowDetail: React.FC<RowDetailProps> = ({ currentRowDetail, allRecords }) => {
  const setCurrentRowDetail = useSetAtom(currentRowDetailAtom)

  const dictInfo = idDictionaryMap[currentRowDetail.dict]
  const { word, isLoading, hasError } = useGetWord(currentRowDetail.word, dictInfo)
  const wordPronunciationIconRef = useRef<WordPronunciationIconRef>(null)

  const baseForeignFontSize = useAtomValue(fontSizeConfigAtom).foreignFont
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // 将空格显示为 ␣，既与练习页一致，也能让按空格分组后的宽度保持稳定
  const displayWord = useMemo(() => currentRowDetail.word.replace(/ /g, EXPLICIT_SPACE), [currentRowDetail.word])
  const fittedFontSize = useFitFontSize(viewportRef, measureRef, contentRef, baseForeignFontSize, displayWord)

  const letterGroups = useMemo(() => {
    const groups: { letter: string; index: number }[][] = []
    let currentGroup: { letter: string; index: number }[] = []

    displayWord.split('').forEach((letter, index) => {
      currentGroup.push({ letter, index })
      if (letter === EXPLICIT_SPACE) {
        groups.push(currentGroup)
        currentGroup = []
      }
    })
    if (currentGroup.length > 0) groups.push(currentGroup)

    return groups
  }, [displayWord])

  const rowDetailData: RowDetailData = useMemo(() => {
    const time =
      currentRowDetail.records.length > 0
        ? currentRowDetail.records.reduce((acc, cur) => acc + cur.totalTime, 0) / currentRowDetail.records.length
        : 0
    const timeStr = (time / 1000).toFixed(2)
    const correctCount = currentRowDetail.records.length
    const wrongCount = currentRowDetail.wrongCount
    const sumCount = correctCount + wrongCount
    return { time: timeStr, sumCount, correctCount, wrongCount }
  }, [currentRowDetail.records, currentRowDetail.wrongCount])

  const onClose = useCallback(() => {
    setCurrentRowDetail(null)
  }, [setCurrentRowDetail])

  useHotkeys(
    'esc',
    (e) => {
      onClose()
      e.stopPropagation()
    },
    { preventDefault: true },
  )

  useHotkeys(
    'ctrl+j',
    () => {
      wordPronunciationIconRef.current?.play()
    },
    [],
    { enableOnFormTags: true, preventDefault: true },
  )

  return (
    <div className="absolute inset-0 flex  flex-col items-center  justify-center ">
      <div className="my-card relative z-10 flex h-[32rem] w-[32rem] max-w-[calc(100vw-2rem)] select-text flex-col items-center justify-around rounded-2xl bg-white px-3 py-10 dark:bg-gray-900">
        <IconX className="absolute right-3 top-3  h-6 w-6 cursor-pointer text-gray-400" onClick={onClose} />
        <div className="flex w-full flex-col items-center justify-start">
          <div ref={viewportRef} className="relative flex w-full justify-center">
            <div className="relative w-fit max-w-full">
              <div ref={contentRef} className="flex max-w-full flex-wrap items-center justify-center gap-y-1">
                {letterGroups.map((group, groupIndex) => (
                  <span key={`group-${groupIndex}`} className="flex min-w-0 max-w-full flex-wrap items-center justify-center">
                    {group.map(({ letter, index }) => (
                      <Letter key={`${index}-${letter}`} letter={letter} visible state="normal" fontSize={fittedFontSize} />
                    ))}
                  </span>
                ))}
              </div>
              <div className="pointer-events-none invisible absolute inset-0 overflow-hidden" aria-hidden="true">
                <div
                  ref={measureRef}
                  className="flex w-max items-center whitespace-nowrap leading-normal"
                  style={{ fontSize: `${baseForeignFontSize}px` }}
                >
                  {letterGroups.map((group, groupIndex) => (
                    <span key={`measure-group-${groupIndex}`} className="flex items-center">
                      {group.map(({ letter, index }) => (
                        <Letter key={`measure-${index}-${letter}`} letter={letter} visible fontSize={baseForeignFontSize} />
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="relative flex h-8 items-center">
            {word ? <Phonetic word={word} /> : <LoadingWordUI isLoading={isLoading} hasError={hasError} />}
            {word && (
              <WordPronunciationIcon
                lang={dictInfo.language}
                word={word}
                className="absolute -right-7 top-1/2 h-5 w-5 -translate-y-1/2 transform "
                ref={wordPronunciationIconRef}
              />
            )}
          </div>
          <div className="flex max-w-[24rem] items-center">
            <span
              className={`max-w-full break-words text-center font-sans transition-colors duration-300 dark:text-white dark:text-opacity-80`}
            >
              {word ? word.trans.join('；') : <LoadingWordUI isLoading={isLoading} hasError={hasError} />}
            </span>
          </div>
        </div>
        <div className="item flex flex-col gap-4">
          <div className="flex gap-6">
            <DataTag icon={ClockIcon} name="平均用时" data={rowDetailData.time} />
            <DataTag icon={HashtagIcon} name="练习次数" data={rowDetailData.sumCount} />
          </div>
          <div className="flex gap-6">
            <DataTag icon={CheckCircle} name="正确次数" data={rowDetailData.correctCount} />
            <DataTag icon={XCircle} name="错误次数" data={rowDetailData.wrongCount} />
          </div>
        </div>
        <RowPagination className="absolute bottom-6 mt-10" allRecords={allRecords} />
      </div>
      <div className="absolute inset-0 z-0  cursor-pointer bg-transparent" onClick={onClose}></div>
    </div>
  )
}

type RowDetailData = {
  time: string
  sumCount: number
  correctCount: number
  wrongCount: number
}

export default RowDetail
