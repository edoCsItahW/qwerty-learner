import type { WordUpdateAction } from '../InputHandler'
import InputHandler from '../InputHandler'
import Letter from './Letter'
import Notation from './Notation'
import { TipAlert } from './TipAlert'
import style from './index.module.css'
import { initialWordState } from './type'
import type { WordState } from './type'
import { useFitFontSize } from './useFitFontSize'
import Tooltip from '@/components/Tooltip'
import type { WordPronunciationIconRef } from '@/components/WordPronunciationIcon'
import { WordPronunciationIcon } from '@/components/WordPronunciationIcon'
import { EXPLICIT_SPACE } from '@/constants'
import useKeySounds from '@/hooks/useKeySounds'
import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import {
  currentChapterAtom,
  currentDictInfoAtom,
  fontSizeConfigAtom,
  isIgnoreCaseAtom,
  isPhoneticHintVisibleAtom,
  isRejectWrongCharAtom,
  isShowAnswerOnHoverAtom,
  isTextSelectableAtom,
  pronunciationIsOpenAtom,
  wordDictationConfigAtom,
} from '@/store'
import type { Word } from '@/typings'
import { CTRL, getUtcStringForMixpanel } from '@/utils'
import { useSaveWordRecord } from '@/utils/db'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useImmer } from 'use-immer'

const vowelLetters = ['A', 'E', 'I', 'O', 'U']
const LETTER_PATTERN = /^\p{L}$/u

/** 判断单个字符是否是字母（含中文、日文、德文等 Unicode 字母） */
const isLetterChar = (char: string | undefined): boolean => char !== undefined && LETTER_PATTERN.test(char)

