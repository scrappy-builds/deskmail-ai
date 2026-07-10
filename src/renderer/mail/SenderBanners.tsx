import { useEffect, useState } from 'react'
import type { MessageDetail, SenderContext } from '@shared/db'
import { senderSignals, type SenderSignal } from './senderSignals'

// Banner strip above the message body: first-time sender, display-name
// impersonation, lookalike domains, diverted replies. Inform-only — no actions.
export function SenderBanners({ m }: { m: MessageDetail }): JSX.Element | null {
  const [signals, setSignals] = useState<SenderSignal[]>([])

  useEffect(() => {
    setSignals([])
    // My own sent/draft mail never needs warning about itself.
    if (!m.fromEmail || m.folderRole === 'sent' || m.folderRole === 'drafts') return
    let live = true
    void window.deskmail.mail.senderContext(m.id).then((ctx: SenderContext) => {
      if (!live) return
      if (ctx.myDomains.some((d) => m.fromEmail!.toLowerCase().endsWith(`@${d.toLowerCase()}`))) return
      setSignals(
        senderSignals({
          fromName: m.fromName,
          fromEmail: m.fromEmail,
          replyTo: m.replyTo,
          priorMessagesFromSender: ctx.priorMessagesFromSender,
          myDomains: ctx.myDomains,
          frequentDomains: ctx.frequentDomains
        })
      )
    })
    return () => {
      live = false
    }
  }, [m.id, m.fromEmail, m.fromName, m.replyTo, m.folderRole])

  if (signals.length === 0) return null
  return (
    <div className="mx-6 mt-4 flex flex-col gap-1.5">
      {signals.map((s) => (
        <div
          key={s.id}
          data-testid={`sender-signal-${s.id}`}
          className="rounded-md border px-3.5 py-2 text-[12.5px] font-medium"
          style={
            s.severity === 'warning'
              ? { borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }
              : { borderColor: 'var(--border-2)', background: 'var(--bg-3)', color: 'var(--text-2)' }
          }
        >
          {s.text}
        </div>
      ))}
    </div>
  )
}
