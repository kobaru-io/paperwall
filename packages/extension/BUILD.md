# Build Instructions

This document provides reproducible build instructions for AMO (addons.mozilla.org) source code submission review and for Microsoft Edge Add-ons store submission.

## Requirements

- Node.js: v22.22.0
- npm: 10.9.4
- Operating system: Linux, macOS, or Windows (WSL)

## Steps

### 1. Install dependencies

Run from the **repository root** (`paperwall/`):

```bash
npm install
```

### 2. Build the extension

Run from the **repository root** (`paperwall/`):

```bash
npm run build
```

This command builds all packages in the monorepo. The extension build specifically runs `packages/extension/build.ts` via `tsx`.

### 3. Expected output

After a successful build, two directories are produced inside `packages/extension/`:

**`packages/extension/dist-chrome/`** — Chrome and Microsoft Edge distribution
- `background.js` — Service worker (IIFE format, Chrome 120+ / Firefox 140+)
- `content-script.js` — Content script
- `popup.js` — Popup UI
- `popup.html` — Popup HTML
- `styles.css` — Popup styles
- `manifest.json` — MV3 manifest (dual-browser: Chrome service_worker + Firefox scripts)
- `icons/` — Extension icons (16px, 32px, 48px, 128px)

**`packages/extension/dist-firefox/`** — Firefox distribution (same JS/HTML/CSS files as dist-chrome/, but with .map files removed and sourceMappingURL comments stripped from JS files)

### 4. Verify the output

```bash
ls packages/extension/dist-chrome/
ls packages/extension/dist-firefox/
```

`dist-chrome/` should contain: `background.js`, `background.js.map`, `content-script.js`, `content-script.js.map`, `popup.js`, `popup.js.map`, `popup.html`, `styles.css`, `manifest.json`, `icons/`

`dist-firefox/` should contain: `background.js`, `content-script.js`, `popup.js`, `popup.html`, `styles.css`, `manifest.json`, `icons/` (no `.map` files; `sourceMappingURL` tail comments are also stripped from the JS files)

### 5. Package for submission

Run from the **repository root** (`paperwall/`):

```bash
npm run pack:ext
```

This generates all three artifacts in `packages/extension/releases/`:

| File | Destination |
|------|-------------|
| `paperwall-chrome.zip` | Chrome Web Store / Microsoft Edge Add-ons (Partner Center) |
| `paperwall-firefox.xpi` | addons.mozilla.org (AMO) |
| `paperwall-source.zip` | AMO source code submission (required for bundled extensions) |

The `releases/` directory is git-ignored. To build and package in one step:

```bash
npm run build && npm run pack:ext
```

## Notes

- The extension uses [esbuild](https://esbuild.github.io/) (via `tsx`) for bundling. All background, content, and popup scripts are bundled to IIFE format targeting Chrome 120 and Firefox 140.
- The `dist-firefox/` directory is produced by copying `dist-chrome/` after the build completes. The two directories differ: `dist-chrome/` retains `.map` files and `sourceMappingURL` comments for developer convenience, while `dist-firefox/` has all `.map` files deleted and all `sourceMappingURL` tail comments stripped from the JS files (current behavior, implemented in `build.ts`).
- `.map` files (`background.js.map`, `content-script.js.map`, `popup.js.map`) are present in `dist-chrome/` only. **Important hygiene note:** esbuild's `sourcemap: true` setting embeds the full TypeScript source of every bundled module inside these `.map` files via the `sourcesContent` field — an AMO reviewer can read the complete original source through the `.map` files included in the `.xpi`. This is acceptable and beneficial for AMO review (reviewers can verify the bundled output matches the declared source), but it means **secrets must never appear in any source file that gets bundled** (e.g. hardcoded private keys, API tokens, or credentials), because they would be fully visible in the distributed `.map` files.
- The manifest (`manifest.json`) uses a dual `background` key strategy: `service_worker` for Chrome/Edge and `scripts` for Firefox. Both browsers ignore the key they do not support.

## Manifest Fields

### `data_collection_permissions` (AMO Required)

The `browser_specific_settings.gecko.data_collection_permissions` field inside `manifest.json` is **required by AMO policy** as of November 2025. Do not remove it, even though it may produce lint warnings from non-Mozilla tooling or JSON schema validators that don't know this field.

**Source:** https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/

Chrome and Edge ignore unrecognized keys inside `browser_specific_settings`, so this field does not affect Chrome/Edge behaviour. The `dist-chrome/manifest.json` used for Chrome/Edge distribution has `browser_specific_settings` stripped entirely by the build script (see `build.ts`), so Chrome will never see this field at all.
