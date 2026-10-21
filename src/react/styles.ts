import type { CSSProperties } from 'react';

/** The parts of the dev-mode editor that can be styled. */
export type DynamicTextPart = 'root' | 'editing' | 'editable' | 'actions' | 'confirm' | 'cancel';

export interface DynamicTextAppearance {
  /** Extra class names per part, added after the built-in `dynamic-text*` classes. */
  classNames?: Partial<Record<DynamicTextPart, string>>;
  /** Inline styles per part. These win over the default stylesheet and any class. */
  styles?: Partial<Record<DynamicTextPart, CSSProperties>>;
  /** Skip injecting the default stylesheet. The `dynamic-text*` classes are still rendered. */
  unstyled?: boolean;
}

/**
 * Stable class names, always present in dev so you can target them from your own CSS. The
 * root element carries `dynamic-text` in every state; `editing` is added alongside it while
 * the editor is open. The root also carries `data-state="idle" | "editing" | "saving"`.
 */
export const PART_CLASS_NAMES: Record<DynamicTextPart, string> = {
  root: 'dynamic-text',
  editing: 'dynamic-text-editing',
  editable: 'dynamic-text-editable',
  actions: 'dynamic-text-actions',
  confirm: 'dynamic-text-confirm',
  cancel: 'dynamic-text-cancel',
};

export const STYLE_ELEMENT_ID = 'dynamic-text-styles';

// Every selector is wrapped in :where() so it has zero specificity: any class of yours wins.
// Colours come from custom properties, so a theme can be set once on :root.
export const DEFAULT_STYLESHEET: string = `
:where(.dynamic-text) {
  border-radius: 2px;
  transition: outline-color 0.15s, box-shadow 0.15s;
}
:where(.dynamic-text[data-state="idle"]):hover {
  outline: 1px dashed var(--dynamic-text-accent-muted, rgb(245 158 11 / 0.6));
  outline-offset: 1px;
}
:where(.dynamic-text-editing) {
  position: relative;
  z-index: 50;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  outline: 2px solid var(--dynamic-text-accent, rgb(245 158 11 / 0.8));
  background: var(--dynamic-text-editing-background, color-mix(in srgb, Canvas 80%, transparent));
}
:where(.dynamic-text-editable) {
  min-width: 1ch;
  outline: none;
  color: inherit;
  font: inherit;
  line-height: inherit;
}
:where(.dynamic-text-actions) {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
  font: normal 14px/1 system-ui, sans-serif;
  user-select: none;
}
:where(.dynamic-text-confirm, .dynamic-text-cancel) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
  transition: transform 0.1s, background-color 0.15s;
}
:where(.dynamic-text-confirm, .dynamic-text-cancel):active { transform: scale(0.95); }
:where(.dynamic-text-confirm, .dynamic-text-cancel):disabled { opacity: 0.5; cursor: default; }
:where(.dynamic-text-confirm) { background: var(--dynamic-text-confirm-background, #059669); }
:where(.dynamic-text-confirm):hover { background: var(--dynamic-text-confirm-background-hover, #10b981); }
:where(.dynamic-text-cancel) { background: var(--dynamic-text-cancel-background, #52525b); }
:where(.dynamic-text-cancel):hover { background: var(--dynamic-text-cancel-background-hover, #71717a); }
`;

/** Adds the default stylesheet to `<head>` once. Safe to call repeatedly. */
export function injectDefaultStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = DEFAULT_STYLESHEET;
  document.head.appendChild(style);
}

export function partClassName(
  part: DynamicTextPart,
  appearance: DynamicTextAppearance,
  ...extra: Array<string | undefined>
): string {
  return [PART_CLASS_NAMES[part], appearance.classNames?.[part], ...extra].filter(Boolean).join(' ');
}
