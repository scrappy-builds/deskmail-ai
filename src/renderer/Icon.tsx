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
  close: 'M6 6l12 12 M18 6L6 18'
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
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
