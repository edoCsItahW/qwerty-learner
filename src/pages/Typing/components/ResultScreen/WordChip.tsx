import usePronunciationSound from '@/hooks/usePronunciation'
import type { WordWithIndex } from '@/typings'
import { flip, offset, shift, useFloating, useHover, useInteractions, useRole } from '@floating-ui/react'
import { useCallback, useState } from 'react'

export default function WordChip({ word }: { word: WordWithIndex }) {
  const [showTranslation, setShowTranslation] = useState(false)
  const { x, y, strategy, refs, context } = useFloating({
    open: showTranslation,
    onOpenChange: setShowTranslation,
    middleware: [offset(4), shift(), flip()],
  })
  const hover = useHover(context)
  const role = useRole(context, { role: 'tooltip' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, role])
  const { play, stop } = usePronunciationSound(word.name, false)

  const onClickWord = useCallback(() => {
    stop()
    play()
  }, [play, stop])

  return (
    <>
      <button
        ref={refs.setReference}
        className="word-chip h-auto min-h-[2.5rem] max-w-full select-all md:h-auto md:min-h-[3rem]"
        {...getReferenceProps()}
        type="button"
        onClick={onClickWord}
        title={`朗读 ${word.name}`}
      >
        <span className="break-words text-left leading-tight">{word.name}</span>
      </button>
      {showTranslation && (
        <div
          ref={refs.setFloating}
          className="word-chip-tooltip max-w-[24rem] whitespace-normal break-words"
          style={{
            position: strategy,
            top: y ?? 0,
            left: x ?? 0,
            width: 'max-content',
          }}
          {...getFloatingProps()}
        >
          {word.trans}
        </div>
      )}
    </>
  )
}
