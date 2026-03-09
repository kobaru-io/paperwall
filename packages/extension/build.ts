import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  const distDir = 'dist';

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Service Worker (IIFE, Chrome + Firefox compatible)
  await esbuild.build({
    entryPoints: ['src/background/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: `${distDir}/background.js`,
    target: ['chrome120', 'firefox121'],
    // Sourcemaps are generated for all bundles. The dist-firefox/ copy step below
    // strips all .map files from the Firefox distribution so they are not included
    // in the .xpi submitted to AMO. The Chrome dist/ retains .map files for
    // developer convenience. See the strip step after fs.cpSync below.
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });

  // Content Script (IIFE, no module support)
  await esbuild.build({
    entryPoints: ['src/content/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: `${distDir}/content-script.js`,
    target: ['chrome120', 'firefox121'],
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });

  // Popup (IIFE)
  await esbuild.build({
    entryPoints: ['src/popup/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: `${distDir}/popup.js`,
    target: ['chrome120', 'firefox121'],
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
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

  // Strip browser_specific_settings from Chrome distribution manifest.
  // The gecko-specific fields (extension ID, strict_min_version, data_collection_permissions)
  // are irrelevant noise for Chrome/Edge and can confuse Chrome's manifest parser.
  // dist-firefox/ retains the full manifest with gecko fields.
  const chromeManifestPath = path.join(distDir, 'manifest.json');
  const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8')) as Record<string, unknown>;
  delete chromeManifest['browser_specific_settings'];
  fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 2) + '\n');

  // Copy dist/ to dist-firefox/ (retains full manifest with gecko fields)
  const distFirefoxDir = 'dist-firefox';
  if (fs.existsSync(distFirefoxDir)) {
    fs.rmSync(distFirefoxDir, { recursive: true, force: true });
  }
  fs.cpSync(distDir, distFirefoxDir, { recursive: true });

  // Restore the full manifest (with browser_specific_settings) in dist-firefox/
  // by copying the original manifest.json before the gecko fields were stripped.
  copyFile('manifest.json', path.join(distFirefoxDir, 'manifest.json'));

  // Strip sourcemaps from Firefox distribution to avoid embedding TypeScript source
  // in the .xpi. AMO reviewers access source via the declared source zip, not .map files.
  const mapFiles = fs.readdirSync(distFirefoxDir).filter(f => f.endsWith('.map'));
  for (const mapFile of mapFiles) {
    fs.unlinkSync(path.join(distFirefoxDir, mapFile));
  }

  // Strip sourceMappingURL comments from Firefox distribution JS files
  const jsFiles = fs.readdirSync(distFirefoxDir).filter(f => f.endsWith('.js'));
  for (const jsFile of jsFiles) {
    const jsPath = path.join(distFirefoxDir, jsFile);
    const content = fs.readFileSync(jsPath, 'utf-8');
    const stripped = content.replace(/\n\/\/#\s*sourceMappingURL=.*\.map\s*$/, '');
    if (stripped !== content) {
      fs.writeFileSync(jsPath, stripped, 'utf-8');
    }
  }

  console.log('Extension built successfully');
}

function copyFile(src: string, dest: string): void {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    throw new Error(`Build error: required source file not found: ${src}`);
  }
}

build().catch((e) => { console.error(e); process.exit(1); });
