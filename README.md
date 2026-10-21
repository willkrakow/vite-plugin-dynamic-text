# vite-plugin-dynamic-text

Edit your site's copy in place while `vite dev` is running. Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on macOS), click any piece of text, change it, and press <kbd>Enter</kbd>. The new text is written back to a JSON file in your repo, so you commit copy changes like any other change.

In production builds, including SSR and prerendering, the component renders plain text. The editor, the stylesheet and the network calls are all left out.

- Works with React 18+ and Vite 5+
- Copy lives in one JSON file you own and review in diffs
- Keys that are missing are added to the file automatically from the component's children
- Has a default editor theme that you can restyle or turn off

## Install

```bash
pnpm add -D vite-plugin-dynamic-text
```

npm and yarn work too. React is an optional peer dependency, needed only for the `/react` entry.

## Setup

**1. Add the plugin** in `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dynamicText from 'vite-plugin-dynamic-text';

export default defineConfig({
  plugins: [react(), dynamicText()],
});
```

**2. Create the copy file.** It's `src/data/copy.json` by default:

```json
{
  "hero": {
    "title": "Hello, world",
    "tagline": "Alt+click me in dev."
  }
}
```

**3. Wrap your app in the provider**, then render copy with `<DynamicText>`:

```tsx
import { DynamicText, DynamicTextProvider } from 'vite-plugin-dynamic-text/react';

export function App() {
  return (
    <DynamicTextProvider>
      <DynamicText path="hero.title" as="h1" />
      <DynamicText path="hero.tagline" as="p" />
      <DynamicText path="hero.cta">Get started</DynamicText>
    </DynamicTextProvider>
  );
}
```

`hero.cta` isn't in the file yet, so in dev it renders `Get started` and adds that text to `copy.json` under `hero.cta`.

There's a runnable version in [`example/`](example). Run it with `pnpm install && pnpm build && pnpm --dir example dev`.

## Plugin options

```ts
dynamicText({
  filePath: 'src/data/copy.json',
  root: undefined,
});
```

| Option | Default | Description |
|---|---|---|
| `filePath` | `'src/data/copy.json'` | The copy file, absolute or relative to the Vite root. A missing file is treated as `{}` and created on the first edit. |
| `root` | none | A key (dot-notated for deeper nesting) that paths resolve under. With `root: 'text'`, `path="hero.title"` reads `text.hero.title`. The client gets this value from the plugin, so you only set it once. |

## `<DynamicText>`

| Prop | Type | Description |
|---|---|---|
| `path` | `string` | Dot-notated key, such as `"hero.title"` or `` `claims.${id}.body` ``. |
| `children` | `string \| number` | Fallback text for a key that's missing. In dev, it's also written to the file. |
| `as` | `ElementType` | The element or component to render. Defaults to `span`. |
| `className` | `string` | Applied in both dev and production. |

Text is resolved in this order: the value in the file, then `children`, then `[path]` as a visible placeholder.

**Editing:** <kbd>Alt</kbd>+click to open the editor. <kbd>Enter</kbd> or ✓ saves, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line break, and <kbd>Esc</kbd> or ✕ cancels. Saving updates the page straight away. The file is written in the background, without a reload. If you edit `copy.json` yourself, the page reloads to show the change.

### `useDynamicText()`

Use this hook when you need copy as a string, for example in an `alt` or `placeholder` attribute:

```tsx
const { getText } = useDynamicText();
<input placeholder={getText('signup.email_placeholder', 'you@example.com')} />;
```

It also returns `updateText(path, value)` and `initText(path, defaultValue)`. Outside a provider it falls back to reading the file, and those two functions do nothing.

## Styling the editor

By default the editor shows an amber dashed outline on hover, a solid outline while editing, and green ✓ and grey ✕ buttons. You can restyle it at four levels. Each level overrides the ones before it.

**1. CSS custom properties.** Set them once to re-theme everything:

```css
:root {
  --dynamic-text-accent: #6366f1;          /* outline while editing */
  --dynamic-text-accent-muted: #6366f199;  /* dashed outline on hover */
  --dynamic-text-editing-background: white;
  --dynamic-text-confirm-background: #4f46e5;
  --dynamic-text-confirm-background-hover: #6366f1;
  --dynamic-text-cancel-background: #475569;
  --dynamic-text-cancel-background-hover: #64748b;
}
```

**2. Your own CSS, using the built-in classes.** Every rule in the default stylesheet is wrapped in `:where()`, so it has zero specificity and any selector you write wins:

| Class | Element |
|---|---|
| `.dynamic-text` | The rendered element, in every state. It also carries `data-state="idle" \| "editing" \| "saving"` and `data-path`. |
| `.dynamic-text-editing` | Added to the same element while the editor is open. |
| `.dynamic-text-editable` | The `contentEditable` text. |
| `.dynamic-text-actions` | The wrapper around the buttons. |
| `.dynamic-text-confirm` / `.dynamic-text-cancel` | The buttons. |

```css
.dynamic-text-confirm { border-radius: 9999px; }
.dynamic-text[data-state='saving'] { opacity: 0.6; }
```

**3. Classes or inline styles from the provider.** Both are set per part (`root`, `editing`, `editable`, `actions`, `confirm`, `cancel`). This suits utility CSS like Tailwind:

```tsx
<DynamicTextProvider
  classNames={{ editing: 'rounded-md ring-2 ring-indigo-500', confirm: 'bg-indigo-600' }}
  styles={{ confirm: { borderRadius: 9999 } }}
>
```

Inline `styles` take precedence over every stylesheet. If you pass these objects inline, memoise them or hoist them to module scope so the provider doesn't re-render each time.

**4. `unstyled`.** This skips injecting the default stylesheet. The classes and `data-state` are still rendered, so you can style the editor from scratch:

```tsx
<DynamicTextProvider unstyled>
```

The stylesheet is injected only in dev, the first time a `<DynamicText>` renders. Production output carries only your `className`.

## Production and SSR

`<DynamicText>` checks `import.meta.env.DEV`. When it's false, the component renders `<as className>{text}</as>` with no event handlers, `title` or data attributes, and it doesn't inject the stylesheet. The plugin serves `virtual:dynamic-text/copy` in every mode, so client builds, `vite build --ssr` and prerender scripts all read the same file. The file's contents are inlined into your bundle.

The plugin also sets `optimizeDeps.exclude` and `ssr.noExternal` for this package automatically. That's needed because the client entry imports a virtual module, which only Vite can resolve.

## Using the virtual module directly

```ts
/// <reference types="vite-plugin-dynamic-text/client" />
import { copy, root } from 'virtual:dynamic-text/copy';
```

## Security

The plugin adds two `POST` endpoints, `/__dynamic_text/update` and `/__dynamic_text/init`, to the **dev server only**. They're never part of a build, but anyone who can reach your dev server can use them to rewrite the copy file. To limit that, the endpoints:

- write only to the configured file, and only string values
- reject `__proto__`, `prototype` and `constructor` path segments, as well as empty ones
- answer `415` unless the request is `Content-Type: application/json`, and `403` when an `Origin` header doesn't match the host. This stops other sites open in your browser from posting to your dev server.
- cap request bodies at 64 KB (`413`)
- run writes one at a time, so concurrent edits can't overwrite each other

> **Warning:** `vite --host` (or `server.host`) exposes the dev server, and with it these file-writing endpoints, to your network. Only do that on a network you trust.

## Contributing

```bash
pnpm install
pnpm test        # vitest: plugin (node) and React (jsdom) projects
pnpm typecheck
pnpm lint
pnpm build       # tsup → dist/
```

## License

[MIT](LICENSE)
