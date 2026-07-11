import { describe, expect, it } from 'vitest'
import { unusualRecipients } from '../../src/renderer/compose/unusualRecipients'
import { targetSize } from '../../src/renderer/editor/InlineImage'

describe('external-domain warning', () => {
  const known = ['northwind.studio', 'example.com']
  it('flags a never-seen domain once', () => {
    expect(unusualRecipients(['a@new.example', 'b@new.example'], known)).toEqual(['new.example'])
  })
  it('known domains pass quietly (case-insensitive)', () => {
    expect(unusualRecipients(['maya@Northwind.Studio'], known)).toEqual([])
  })
  it('mixed lists flag only the strangers', () => {
    expect(unusualRecipients(['maya@northwind.studio', 'x@fresh.example'], known)).toEqual(['fresh.example'])
  })
  it('malformed addresses are ignored', () => {
    expect(unusualRecipients(['not-an-address', '@nodomain'], known)).toEqual([])
  })
})

describe('inline image downscale maths', () => {
  it('caps width at 1600 and keeps the aspect ratio', () => {
    expect(targetSize(3200, 1800)).toEqual({ width: 1600, height: 900, resized: true })
    expect(targetSize(2000, 1000)).toEqual({ width: 1600, height: 800, resized: true })
  })
  it('small images are untouched', () => {
    expect(targetSize(1600, 900)).toEqual({ width: 1600, height: 900, resized: false })
    expect(targetSize(640, 480)).toEqual({ width: 640, height: 480, resized: false })
  })
})
