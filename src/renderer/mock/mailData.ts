// Mock mail data for Stage 2 — layout development only. Replaced by the SQLite
// mail store from Stage 5. Shapes are close to the real message rows so swapping
// the source later is mechanical.

export interface MockAccount {
  id: string
  name: string
  email: string
  colour: string
  unread: number
}

export interface MockFolder {
  id: string
  name: string
  icon: 'inbox' | 'star' | 'send' | 'draft' | 'archive' | 'trash'
  count: number
  unread?: boolean
}

export interface MockView {
  id: string
  name: string
  icon: 'compose' | 'star' | 'calendar' | 'search'
  count: number
}

export interface MockMessage {
  id: number
  fromName: string
  fromEmail: string
  subject: string
  snippet: string
  time: string
  unread: boolean
  starred: boolean
  attach: boolean
  label?: string
  to: string
  body: string
}

export const accounts: MockAccount[] = [
  { id: 'a1', name: 'Jordan Ellis', email: 'jordan@fastmail.com', colour: '#1e7a38', unread: 6 },
  { id: 'a2', name: 'Studio', email: 'hello@northwind.studio', colour: '#bf8420', unread: 2 }
]

export const folders: MockFolder[] = [
  { id: 'inbox', name: 'Inbox', icon: 'inbox', count: 8, unread: true },
  { id: 'starred', name: 'Starred', icon: 'star', count: 3 },
  { id: 'sent', name: 'Sent', icon: 'send', count: 0 },
  { id: 'drafts', name: 'Drafts', icon: 'draft', count: 1 },
  { id: 'archive', name: 'Archive', icon: 'archive', count: 0 },
  { id: 'trash', name: 'Bin', icon: 'trash', count: 0 }
]

export const views: MockView[] = [
  { id: 'needs-reply', name: 'Needs reply', icon: 'compose', count: 4 },
  { id: 'invoices', name: 'Invoices & quotes', icon: 'search', count: 2 },
  { id: 'last-7', name: 'Last 7 days', icon: 'calendar', count: 12 }
]

export const messages: MockMessage[] = [
  {
    id: 1,
    fromName: 'Maya Chen',
    fromEmail: 'maya@northwind.studio',
    subject: 'Q3 launch timeline — need your sign-off',
    snippet:
      'Sharing the updated launch plan — the dates shifted after the infra review. Can you confirm the print run window still works your end?',
    time: '9:41 AM',
    unread: true,
    starred: true,
    attach: false,
    label: 'WORK',
    to: 'jordan@fastmail.com',
    body: 'Sharing the updated launch plan — the dates shifted after the infra review.\n\nCan you confirm the print run window still works your end? I want to lock the timeline this week.\n\nMaya'
  },
  {
    id: 2,
    fromName: 'Stripe',
    fromEmail: 'receipts@stripe.com',
    subject: 'Your invoice for June is ready',
    snippet: 'Invoice #INV-2041 for £1,290.00 has been issued. View or download the PDF from your dashboard.',
    time: '8:12 AM',
    unread: true,
    starred: false,
    attach: true,
    label: 'INVOICES',
    to: 'jordan@fastmail.com',
    body: 'Invoice #INV-2041 for £1,290.00 has been issued.\n\nView or download the PDF from your dashboard.'
  },
  {
    id: 3,
    fromName: 'Priya Nair',
    fromEmail: 'priya@makerspace.uk',
    subject: 'Re: Radiator clip — commercial licence',
    snippet: "Thanks for the quick turnaround. One question about the non-commercial clause before I sign.",
    time: '7:48 AM',
    unread: true,
    starred: false,
    attach: false,
    label: '',
    to: 'jordan@fastmail.com',
    body: 'Thanks for the quick turnaround.\n\nOne question about the non-commercial clause before I sign — does it cover resale of printed units, or only the STL itself?'
  },
  {
    id: 4,
    fromName: 'GitHub',
    fromEmail: 'noreply@github.com',
    subject: '[northwind/desk-mail] 3 new pull requests',
    snippet: 'PR #418 Fix IMAP reconnect loop, PR #419 Sanitise inline styles, PR #420 Layout preset persistence.',
    time: '7:03 AM',
    unread: true,
    starred: false,
    attach: false,
    to: 'jordan@fastmail.com',
    body: 'PR #418 Fix IMAP reconnect loop\nPR #419 Sanitise inline styles\nPR #420 Layout preset persistence'
  },
  {
    id: 5,
    fromName: 'Tom Baker',
    fromEmail: 'tom@fieldnotes.co',
    subject: 'Coffee next week?',
    snippet: "I'm in town Tuesday and Wednesday — would be good to catch up if you're free.",
    time: 'Yesterday',
    unread: false,
    starred: false,
    attach: false,
    to: 'jordan@fastmail.com',
    body: "I'm in town Tuesday and Wednesday — would be good to catch up if you're free. Your call on where."
  },
  {
    id: 6,
    fromName: 'Figma',
    fromEmail: 'updates@figma.com',
    subject: 'Maya shared "DeskMail — Layouts" with you',
    snippet: 'You now have edit access to the file. Open it in Figma to start collaborating.',
    time: 'Yesterday',
    unread: false,
    starred: false,
    attach: false,
    to: 'jordan@fastmail.com',
    body: 'You now have edit access to the file. Open it in Figma to start collaborating.'
  },
  {
    id: 7,
    fromName: 'Royal Mail',
    fromEmail: 'noreply@royalmail.com',
    subject: 'Your parcel has been dispatched',
    snippet: 'Tracking number AB1234567GB. Estimated delivery within 2–3 working days.',
    time: 'Mon',
    unread: false,
    starred: false,
    attach: false,
    label: '',
    to: 'jordan@fastmail.com',
    body: 'Tracking number AB1234567GB.\n\nEstimated delivery within 2–3 working days.'
  },
  {
    id: 8,
    fromName: 'Sam Okafor',
    fromEmail: 'sam@bramblewood.org',
    subject: 'Workshop bookings for autumn',
    snippet: "We'd love to run the 3D printing session again — are the October dates still open?",
    time: 'Mon',
    unread: false,
    starred: true,
    attach: false,
    to: 'jordan@fastmail.com',
    body: "We'd love to run the 3D printing session again — are the October dates still open? Happy to work around your schedule."
  }
]

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}
