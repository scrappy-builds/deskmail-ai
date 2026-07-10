import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { createTask, deleteTask, listTasks, setTaskDone } from '../../src/db/tasks'
import { getTodayAgenda } from '../../src/db/today'

describe('tasks', () => {
  let dir: string
  let db: DB
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-tasks-'))
    db = openDatabase(join(dir, 'deskmail.db'))
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates, ticks, unticks and deletes', () => {
    const id = createTask(db, 'Order more PETG', '2026-07-12')
    expect(listTasks(db)).toHaveLength(1)
    setTaskDone(db, id, true)
    expect(listTasks(db)[0].done).toBe(true) // still listed (done < 1 day ago)
    setTaskDone(db, id, false)
    expect(listTasks(db)[0].done).toBe(false)
    deleteTask(db, id)
    expect(listTasks(db)).toHaveLength(0)
  })

  it('long-done tasks auto-hide; fresh ones linger', () => {
    const oldId = createTask(db, 'ancient chore')
    db.run("UPDATE tasks SET done = 1, done_at = datetime('now', '-2 days') WHERE id = ?", [oldId])
    createTask(db, 'still open')
    const listed = listTasks(db)
    expect(listed).toHaveLength(1)
    expect(listed[0].title).toBe('still open')
  })

  it('orders by due date with undated last', () => {
    createTask(db, 'no date')
    createTask(db, 'later', '2026-08-01')
    createTask(db, 'soon', '2026-07-11')
    expect(listTasks(db).map((t) => t.title)).toEqual(['soon', 'later', 'no date'])
  })

  it('blank titles are refused', () => {
    expect(() => createTask(db, '   ')).toThrow()
  })

  it('rides along in the Today agenda', () => {
    createTask(db, 'check filament stock')
    const agenda = getTodayAgenda(db, '2026-07-10')
    expect(agenda.tasks.map((t) => t.title)).toContain('check filament stock')
  })
})
