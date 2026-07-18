/**
 * PrimaryAction — the strongest full-width call-to-action button (height 56dp,
 * radius 18dp) built on top of AppButton. Prepared for future Library /
 * Marketplace screens. Not yet wired into any existing screen.
 */

import React from "react";

import { AppButton, type AppButtonProps } from "./AppButton";

export type PrimaryActionProps = Omit<
  AppButtonProps,
  "variant" | "size" | "fullWidth"
>;

export function PrimaryAction(props: PrimaryActionProps) {
  return <AppButton variant="primary" size="lg" fullWidth {...props} />;
}

export default PrimaryAction;
