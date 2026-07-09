// Stroke icons per the Style Guide: 1.7px, round caps/joins, 24px grid, currentColor.
export type IconName =
  | 'mail'
  | 'search'
  | 'calendar'
  | 'compose'
  | 'claude'
  | 'sliders'
  | 'sun'
  | 'moon'
  | 'minimise'
  | 'maximise'
  | 'close'
  | 'inbox'
  | 'star'
  | 'send'
  | 'draft'
  | 'archive'
  | 'trash'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'plus'
  | 'filter'
  | 'check'
  | 'clip'
  | 'chevronDown'
  | 'markUnread'
  | 'openWindow'

const PATHS: Record<IconName, string> = {
  mail: 'M22 12h-6l-2 3h-4l-2-3H2 M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  calendar: 'M3 4h18v18H3z M3 10h18 M8 2v4 M16 2v4',
  compose: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  claude: 'M12 3l1.8 5L19 10l-5.2 1.9L12 17l-1.8-5.1L5 10l5.2-2z',
  sliders: 'M4 21v-6 M4 11V3 M12 21v-8 M12 9V3 M20 21v-4 M20 13V3 M1 15h6 M9 9h6 M17 17h6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  minimise: 'M5 12h14',
  maximise: 'M5 5h14v14H5z',
  close: 'M6 6l12 12 M18 6L6 18',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5.5h13l3.5 6.5v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z',
  star: 'M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 17.5 6 20.8l1.4-6.5L2.5 9.3l6.6-.7z',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  draft: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6',
  archive: 'M3 4h18v4H3z M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8 M9.5 12h5',
  trash: 'M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14',
  reply: 'M9 17l-6-5 6-5 M3 12h9a7 7 0 0 1 7 7v1',
  replyAll: 'M7 17l-5-5 5-5 M12 17l-5-5 5-5 M8 12h7a6 6 0 0 1 6 6v1',
  forward: 'M15 17l6-5-6-5 M21 12h-9a7 7 0 0 0-7 7v1',
  plus: 'M12 5v14 M5 12h14',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  check: 'M20 6L9 17l-5-5',
  clip: 'M21 12l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  chevronDown: 'M6 9l6 6 6-6',
  markUnread: 'M22 12h-6l-2 3h-4l-2-3H2 M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  openWindow: 'M15 3h6v6 M10 14L21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5'
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
  fill?: boolean
}

export function Icon({ name, size = 18, className, fill = false }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
