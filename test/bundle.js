#!/usr/bin/env node
/*
 * bundle.js — produce ONE self-contained .html file.
 *
 * WHY THIS EXISTS
 * ---------------
 * "It doesn't load on my phone" has two completely different causes and they
 * look identical to the visitor:
 *
 *   1. the page loaded but WebGL failed   -> fixed in v7/v8, reported on-page
 *   2. the page never arrived at all      -> phone can't reach the PC's server
 *      (firewall, AP isolation on the router, wrong IP, server not running)
 *
 * No amount of rendering work fixes cause 2. This bundle removes the server
 * from the equation: every script, every stylesheet and the whole of three.js
 * are inlined into a single file that runs from file:// — so the phone can open
 * it straight out of its own Downloads folder with no network at all.
 *
 * Safe to do here because the project makes ZERO fetch/XHR calls and all art is
 * procedural Canvas2D, so nothing trips the file:// origin restrictions that
 * normally break bundled pages.
 *
 * Usage:  node test/bundle.js [outfile]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'portfolio-standalone.html');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let html = read('index.html');

/* ------------------------------------------------------------------ helpers */

/* A </script> sequence anywhere inside inlined JS would close the tag early and
   dump the rest of the library into the document as text. Same for <!-- which
   opens an HTML comment inside a script block. */
function safeJS(src) {
  return src
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<!--/g, '<\\u0021--');
}

function inlineTag(tagRe, wrap) {
  let count = 0;
  html = html.replace(tagRe, (full, file) => {
    const clean = file.split('?')[0];
    const abs = path.join(ROOT, clean);
    if (!fs.existsSync(abs)) {
      console.log(`  ! skipped (missing): ${clean}`);
      return full;
    }
    count++;
    const bytes = fs.statSync(abs).size;
    console.log(`  + ${clean}  (${(bytes / 1024).toFixed(1)} KB)`);
    return wrap(fs.readFileSync(abs, 'utf8'), clean);
  });
  return count;
}

/* ------------------------------------------------------------- do the inline */

console.log('Inlining stylesheets…');
const cssCount = inlineTag(
  /<link\s+rel="stylesheet"\s+href="((?!https?:)[^"]+)"\s*\/?>/gi,
  (css, name) => `<style>\n/* ${name} */\n${css}\n</style>`
);

console.log('Inlining scripts…');
const jsCount = inlineTag(
  /<script\s+src="((?!https?:)[^"]+)"\s*><\/script>/gi,
  (js, name) => `<script>\n/* ${name} */\n${safeJS(js)}\n</script>`
);

/* The Google Fonts link is the one remote request left. In a standalone file
   opened offline it can only cost time, so drop it — the CSS already falls back
   to system-ui and the layout is identical. */
const fontsBefore = html.length;
html = html.replace(
  /<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*/gi, ''
);
const fontsRemoved = fontsBefore !== html.length;

/* Strip HTML comments. They're developer notes that only inflate a file which
   has to travel to a phone over Bluetooth or a cable, and one of them mentions
   fonts.googleapis.com — which makes "is anything remote left?" impossible to
   verify by grep. The build banner is kept. */
html = html.replace(/<!--(?!\s*SELF-CONTAINED)[\s\S]*?-->/g, '');

/* diag.html and phone-test.html don't exist next to a standalone file, so drop
   the links rather than shipping a dead button. */
html = html.replace(
  /<a class="btn alt" href="(diag|phone-test)\.html">[^<]*<\/a>\s*/g,
  ''
);

/* Mark the build so support questions are unambiguous. */
html = html.replace(
  /<title>([^<]*)<\/title>/,
  `<title>$1 (standalone)</title>\n<!-- SELF-CONTAINED BUILD — generated ${new Date().toISOString()} -->`
);

/* ------------------------------------------------------------------- verify */

const problems = [];
if (cssCount < 1) problems.push('no stylesheet was inlined');
/* Count the app + vendor scripts index.html actually declares, so adding a file
   can never leave a silently-unbundled standalone build. */
const declared = (read('index.html').match(/<script src="(?!https?:)[^"]+"><\/script>/g) || []).length;
if (jsCount < declared) problems.push(`only ${jsCount} scripts inlined, expected ${declared}`);
if (/<script\s+src="(?!https?:)/i.test(html)) problems.push('a local <script src> survived');
if (/<link\s+rel="stylesheet"\s+href="(?!https?:)/i.test(html)) problems.push('a local stylesheet link survived');
if (!/THREE/.test(html)) problems.push('three.js is not present in the output');
if (!/__bootFail/.test(html)) problems.push('the boot guard is missing');
if (!/World\s*=/.test(html) && !/window\.World/.test(html)) problems.push('world.js is missing');

if (problems.length) {
  console.error('\nBUNDLE FAILED:');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}

fs.writeFileSync(OUT, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);

console.log('\n─────────────────────────────────────────────');
console.log(`  ${cssCount} stylesheet(s) + ${jsCount} script(s) inlined`);
console.log(`  remote fonts removed: ${fontsRemoved ? 'yes' : 'none found'}`);
console.log(`  wrote ${path.relative(process.cwd(), OUT)}  (${kb} KB)`);
console.log('  opens from file:// — no server needed');
console.log('─────────────────────────────────────────────');
