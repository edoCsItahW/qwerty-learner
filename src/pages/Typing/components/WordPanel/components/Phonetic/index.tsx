import { isTextSelectableAtom, phoneticConfigAtom } from '@/store'
import type { Word, WordWithIndex } from '@/typings'
import { useAtomValue } from 'jotai'

export type PhoneticProps = {
  word: WordWithIndex | Word
  /** 隐藏但仍占位，避免音标出现/消失时单词位置跳动 */
  hidden?: boolean
}

function Phonetic({ word, hidden = false }: PhoneticProps) {
  const phoneticConfig = useAtomValue(phoneticConfigAtom)
  const isTextSelectable = useAtomValue(isTextSelectableAtom)

  return (
    <div
      className={`space-x-5 text-center text-sm font-normal text-gray-600 transition-colors duration-300 dark:text-gray-400 ${
        isTextSelectable && 'select-text'
      } ${hidden && 'invisible'}`}
    >
      {phoneticConfig.type === 'us' && word.usphone && word.usphone.length > 1 && <span>{`AmE: [${word.usphone}]`}</span>}
      {phoneticConfig.type === 'uk' && word.ukphone && word.ukphone.length > 1 && <span>{`BrE: [${word.ukphone}]`}</span>}
    </div>
  )
}

export default Phonetic
