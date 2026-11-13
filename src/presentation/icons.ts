/**
 * The Hub's icons: simple outlined shapes on a 24 px grid, drawn with a 1.5 px stroke and round
 * caps (DESIGN.md §5). They are inline SVG, so there is no icon font and no extra request
 * (SDD §12). Each icon is a list of path strings; `currentColor` colors them.
 *
 * Open point of DESIGN.md §13.6: until the Volare icon package or an approved SVG subset arrives,
 * these are the Hub's own.
 */
export const ICONS = {
  dashboard: ['M4 4h7v9H4z', 'M13 4h7v5h-7z', 'M13 11h7v9h-7z', 'M4 15h7v5H4z'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  tasks: ['M9 11l3 3 8-8', 'M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  breach: ['M12 3.5L2.8 19.5h18.4z', 'M12 10v4.5', 'M12 17.5h.01'],
  capacity: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.6A9 9 0 0 1 20.4 9H15z'],
  trend: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  lightbulb: [
    'M9 18h6',
    'M10 21h4',
    'M12 3a6 6 0 0 0-3.5 10.9c.7.6 1.2 1.4 1.4 2.1h4.2c.2-.7.7-1.5 1.4-2.1A6 6 0 0 0 12 3z',
  ],
  book: ['M5 4h13a1 1 0 0 1 1 1v14H6a2 2 0 0 0-2 2V5a1 1 0 0 1 1-1z', 'M8 8h7'],
  pulse: ['M3 12h4l3-8 4 16 3-8h4'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 7.5h.01'],
  'check-circle': ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8 12.5l3 3 5-6'],
  'x-circle': ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9 9l6 6', 'M15 9l-6 6'],
  'alert-triangle': ['M12 3.5L2.8 19.5h18.4z', 'M12 10v4.5', 'M12 17.5h.01'],
  'arrow-up': ['M12 19V5', 'M6 11l6-6 6 6'],
  'arrow-down': ['M12 5v14', 'M6 13l6 6 6-6'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  minus: ['M6 12h12'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  block: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M5.6 5.6l12.8 12.8'],
  refresh: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v5h-5'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2',
    'M12 20v2',
    'M4.9 4.9l1.4 1.4',
    'M17.7 17.7l1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'M4.9 19.1l1.4-1.4',
    'M17.7 6.3l1.4-1.4',
  ],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  monitor: ['M3 5h18v11H3z', 'M8 20h8', 'M12 16v4'],
  logout: ['M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4', 'M16 8l4 4-4 4', 'M20 12H9'],
  'chevron-down': ['M6 9l6 6 6-6'],
  help: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5',
    'M12 17h.01',
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;
