import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { useDynamicText } from './context.tsx';
import { injectDefaultStyles, partClassName } from './styles.ts';

export interface DynamicTextProps {
  /** Dot-notated path to the copy key, e.g. `"hero.title"`. */
  path: string;
  /**
   * Fallback text when the key is missing from the copy file. In dev, a missing key is
   * initialised in the file from this text.
   */
  children?: ReactNode;
  /** The element or component to render. Defaults to `'span'`. */
  as?: ElementType;
  /** Class names for the rendered element, applied in both dev and production. */
  className?: string;
}

type EditorState = 'idle' | 'editing' | 'saving';

function childText(children: ReactNode): string {
  return typeof children === 'string' || typeof children === 'number' ? String(children) : '';
}

function stop(e?: MouseEvent | KeyboardEvent) {
  e?.preventDefault();
  e?.stopPropagation();
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function DevDynamicText({ path, children, as: Component = 'span', className }: DynamicTextProps) {
  const { getText, updateText, initText, appearance } = useDynamicText();
  const [state, setState] = useState<EditorState>('idle');
  const editableRef = useRef<HTMLSpanElement>(null);

  const defaultText = childText(children);
  const storedValue = getText(path);
  const hasStored = storedValue !== '';
  const displayText = hasStored ? storedValue : defaultText || `[${path}]`;

  useEffect(() => {
    if (!appearance.unstyled) injectDefaultStyles();
  }, [appearance.unstyled]);

  // Write missing keys into the copy file the first time they render.
  useEffect(() => {
    if (!hasStored && defaultText) void initText(path, defaultText);
  }, [hasStored, defaultText, path, initText]);

  const isOpen = state !== 'idle';

  // Focus the editor and select its text when it opens.
  useEffect(() => {
    const el = editableRef.current;
    if (state !== 'editing' || !el) return;
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // Selection APIs are incomplete in some test environments.
    }
  }, [state]);

  const handleStartEdit = (e: MouseEvent) => {
    if (!e.altKey) return;
    stop(e);
    setState('editing');
  };

  const handleConfirm = async (e?: MouseEvent | KeyboardEvent) => {
    stop(e);
    const el = editableRef.current;
    const newText = (el?.innerText ?? el?.textContent ?? displayText).replace(/\n$/, '');
    if (newText === displayText) {
      setState('idle');
      return;
    }
    setState('saving');
    try {
      await updateText(path, newText);
    } finally {
      setState('idle');
    }
  };

  const handleCancel = (e?: MouseEvent | KeyboardEvent) => {
    stop(e);
    setState('idle');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      void handleConfirm(e);
    } else if (e.key === 'Escape') {
      handleCancel(e);
    }
  };

  const { styles } = appearance;

  if (isOpen) {
    return (
      <Component
        className={partClassName('root', appearance, partClassName('editing', appearance), className)}
        style={{ ...styles?.root, ...styles?.editing }}
        data-path={path}
        data-state={state}
      >
        <span
          ref={editableRef}
          contentEditable={state === 'editing'}
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          className={partClassName('editable', appearance)}
          style={styles?.editable}
          data-testid="dynamic-text-editable"
        >
          {displayText}
        </span>
        <span className={partClassName('actions', appearance)} style={styles?.actions} contentEditable={false}>
          <button
            type="button"
            data-testid="dynamic-text-confirm"
            aria-label="Confirm edit"
            title="Confirm (Enter)"
            disabled={state === 'saving'}
            onClick={handleConfirm}
            className={partClassName('confirm', appearance)}
            style={styles?.confirm}
          >
            <svg {...iconProps}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="dynamic-text-cancel"
            aria-label="Cancel edit"
            title="Cancel (Esc)"
            disabled={state === 'saving'}
            onClick={handleCancel}
            className={partClassName('cancel', appearance)}
            style={styles?.cancel}
          >
            <svg {...iconProps}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      </Component>
    );
  }

  return (
    <Component
      onClick={handleStartEdit}
      title={`Alt + click to edit (${path})`}
      className={partClassName('root', appearance, className)}
      style={styles?.root}
      data-path={path}
      data-state={state}
    >
      {displayText}
    </Component>
  );
}

/**
 * Renders the copy at `path`. In production (including SSR builds) this is plain text in
 * `as`. Under `vite dev`, Alt+click opens an inline editor that writes back to the copy file.
 */
export function DynamicText({ path, children, as: Component = 'span', className }: DynamicTextProps) {
  const { getText } = useDynamicText();

  if (!import.meta.env.DEV) {
    const text = getText(path) || childText(children) || `[${path}]`;
    return <Component className={className}>{text}</Component>;
  }

  return (
    <DevDynamicText path={path} as={Component} className={className}>
      {children}
    </DevDynamicText>
  );
}
