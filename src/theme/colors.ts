/**
 * Phoenix Print design system — color tokens.
 * Dark Material Design 3 palette used across premium surfaces.
 */

export const colors = {
  background: "#0F172A",
  surface: "#1E293B",
  card: "#1E293B",
  primary: "#FF5A1F",
  primaryHover: "#E04E1A",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  textPrimary: "#FFFFFF",
  textSecondary: "#94A3B8",
  border: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.08)",
  overlay: "rgba(15,23,42,0.72)",
} as const;

export type ColorToken = keyof typeof colors;
