import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  const distDir = 'dist';

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Service Worker (ESM, Chrome 120+)
  await esbuild.build({
    entryPoints: ['src/background/index.ts'],
    bundle: true,
    format: 'esm',
    outfile: `${distDir}/background.js`,
    target: 'chrome120',
    sourcemap: true,
  });

  // Content Script (IIFE, no module support)
  await esbuild.build({
    entryPoints: ['src/content/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: `${distDir}/content-script.js`,
    target: 'chrome120',
    sourcemap: true,
  });

  // Popup (IIFE)
  await esbuild.build({
    entryPoints: ['src/popup/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: `${distDir}/popup.js`,
    target: 'chrome120',
    sourcemap: true,
  });

  // Copy static files
  copyFile('manifest.json', `${distDir}/manifest.json`);
  copyFile('src/popup/index.html', `${distDir}/popup.html`);
  copyFile('src/popup/styles.css', `${distDir}/styles.css`);

  // Copy icons
  const iconsDistDir = path.join(distDir, 'icons');
  if (!fs.existsSync(iconsDistDir)) {
    fs.mkdirSync(iconsDistDir, { recursive: true });
  }
  copyFile('icons/icon-16.png', `${iconsDistDir}/icon-16.png`);
  copyFile('icons/icon-32.png', `${iconsDistDir}/icon-32.png`);
  copyFile('icons/icon-48.png', `${iconsDistDir}/icon-48.png`);
  copyFile('icons/icon-128.png', `${iconsDistDir}/icon-128.png`);

  console.log('Extension built successfully');
}

function copyFile(src: string, dest: string): void {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    console.warn(`Warning: ${src} not found, skipping copy`);
  }
}

build().catch((e) => { console.error(e); process.exit(1); });
