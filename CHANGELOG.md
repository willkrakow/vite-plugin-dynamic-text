# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/) (still `0.x`, so minor versions may break).

## [Unreleased]

### Added

- Initial release, extracted from the Bramble website's in-place copy editor.
- Vite plugin with `filePath` and `root` options. It serves the copy file as
  `virtual:dynamic-text/copy` in dev, client and SSR builds, and it writes edits back through
  `POST /__dynamic_text/update` and `/__dynamic_text/init` under `vite dev`.
- `vite-plugin-dynamic-text/react`: `DynamicText`, `DynamicTextProvider`, `useDynamicText`.
- Default editor theme that can be overridden through stable class names, CSS custom
  properties, the provider's `classNames` and `styles` props, or `unstyled`.

### Security

- Rejects `__proto__`, `prototype` and `constructor` path segments (prototype pollution) and
  empty segments.
- Caps request bodies at 64 KB (`413`), requires string values and `application/json`, and
  refuses cross-origin requests.
- Serialises writes so concurrent edits can't overwrite each other.
