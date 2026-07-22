import { COLORS } from "../theme";

export type GlyphType =
  | "document"
  | "folder"
  | "note"
  | "table"
  | "library"
  | "model"
  | "question"
  | "evidence"
  | "workflow"
  | "report"
  | "governance"
  | "person"
  | "grid";

export const FeatureGlyph: React.FC<{
  type: GlyphType;
  size?: number;
  color?: string;
}> = ({ type, size = 66, color = COLORS.cyan }) => {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      {type === "document" ? (
        <>
          <path {...common} d="M18 8h20l10 10v38H18z" />
          <path {...common} d="M38 8v12h10M25 31h16M25 39h16M25 47h10" />
        </>
      ) : null}
      {type === "folder" ? (
        <>
          <path {...common} d="M7 17h20l6 7h24v31H7z" />
          <path {...common} d="M7 28h50" />
        </>
      ) : null}
      {type === "note" ? (
        <>
          <rect {...common} x="12" y="8" width="40" height="48" rx="5" />
          <path {...common} d="M20 21h24M20 31h24M20 41h15" />
        </>
      ) : null}
      {type === "table" ? (
        <>
          <rect {...common} x="8" y="12" width="48" height="40" rx="4" />
          <path {...common} d="M8 25h48M8 38h48M25 12v40M42 12v40" />
        </>
      ) : null}
      {type === "library" ? (
        <>
          <path {...common} d="M10 22h44v30H10zM7 16h50v6H7zM18 9h28l8 7H10z" />
          <path {...common} d="M20 30v14M32 30v14M44 30v14" />
        </>
      ) : null}
      {type === "model" ? (
        <>
          <rect {...common} x="14" y="14" width="36" height="36" rx="10" />
          <circle {...common} cx="24" cy="26" r="3" />
          <circle {...common} cx="40" cy="26" r="3" />
          <path
            {...common}
            d="M24 39c5 4 11 4 16 0M32 14V7M19 14l-4-5M45 14l4-5"
          />
        </>
      ) : null}
      {type === "question" ? (
        <>
          <circle {...common} cx="32" cy="32" r="24" />
          <path {...common} d="M25 25c1-6 13-8 17-2 5 8-8 9-8 17M34 48h.01" />
        </>
      ) : null}
      {type === "evidence" ? (
        <>
          <circle {...common} cx="16" cy="19" r="6" />
          <circle {...common} cx="48" cy="19" r="6" />
          <circle {...common} cx="32" cy="47" r="6" />
          <path {...common} d="M21 23l8 18M43 23l-8 18M22 19h20" />
        </>
      ) : null}
      {type === "workflow" ? (
        <>
          <rect {...common} x="5" y="23" width="14" height="18" rx="3" />
          <rect {...common} x="25" y="23" width="14" height="18" rx="3" />
          <rect {...common} x="45" y="23" width="14" height="18" rx="3" />
          <path {...common} d="M19 32h6M39 32h6" />
        </>
      ) : null}
      {type === "report" ? (
        <>
          <path
            {...common}
            d="M16 8h32v48H16zM23 18h18M23 27h8M23 45l7-8 6 5 7-12"
          />
          <circle {...common} cx="43" cy="30" r="2" />
        </>
      ) : null}
      {type === "governance" ? (
        <>
          <path
            {...common}
            d="M32 7l20 8v15c0 13-8 22-20 27C20 52 12 43 12 30V15z"
          />
          <path {...common} d="M23 31l6 6 13-14" />
        </>
      ) : null}
      {type === "person" ? (
        <>
          <circle {...common} cx="32" cy="20" r="10" />
          <path {...common} d="M13 55c1-14 8-21 19-21s18 7 19 21" />
        </>
      ) : null}
      {type === "grid" ? (
        <>
          <path
            {...common}
            d="M32 7L18 57M32 7l14 50M24 28h16M20 42h24M15 57h34"
          />
          <path {...common} d="M8 22h16M40 22h16M8 22l-3 7M56 22l3 7" />
          <circle {...common} cx="8" cy="22" r="2" />
          <circle {...common} cx="56" cy="22" r="2" />
        </>
      ) : null}
    </svg>
  );
};
