function Svg({ size = 18, className = '', strokeWidth = 1.8, children, viewBox = '0 0 24 24' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export default function AppIcon({ name, size = 18, className = '', strokeWidth = 1.8 }) {
  switch (name) {
    case 'dashboard':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v5H4zM14 13h6v7h-6z" />
        </Svg>
      )
    case 'feeds':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M5 19a2 2 0 1 0 0 .01" />
          <path d="M4 11a9 9 0 0 1 9 9" />
          <path d="M4 4a16 16 0 0 1 16 16" />
        </Svg>
      )
    case 'papers':
    case 'file':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6M9 9h2" />
        </Svg>
      )
    case 'assistant':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <rect x="5" y="7" width="14" height="10" rx="3" />
          <path d="M9 7V5a3 3 0 0 1 6 0v2M9.5 12h.01M14.5 12h.01" />
          <path d="M12 17v2M8 21h8" />
        </Svg>
      )
    case 'workflow':
    case 'flask':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M10 2v6.5L5 18a2 2 0 0 0 1.76 3h10.48A2 2 0 0 0 19 18l-5-9.5V2" />
          <path d="M8.5 12h7" />
        </Svg>
      )
    case 'tags':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M20 10 11 19l-8-8V4h7z" />
          <path d="M7.5 7.5h.01" />
        </Svg>
      )
    case 'duplicates':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </Svg>
      )
    case 'settings':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01A1.65 1.65 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </Svg>
      )
    case 'sun':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
        </Svg>
      )
    case 'moon':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </Svg>
      )
    case 'logout':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </Svg>
      )
    case 'plus':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M12 5v14M5 12h14" />
        </Svg>
      )
    case 'chevron-down':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="m6 9 6 6 6-6" />
        </Svg>
      )
    case 'close':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M6 6l12 12M18 6 6 18" />
        </Svg>
      )
    case 'search':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </Svg>
      )
    case 'normalize':
    case 'tune':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M4 6h8M16 6h4M10 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM4 12h4M12 12h8M6 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM4 18h10M18 18h2M12 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
        </Svg>
      )
    case 'select':
    case 'layers':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </Svg>
      )
    case 'analysis':
    case 'chart':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M4 20V10M12 20V4M20 20v-7" />
        </Svg>
      )
    case 'trends':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M4 16 10 10l4 4 6-8" />
          <path d="M20 6h-5v5" />
        </Svg>
      )
    case 'comparison':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M12 3v18M5 7l-2 5h4l-2-5ZM19 17l-2-5-2 5h4Z" />
        </Svg>
      )
    case 'gap':
    case 'puzzle':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M9 4H5a1 1 0 0 0-1 1v4h2a2 2 0 1 1 0 4H4v6a1 1 0 0 0 1 1h4v-2a2 2 0 1 1 4 0v2h6a1 1 0 0 0 1-1v-4h-2a2 2 0 1 1 0-4h2V5a1 1 0 0 0-1-1h-4V2a2 2 0 1 0-4 0v2Z" />
        </Svg>
      )
    case 'submission':
    case 'pen':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </Svg>
      )
    case 'synthesis':
    case 'spark':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
          <path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z" />
        </Svg>
      )
    case 'discussion':
    case 'message':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M7 16.5 3 20V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7Z" />
        </Svg>
      )
    case 'completed':
    case 'check-circle':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5L16 9.5" />
        </Svg>
      )
    case 'queued':
    case 'clock':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </Svg>
      )
    case 'copy':
    case 'clipboard':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        </Svg>
      )
    case 'download':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </Svg>
      )
    case 'check':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="m5 12 4 4L19 6" />
        </Svg>
      )
    case 'star':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z" />
        </Svg>
      )
    case 'book':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
          <path d="M4 5.5V20" />
        </Svg>
      )
    case 'radar':
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 12 19 8" />
          <path d="M12 12 8 19" />
          <path d="M12 12V3" />
        </Svg>
      )
    default:
      return (
        <Svg size={size} className={className} strokeWidth={strokeWidth}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </Svg>
      )
  }
}
