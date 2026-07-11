import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../../src/db/database'
import { dismissNudge, getAwaitingReply } from '../../src/db/today'

describe('no-reply nudges', () => {
  let dir: string
  let db: DB
  let sentFolder: number
  let inbox: number
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskmail-nudge-'))
    db = openDatabase(join(dir, 'deskmail.db'))
    db.run(
      `INSERT INTO accounts (display_name, email_address, incoming_type, incoming_host, incoming_port,
         incoming_security, outgoing_host, outgoing_port, outgoing_security, username)
       VALUES ('Alex','alex@example.com','imap','h',993,'ssl','s',465,'ssl','j')`
    )
    db.run("INSERT INTO folders (account_id, name, role, remote_path) VALUES (1,'Inbox','inbox','INBOX'), (1,'Sent','sent','Sent')")
    inbox = 1
    sentFolder = 2
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function addSent(subject: string, to: string, daysAgo: number, header: string | null = null): number {
    db.run(
      `INSERT INTO messages (account_id, folder_id, from_email, to_json, subject, sent_at, message_id_header)
       VALUES (1, ?, 'alex@example.com', ?, ?, datetime('now', '-' || ? || ' days'), ?)`,
      [sentFolder, JSON.stringify([to]), subject, daysAgo, header]
    )
    return (db.get('SELECT last_insert_rowid() AS id') as { id: number }).id
  }
  function addReply(fromEmail: string, subject: string, refs: string | null = null): void {
    db.run(
      `INSERT INTO messages (account_id, folder_id, from_email, subject, received_at, references_json)
       VALUES (1, ?, ?, ?, datetime('now'), ?)`,
      [inbox, fromEmail, subject, refs]
    )
  }

  it('an unanswered sent message older than 3 days surfaces', () => {
    addSent('Licence question', 'buyer@norway.example', 5)
    const nudges = getAwaitingReply(db)
    expect(nudges).toHaveLength(1)
    expect(nudges[0].subject).toBe('Licence question')
    expect(nudges[0].to).toEqual(['buyer@norway.example'])
  })

  it('too recent → not nudged yet', () => {
    addSent('Quick one', 'x@y.example', 1)
    expect(getAwaitingReply(db)).toHaveLength(0)
  })

  it('a reply matched by References silences the nudge', () => {
    addSent('Licence question', 'buyer@norway.example', 5, '<sent-123@deskmail>')
    addReply('buyer@norway.example', 'Totally different subject', '["<sent-123@deskmail>"]')
    expect(getAwaitingReply(db)).toHaveLength(0)
  })

  it('a reply matched by "Re: subject" silences the nudge', () => {
    addSent('Licence question', 'buyer@norway.example', 5)
    addReply('buyer@norway.example', 'Re: Licence question')
    expect(getAwaitingReply(db)).toHaveLength(0)
  })

  it('a reply from someone else does not count', () => {
    addSent('Licence question', 'buyer@norway.example', 5)
    addReply('other@person.example', 'Re: Licence question')
    expect(getAwaitingReply(db)).toHaveLength(1)
  })

  it('self-addressed mail never nudges', () => {
    addSent('note to self', 'alex@example.com', 10)
    expect(getAwaitingReply(db)).toHaveLength(0)
  })

  it('dismissed stays dismissed', () => {
    const id = addSent('Licence question', 'buyer@norway.example', 5)
    dismissNudge(db, id)
    dismissNudge(db, id) // idempotent
    expect(getAwaitingReply(db)).toHaveLength(0)
  })
})
