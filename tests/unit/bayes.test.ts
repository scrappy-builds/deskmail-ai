import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { combineProbabilities, isBayesTrained, scoreSpam, tokenize, tokenProb, trainBayes } from '../../src/db/bayes'

describe('bayes pure helpers', () => {
  it('tokenises to unique lowercase words (len >= 3)', () => {
    expect(tokenize('Win WIN free!! a money win').sort()).toEqual(['free', 'money', 'win'])
  })
  it('unseen token leans slightly ham; strong spam token scores high', () => {
    expect(tokenProb(0, 0, 10, 10)).toBe(0.4)
    expect(tokenProb(10, 0, 10, 10)).toBeGreaterThan(0.9)
    expect(tokenProb(0, 10, 10, 10)).toBeLessThan(0.1)
  })
  it('combines toward the more extreme probabilities', () => {
    expect(combineProbabilities([0.99, 0.99, 0.5])).toBeGreaterThan(0.9)
    expect(combineProbabilities([0.01, 0.01, 0.5])).toBeLessThan(0.1)
    expect(combineProbabilities([])).toBe(0)
  })
})

describe('bayes learning end-to-end', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-bayes-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('learns spam vs ham and scores new mail accordingly', () => {
    expect(isBayesTrained(db)).toBe(false)
    expect(scoreSpam(db, 'anything')).toBe(0) // untrained → neutral 0

    for (let i = 0; i < 4; i++) {
      trainBayes(db, 'win a free prize money lottery claim now winner', true)
      trainBayes(db, 'meeting tomorrow about the project agenda and budget review', false)
    }
    expect(isBayesTrained(db)).toBe(true)
    expect(scoreSpam(db, 'claim your free prize money now lottery winner')).toBeGreaterThan(0.8)
    expect(scoreSpam(db, 'project meeting agenda review tomorrow budget')).toBeLessThan(0.2)
  })
})
