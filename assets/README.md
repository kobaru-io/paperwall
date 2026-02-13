# Paperwall Assets

This directory contains the official Paperwall logo and branding assets.

## Logo Files

- **`logo.svg`** — Vector logo (source file, 121 KB)
- **`logo.png`** — High-resolution raster logo (1024x1024, 909 KB)

## Usage

The logo features a friendly black dog reading a newspaper with "PAPERWALL" text. It represents the project's mission: making web content accessible through micropayments.

### Extension Icons

The logo is automatically resized for the Chrome extension in multiple sizes:
- 16x16 px (toolbar icon)
- 32x32 px (toolbar icon @2x)
- 48x48 px (extension management page)
- 128x128 px (Chrome Web Store)

Icon generation is handled by the extension build script.

### License

The Paperwall logo is part of the Paperwall project and is licensed under GPL-3.0-or-later, same as the codebase.

## Modification

To update the logo:
1. Replace `logo.svg` and/or `logo.png` in this directory
2. Regenerate extension icons:
   ```bash
   cd packages/extension
   magick ../../assets/logo.png -resize 16x16 icons/icon-16.png
   magick ../../assets/logo.png -resize 32x32 icons/icon-32.png
   magick ../../assets/logo.png -resize 48x48 icons/icon-48.png
   magick ../../assets/logo.png -resize 128x128 icons/icon-128.png
   npm run build
   ```
