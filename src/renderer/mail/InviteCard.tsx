import { useState } from 'react'
import { Icon } from '../Icon'
import { PROVIDERS } from '@shared/meetings'
import type { InviteData } from '@shared/db'

// Renders a calendar invite with Accept / Tentative / Decline. Accepting adds
// the event to the local calendar (via the message id).
export function InviteCard({ messageId, invite }: { messageId: number; invite: InviteData }): JSX.Element {
  const [decision, setDecision] = useState<null | 'accepted' | 'tentative' | 'declined'>(null)
  const [notified, setNotified] = useState<null | 'sending' | 'sent' | 'failed'>(null)
  const provider = PROVIDERS[invite.provider]
  // We only email the organiser when asked — the button says what it sends.
  const canNotify = Boolean(invite.organiserEmail && invite.uid)

  const notifyOrganiser = async (): Promise<void> => {
    if (!decision) return
    setNotified('sending')
    const response = decision === 'accepted' ? 'ACCEPTED' : decision === 'tentative' ? 'TENTATIVE' : 'DECLINED'
    const r = await window.deskmail.calendar.respondInvite(messageId, response)
    setNotified(r.ok ? 'sent' : 'failed')
  }

  const when = (() => {
    const d = invite.date ? new Date(invite.date + 'T00:00') : null
    const day = d ? d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
    const time = invite.start ? `${invite.start}${invite.end ? `–${invite.end}` : ''}` : ''
    return [day, time].filter(Boolean).join(' · ')
  })()

  // Cross-timezone invites show the sender's original time (or an honest note
  // when the invite's timezone couldn't be resolved).
  const tzNote = invite.fallback
    ? 'Built from the meeting link in this email — check the date and time after adding.'
    : invite.tzUnknown
      ? "Shown as written — I couldn't work out the invite's timezone."
      : invite.originalTime
        ? `${invite.originalTime} where it was sent — shown in your time.`
        : null

  const decide = async (status: 'accepted' | 'tentative' | 'declined'): Promise<void> => {
    setDecision(status)
    if (status === 'accepted') await window.deskmail.calendar.acceptInvite(messageId)
  }

  const statusLabel =
    decision === 'accepted' ? 'Added to your calendar' : decision === 'tentative' ? 'Marked as tentative' : 'Declined'

  return (
    <div data-testid="invite-card" className="mx-6 mt-4 overflow-hidden rounded-lg border border-border">
      <div className="p-4">
        <div className="text-[15px] font-bold">{invite.title}</div>
        {when && <div className="mt-0.5 text-[12.5px] text-text-2">{when}</div>}
        {tzNote && <div className="mt-0.5 text-[11.5px] text-text-3">{tzNote}</div>}
        <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: provider.colour }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: provider.colour }} />
          {provider.label}
        </div>
        {invite.guests.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-3">
            <Icon name="reply" size={13} className="opacity-0" />
            <span>{invite.guests.join(', ')}</span>
          </div>
        )}
        {invite.organiser && <div className="mt-0.5 text-[12px] text-text-3">Organised by {invite.organiser}</div>}
      </div>

      {decision ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-[12.5px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Icon name="check" size={15} /> {statusLabel}
          <span className="flex-1" />
          {canNotify && notified === null && (
            <button onClick={() => void notifyOrganiser()} className="rounded-md border border-current px-2.5 py-1 text-[12px] font-semibold hover:opacity-80" title={`Emails your response to ${invite.organiserEmail}`}>
              Email {invite.organiser ?? 'the organiser'} my response
            </button>
          )}
          {notified === 'sending' && <span className="text-[12px] font-semibold">Sending…</span>}
          {notified === 'sent' && <span className="text-[12px] font-semibold">Response emailed</span>}
          {notified === 'failed' && <span className="text-[12px] font-semibold text-danger">Couldn't email the response</span>}
        </div>
      ) : (
        <div className="flex gap-2 border-t border-border p-3">
          <button onClick={() => void decide('accepted')} className="flex-1 rounded-md bg-accent py-2 text-[12.5px] font-bold text-accent-fg hover:bg-accent-2">
            Accept
          </button>
          <button onClick={() => void decide('tentative')} className="flex-1 rounded-md border border-border py-2 text-[12.5px] font-semibold text-text-2 hover:bg-raised">
            Tentative
          </button>
          <button onClick={() => void decide('declined')} className="flex-1 rounded-md border border-border py-2 text-[12.5px] font-semibold text-danger hover:bg-raised">
            Decline
          </button>
        </div>
      )}
    </div>
  )
}
