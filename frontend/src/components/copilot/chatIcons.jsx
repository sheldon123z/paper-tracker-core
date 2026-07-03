/**
 * Unified SVG icon set for CopilotChat — 16x16, currentColor.
 */

const icon = (d, opts = {}) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={opts.strokeWidth ?? 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...opts.extra}
  >
    {d}
  </svg>
)

export const CHAT_ICONS = {
  sendIcon: icon(
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>,
  ),
  copyIcon: icon(
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  ),
  thumbsUpIcon: icon(
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />,
  ),
  thumbsDownIcon: icon(
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />,
  ),
  regenerateIcon: icon(
    <>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>,
  ),
  stopIcon: icon(
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />,
  ),
  spinnerIcon: icon(
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
    { extra: { className: 'copilot-spin' } },
  ),
  activityIcon: icon(
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  ),
  uploadIcon: icon(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>,
  ),
  pushToTalkIcon: icon(
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </>,
  ),
}
