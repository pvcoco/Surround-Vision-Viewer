// Line icons modelled on the Cadillac infotainment glyphs (thin strokes, currentColor).

const svg = (body: string, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const icons = {
  surround: svg(`<rect x="9" y="7" width="6" height="10" rx="2"/><path d="M6 5a9 9 0 1 0 12 0M4 5h3v3M17 8V5h3"/><path d="M10 10h4M10 14h4"/>`),
  // Camera body with the flared lens pointing toward the view direction.
  front: svg(`<rect x="8.5" y="9.5" width="7" height="11" rx="1"/><path d="M8 3.5h8l-2 6h-4z"/>`),
  rear: svg(`<rect x="8.5" y="3.5" width="7" height="11" rx="1"/><path d="M8 20.5h8l-2-6h-4z"/>`),
  left: svg(`<rect x="9.5" y="8.5" width="11" height="7" rx="1"/><path d="M3.5 8v8l6-2v-4z"/>`),
  right: svg(`<rect x="3.5" y="8.5" width="11" height="7" rx="1"/><path d="M20.5 8v8l-6-2v-4z"/>`),
  cabin: svg(
    `<path d="M5 6.5l3.2 9.5H15l2.5 4"/><path d="M8.2 16 6.5 20"/><rect x="11" y="4" width="5" height="3.6" rx=".6"/><path d="M16 5l2.5-1.2v4L16 6.6"/><circle cx="20" cy="11.5" r=".9"/>`,
  ),
  quad: svg(`<rect x="3.5" y="4.5" width="7.5" height="6.5" rx="1"/><rect x="13" y="4.5" width="7.5" height="6.5" rx="1"/><rect x="3.5" y="13" width="7.5" height="6.5" rx="1"/><rect x="13" y="13" width="7.5" height="6.5" rx="1"/>`),
  recorder: svg(
    `<rect x="1.8" y="7" width="15" height="10" rx="1"/><circle cx="6.3" cy="12" r="2"/><circle cx="12.3" cy="12" r="2"/><path d="M6.3 14h6M16.8 10.3l5-2.8v9l-5-2.8"/>`,
  ),
  gear: svg(
    `<path d="M10.2 2.8h3.6l.5 2.6 1.7.9 2.4-1.2 2.5 2.5-1.2 2.4.9 1.7 2.6.5v3.6l-2.6.5-.9 1.7 1.2 2.4-2.5 2.5-2.4-1.2-1.7.9-.5 2.6h-3.6l-.5-2.6-1.7-.9-2.4 1.2-2.5-2.5 1.2-2.4-.9-1.7-2.6-.5v-3.6l2.6-.5.9-1.7-1.2-2.4 2.5-2.5 2.4 1.2 1.7-.9z"/><circle cx="12" cy="12" r="1.3"/>`,
  ),
  play: svg(`<path d="M8 5.5v13l10.5-6.5z"/>`),
  pause: svg(`<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.2"/>`),
  back10: svg(`<path d="M4.5 9.5A8 8 0 1 1 4 13"/><path d="M4 4.5v5h5"/><text x="12.4" y="15.2" fill="currentColor" stroke="none" font-size="6.6" text-anchor="middle" font-family="system-ui,sans-serif">10</text>`),
  fwd10: svg(`<path d="M19.5 9.5A8 8 0 1 0 20 13"/><path d="M20 4.5v5h-5"/><text x="11.6" y="15.2" fill="currentColor" stroke="none" font-size="6.6" text-anchor="middle" font-family="system-ui,sans-serif">10</text>`),
  prev: svg(`<path d="M6 5.5v13M18.5 5.5v13L9 12z"/>`),
  next: svg(`<path d="M18 5.5v13M5.5 5.5v13L15 12z"/>`),
  speed: svg(`<path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0"/><path d="M12 13.5l4-4.5"/><circle cx="12" cy="14" r="1.2"/>`),
  snapshot: svg(`<path d="M4 7.5h3.5L9 5.5h6l1.5 2H20a.5.5 0 0 1 .5.5v10.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V8a.5.5 0 0 1 .5-.5z"/><circle cx="12" cy="13" r="3.4"/>`),
  save: svg(`<rect x="4" y="4.5" width="16" height="15" rx="1"/><path d="M4 9h16M12 11.5v5.5M9.5 14.5 12 17l2.5-2.5"/>`),
  folder: svg(`<path d="M3.5 6.5a1 1 0 0 1 1-1h4.5l2 2h8.5a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>`),
  usb: svg(`<rect x="7" y="9.5" width="10" height="11" rx="1.5"/><path d="M9 9.5v-6h6v6M10.8 6h.01M13.2 6h.01"/>`),
  fullscreen: svg(`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`),
  files: svg(`<rect x="5" y="3.5" width="12" height="15" rx="1"/><path d="M8 21h11a1 1 0 0 0 1-1V7"/><path d="M8.5 8h5M8.5 11h5M8.5 14h3"/>`),
};

export type IconName = keyof typeof icons;