export default function WordComponent({ word, onFinish }: { word: Word; onFinish: () => void }) {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const [wordState, setWordState] = useImmer<WordState>(structuredClone(initialWordState))

  const baseForeignFontSize = useAtomValue(fontSizeConfigAtom).foreignFont
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // 长句自动缩小字号，短单词保持用户设置的字号
  const fittedFontSize = useFitFontSize(viewportRef, measureRef, contentRef, baseForeignFontSize, wordState.displayWord)

  // 按空格分组：换行只发生在单词之间，避免把单词从中间截断
  const letterGroups = useMemo(() => {
    const groups: { letter: string; index: number }[][] = []
    let currentGroup: { letter: string; index: number }[] = []

    wordState.displayWord.split('').forEach((letter, index) => {
      currentGroup.push({ letter, index })
      if (letter === EXPLICIT_SPACE) {
        groups.push(currentGroup)
        currentGroup = []
      }
    })
    if (currentGroup.length > 0) groups.push(currentGroup)

    return groups
  }, [wordState.displayWord])

  const wordDictationConfig = useAtomValue(wordDictationConfigAtom)
  // 以中记英（看中文写英文）：只给中文释义默写英文，音标默认隐藏，按住快捷键才显示并朗读
  const isZhToEnMode = wordDictationConfig.isOpen && wordDictationConfig.type === 'zhToEn'
  const setIsPhoneticHintVisible = useSetAtom(isPhoneticHintVisibleAtom)
  const isTextSelectable = useAtomValue(isTextSelectableAtom)
  const isIgnoreCase = useAtomValue(isIgnoreCaseAtom)
  const isRejectWrongChar = useAtomValue(isRejectWrongCharAtom)
  const isShowAnswerOnHover = useAtomValue(isShowAnswerOnHoverAtom)
  const saveWordRecord = useSaveWordRecord()
  // const wordLogUploader = useMixPanelWordLogUploader(state)
  const [playKeySound, playBeepSound, playHintSound] = useKeySounds()
  const pronunciationIsOpen = useAtomValue(pronunciationIsOpenAtom)
  const [isHoveringWord, setIsHoveringWord] = useState(false)
  const currentLanguage = useAtomValue(currentDictInfoAtom).language
  const currentLanguageCategory = useAtomValue(currentDictInfoAtom).languageCategory
  const currentChapter = useAtomValue(currentChapterAtom)

  const [showTipAlert, setShowTipAlert] = useState(false)
  const wordPronunciationIconRef = useRef<WordPronunciationIconRef>(null)

  useEffect(() => {
    // run only when word changes
    let headword = ''
    try {
      headword = word.name.replace(new RegExp(' ', 'g'), EXPLICIT_SPACE)
      headword = headword.replace(new RegExp('…', 'g'), '..')
    } catch (e) {
      console.error('word.name is not a string', word)
      headword = ''
    }

    const newWordState = structuredClone(initialWordState)
    newWordState.displayWord = headword
    newWordState.letterStates = new Array(headword.length).fill('normal')
    newWordState.startTime = getUtcStringForMixpanel()
    newWordState.randomLetterVisible = headword.split('').map(() => Math.random() > 0.4)
    setWordState(newWordState)
    // 换单词时收起音标提示，避免提示残留到下一个单词
    setIsPhoneticHintVisible(false)
  }, [word, setWordState, setIsPhoneticHintVisible])

  useEffect(() => {
    // 离开练习页时收起音标提示
    return () => setIsPhoneticHintVisible(false)
  }, [setIsPhoneticHintVisible])

  const updateInput = useCallback(
    (updateAction: WordUpdateAction) => {
      switch (updateAction.type) {
        case 'add':
          if (wordState.hasWrong) return

          if (updateAction.value === ' ') {
            updateAction.event.preventDefault()
            setWordState((state) => {
              state.inputWord = state.inputWord + EXPLICIT_SPACE
              state.suppressValidationUntilNextInput = false
            })
          } else {
            setWordState((state) => {
              state.inputWord = state.inputWord + updateAction.value
              state.suppressValidationUntilNextInput = false
            })
          }
          break

        default:
          console.warn('unknown update type', updateAction)
      }
    },
    [wordState.hasWrong, setWordState],
  )

  const handleHoverWord = useCallback((checked: boolean) => {
    setIsHoveringWord(checked)
  }, [])

  useHotkeys(
    'tab',
    () => {
      handleHoverWord(true)
    },
    { enableOnFormTags: true, preventDefault: true },
    [],
  )

  useHotkeys(
    'tab',
    () => {
      handleHoverWord(false)
    },
    { enableOnFormTags: true, keyup: true, preventDefault: true },
    [],
  )
  useHotkeys(
    'ctrl+j',
    (e) => {
      // 长按会重复触发 keydown，避免读音被反复打断
      if (e.repeat) return
      // 以中记英模式下，按住快捷键同时展示音标
      if (isZhToEnMode) {
        setIsPhoneticHintVisible(true)
      }
      if (state.isTyping) {
        wordPronunciationIconRef.current?.play()
      }
    },
    [state.isTyping, isZhToEnMode, setIsPhoneticHintVisible],
    { enableOnFormTags: true, preventDefault: true },
  )

  useHotkeys(
    'ctrl+j',
    () => {
      if (isZhToEnMode) {
        setIsPhoneticHintVisible(false)
      }
    },
    { enableOnFormTags: true, keyup: true, preventDefault: true },
    [isZhToEnMode, setIsPhoneticHintVisible],
  )

  useEffect(() => {
    // 以中记英模式下不自动朗读，否则等于直接给出读音提示
    if (isZhToEnMode) return

    if (wordState.inputWord.length === 0 && state.isTyping) {
      wordPronunciationIconRef.current?.play && wordPronunciationIconRef.current?.play()
    }
  }, [state.isTyping, wordState.inputWord.length, isZhToEnMode, wordPronunciationIconRef.current?.play])

  const getLetterVisible = useCallback(
    (index: number) => {
      const char = wordState.displayWord[index]
      // 非字母内容（标点、空格、下划线等）始终直接显示，不参与默写隐藏
      if (char !== undefined && !isLetterChar(char)) return true
      if (wordState.letterStates[index] === 'correct' || (isShowAnswerOnHover && isHoveringWord)) return true

      if (wordDictationConfig.isOpen) {
        // 以中记英与全部隐藏一样，默认不展示任何字母，仅凭鼠标悬停或输入来揭示
        if (wordDictationConfig.type === 'hideAll' || wordDictationConfig.type === 'zhToEn') return false

        const letter = wordState.displayWord[index]
        if (wordDictationConfig.type === 'hideVowel') {
          return vowelLetters.includes(letter.toUpperCase()) ? false : true
        }
        if (wordDictationConfig.type === 'hideConsonant') {
          return vowelLetters.includes(letter.toUpperCase()) ? true : false
        }
        if (wordDictationConfig.type === 'randomHide') {
          return wordState.randomLetterVisible[index]
        }
      }
      return true
    },
    [
      isHoveringWord,
      isShowAnswerOnHover,
      wordDictationConfig.isOpen,
      wordDictationConfig.type,
      wordState.displayWord,
      wordState.letterStates,
      wordState.randomLetterVisible,
    ],
  )

  useEffect(() => {
    const inputLength = wordState.inputWord.length
    /**
     * TODO: 当用户输入错误时，会报错
     * Cannot update a component (`App`) while rendering a different component (`WordComponent`). To locate the bad setState() call inside `WordComponent`, follow the stack trace as described in https://reactjs.org/link/setstate-in-render
     * 目前不影响生产环境，猜测是因为开发环境下 react 会两次调用 useEffect 从而展示了这个 warning
     * 但这终究是一个 bug，需要修复
     */
    if (wordState.hasWrong || wordState.suppressValidationUntilNextInput || inputLength === 0 || wordState.displayWord.length === 0) {
      return
    }

    const inputChar = wordState.inputWord[inputLength - 1]
    const inputStartIndex = inputLength - 1
    const expectedChar = wordState.displayWord[inputStartIndex]
    if (inputChar === undefined || expectedChar === undefined) {
      return
    }

    let targetIndex = inputStartIndex
    let alignedInput = wordState.inputWord
    let skippedSymbolsCount = 0

    // 输入字母时，允许自动跳过当前位置的非字母内容（标点、空格、下划线等）
    if (isLetterChar(inputChar) && !isLetterChar(expectedChar)) {
      let nextLetterIndex = inputStartIndex
      while (nextLetterIndex < wordState.displayWord.length && !isLetterChar(wordState.displayWord[nextLetterIndex])) {
        nextLetterIndex += 1
      }

      if (nextLetterIndex >= wordState.displayWord.length) {
        // 后面已经没有字母了：跳过剩余符号并直接完成单词
        const prefix = wordState.inputWord.slice(0, inputStartIndex)
        const remainingSymbols = wordState.displayWord.slice(inputStartIndex)
        setWordState((state) => {
          state.inputWord = prefix + remainingSymbols
          for (let index = inputStartIndex; index < state.letterStates.length; index += 1) {
            state.letterStates[index] = 'correct'
          }
          state.isFinished = true
          state.endTime = getUtcStringForMixpanel()
          state.suppressValidationUntilNextInput = true
        })
        playHintSound()
        return
      }

      targetIndex = nextLetterIndex
      skippedSymbolsCount = targetIndex - inputStartIndex
      const prefix = wordState.inputWord.slice(0, inputStartIndex)
      const skippedSymbols = wordState.displayWord.slice(inputStartIndex, targetIndex)
      alignedInput = prefix + skippedSymbols + inputChar
    }

    const correctChar = wordState.displayWord[targetIndex]
    let isEqual = false
    if (correctChar !== undefined) {
      isEqual = isIgnoreCase ? inputChar.toLowerCase() === correctChar.toLowerCase() : inputChar === correctChar
    }

    const hasRemainingLetters = wordState.displayWord
      .slice(targetIndex + 1)
      .split('')
      .some((char) => isLetterChar(char))
    // 最后一个字母输入完成后，后面的符号不再强制要求输入；全符号词仍需要输入完整
    const shouldFinish = !hasRemainingLetters && (isLetterChar(inputChar) || inputLength >= wordState.displayWord.length)

    if (isEqual) {
      // 输入正确时
      setWordState((state) => {
        if (skippedSymbolsCount > 0) {
          state.inputWord = alignedInput
          for (let index = inputStartIndex; index < targetIndex; index += 1) {
            state.letterStates[index] = 'correct'
          }
          state.suppressValidationUntilNextInput = true
        }

        state.letterTimeArray.push(Date.now())
        state.correctCount += 1
        state.letterStates[targetIndex] = 'correct'

        if (shouldFinish) {
          state.isFinished = true
          state.endTime = getUtcStringForMixpanel()
        }
      })

      if (shouldFinish) {
        playHintSound()
      } else {
        playKeySound()
      }

      dispatch({ type: TypingStateActionType.REPORT_CORRECT_WORD })
    } else {
      // 出错时
      playBeepSound()
      setWordState((state) => {
        if (skippedSymbolsCount > 0) {
          state.inputWord = alignedInput
          for (let index = inputStartIndex; index < targetIndex; index += 1) {
            state.letterStates[index] = 'correct'
          }
        }

        state.letterStates[targetIndex] = 'wrong'
        state.hasWrong = true
        state.hasMadeInputWrong = true
        state.wrongCount += 1
        // 仅拒绝错误字符的模式下保留已输入内容的计时，继续累计即可
        if (!isRejectWrongChar) {
          state.letterTimeArray = []
        }

        if (state.letterMistake[targetIndex]) {
          state.letterMistake[targetIndex].push(inputChar)
        } else {
          state.letterMistake[targetIndex] = [inputChar]
        }

        const currentState = JSON.parse(JSON.stringify(state))
        dispatch({ type: TypingStateActionType.REPORT_WRONG_WORD, payload: { letterMistake: currentState.letterMistake } })
      })

      if (currentChapter === 0 && state.chapterData.index === 0 && wordState.wrongCount >= 3) {
        setShowTipAlert(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordState.inputWord])

  useEffect(() => {
    if (wordState.hasWrong) {
      const timer = setTimeout(
        () => {
          setWordState((state) => {
            if (isRejectWrongChar) {
              // 只移除刚输入的错误字符，保留之前已经输入正确的内容
              state.inputWord = state.inputWord.slice(0, -1)
              state.letterStates[state.inputWord.length] = 'normal'
              // 裁掉错误字符后会再次触发输入校验，标记一次跳过避免重复计数
              state.suppressValidationUntilNextInput = true
            } else {
              state.inputWord = ''
              state.letterStates = new Array(state.letterStates.length).fill('normal')
            }
            state.hasWrong = false
          })
        },
        isRejectWrongChar ? 150 : 300,
      )

      return () => {
        clearTimeout(timer)
      }
    }
  }, [isRejectWrongChar, wordState.hasWrong, setWordState])

  useEffect(() => {
    if (wordState.isFinished) {
      dispatch({ type: TypingStateActionType.SET_IS_SAVING_RECORD, payload: true })

      // wordLogUploader({
      //   headword: word.name,
      //   timeStart: wordState.startTime,
      //   timeEnd: wordState.endTime,
      //   countInput: wordState.correctCount + wordState.wrongCount,
      //   countCorrect: wordState.correctCount,
      //   countTypo: wordState.wrongCount,
      // })
      saveWordRecord({
        word: word.name,
        wrongCount: wordState.wrongCount,
        letterTimeArray: wordState.letterTimeArray,
        letterMistake: wordState.letterMistake,
      })

      onFinish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordState.isFinished])

  useEffect(() => {
    if (wordState.wrongCount >= 4) {
      dispatch({ type: TypingStateActionType.SET_IS_SKIP, payload: true })
    }
  }, [wordState.wrongCount, dispatch])

  return (
    <>
      <InputHandler updateInput={updateInput} />
      <div
        lang={currentLanguageCategory !== 'code' ? currentLanguageCategory : 'en'}
        className="flex w-full flex-col items-center justify-center pb-1 pt-4"
      >
        {['romaji', 'hapin'].includes(currentLanguage) && word.notation && <Notation notation={word.notation} />}
        <div ref={viewportRef} className="relative flex w-full justify-center">
          <div
            className={`tooltip-info relative w-fit max-w-full bg-transparent p-0 leading-normal shadow-none dark:bg-transparent ${
              wordDictationConfig.isOpen ? 'tooltip' : ''
            }`}
            data-tip={isZhToEnMode ? `按 ${CTRL} + J 显示音标并朗读，按 Tab 显示完整单词` : '按 Tab 快捷键显示完整单词'}
          >
            <div
              ref={contentRef}
              onMouseEnter={() => handleHoverWord(true)}
              onMouseLeave={() => handleHoverWord(false)}
              className={`flex max-w-full flex-wrap items-center justify-center gap-y-1 ${isTextSelectable && 'select-all'} ${
                wordState.hasWrong ? style.wrong : ''
              }`}
            >
              {letterGroups.map((group, groupIndex) => (
                <span
                  key={`group-${groupIndex}`}
                  // 单词本身不主动换行；仅当单个单词比可视宽度还长时才在内部折行兜底
                  className="flex min-w-0 max-w-full flex-wrap items-center justify-center"
                >
                  {group.map(({ letter, index }) => (
                    <Letter
                      key={`${index}-${letter}`}
                      letter={letter}
                      visible={getLetterVisible(index)}
                      state={wordState.letterStates[index]}
                      fontSize={fittedFontSize}
                    />
                  ))}
                </span>
              ))}
            </div>
            {pronunciationIsOpen && (
              <div className="absolute -right-12 top-1/2 h-9 w-9 -translate-y-1/2 transform ">
                <Tooltip content={`快捷键${CTRL} + J`}>
                  <WordPronunciationIcon word={word} lang={currentLanguage} ref={wordPronunciationIconRef} className="h-full w-full" />
                </Tooltip>
              </div>
            )}
            {/* 隐藏的测量元素：始终按用户设置的字号排成一行，用于计算长句的自适应字号 */}
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
      </div>
      <TipAlert className="fixed bottom-10 right-3" show={showTipAlert} setShow={setShowTipAlert} />
    </>
  )
}
