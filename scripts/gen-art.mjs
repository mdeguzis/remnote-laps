#!/usr/bin/env node
/**
 * Generate the marketplace logo from the same stopwatch drawing the UI uses.
 *
 * The mark lives in `src/lib/icon.ts` so there is exactly one drawing. Keeping a
 * hand-drawn PNG beside a hand-drawn component is how the two end up different
 * without anyone noticing.
 *
 * Writes only when the bytes change. This directory is watched during `npm run
 * dev`, and a generator that writes unconditionally into a watched directory
 * dirties a file on every compile and triggers the next one, which spins
 * forever with no symptom other than a hot machine.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const { stopwatchSVG } = await import(join(root, 'src/lib/icon.ts'));

/** The logo carries a filled disc behind the mark so it reads on any tile. */
function logoSVG() {
  const inner = stopwatchSVG('#f3f5f9', 100)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="26" fill="#2f3646"/>
  <g transform="translate(10 10)">${inner}</g>
</svg>`;
}

function writeIfChanged(path, bytes) {
  if (existsSync(path)) {
    const current = readFileSync(path);
    if (current.equals(Buffer.from(bytes))) {
      console.log(`[art] unchanged ${path}`);
      return false;
    }
  }
  writeFileSync(path, bytes);
  console.log(`[art] wrote ${path}`);
  return true;
}

const svg = logoSVG();
writeIfChanged(join(root, 'public/logo.svg'), svg);

// rsvg-convert is the only external dependency here, and the PNG it produces is
// checked in, so a machine without it can still build the plugin.
const scratch = mkdtempSync(join(tmpdir(), 'laps-art-'));
try {
  const svgPath = join(scratch, 'logo.svg');
  const pngPath = join(scratch, 'logo.png');
  writeFileSync(svgPath, svg);
  execFileSync('rsvg-convert', ['-w', '256', '-h', '256', svgPath, '-o', pngPath], { stdio: 'inherit' });
  writeIfChanged(join(root, 'public/logo.png'), readFileSync(pngPath));
} catch (error) {
  console.warn(`[art] could not rasterise the logo (${error.message}); keeping the checked-in PNG`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
