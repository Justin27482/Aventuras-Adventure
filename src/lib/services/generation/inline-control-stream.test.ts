import { describe, expect, it } from 'vitest'
import { InlineControlStreamBuffer } from './inline-control-stream'

describe('InlineControlStreamBuffer', () => {
  it('holds incomplete tags and emits completed tags once', () => {
    const buffer = new InlineControlStreamBuffer()

    expect(buffer.push('Before <roll notation="1d')).toEqual({
      visibleContent: 'Before ',
      completedTags: [],
    })

    const update = buffer.push('20" dc="12"/> After')
    expect(update.visibleContent).toBe('Before  After')
    expect(update.completedTags).toHaveLength(1)
    expect(update.completedTags[0].name).toBe('roll')

    expect(buffer.push(' more')).toEqual({
      visibleContent: 'Before  After more',
      completedTags: [],
    })
  })

  it('keeps ordinary angle-bracket text visible', () => {
    const buffer = new InlineControlStreamBuffer()
    expect(buffer.push('A <b>bold</b> line')).toEqual({
      visibleContent: 'A <b>bold</b> line',
      completedTags: [],
    })
  })
})
