import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const html = read("index.html");
const css = read("site.css");
const lock = read("forma.lock");

test("one descriptive title, one H1, and metadata", () => {
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<title>EchoWorks \| Architecture/);
  assert.match(html, /name="description" content="[^"]+"/);
  assert.match(html, /<meta name="viewport"/);
});

test("Forma is pinned and no Echelon marketing skin is loaded", () => {
  assert.match(html, /assets\/forma\/forma-marketing\.css/);
  assert.doesNotMatch(html, /forma-echelon-marketing\.css|forma-marketing-theme-echelon\.css/);
  assert.match(lock, /^forma 0\.4\.1$/m);
  assert.match(lock, /^asset forma-marketing\.css sha256:[a-f0-9]{64}$/m);
  assert.match(html, /class="ef-site ew-site"/);
  assert.match(html, /class="ef-site-header ew-header"/);
});

test("navigation, anchors, and controls are real and machine-addressable", () => {
  assert.match(html, /href="#main-content"/);
  assert.match(html, /id="main-content" tabindex="-1"/);
  assert.match(html, /<details class="ew-mobile-menu" data-testid="mobile-navigation">/);
  assert.match(html, /<summary aria-label="Toggle menu">/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs must be unique");
  const idSet = new Set(ids);
  for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) {
    assert.ok(idSet.has(match[1]), "anchor target missing: " + match[1]);
  }
  assert.doesNotMatch(html, /href=["'](?:#["']|javascript:|mailto:hello@example)/i);
  for (const id of ["header", "hero", "services", "approach", "studio", "contact"]) {
    assert.match(html, new RegExp('data-testid="' + id + '"'));
  }
});

test("published business data is consistent across contact paths", () => {
  assert.match(html, /jacquelyn\.brice@echoworks\.studio/);
  assert.match(html, /tel:\+18125842085/);
  assert.match(html, /Jacquelyn Brice/);
  assert.match(html, /Indiana and Ohio/);
  assert.match(html, /Construction administration/i);
});

test("editorial photographs are not presented as completed projects", () => {
  assert.match(html, /ILLUSTRATIVE IMAGE/);
  assert.match(html, /not EchoWorks project photographs/);
  assert.match(html, /JackieHeadshots-6\.jpg/);
  assert.doesNotMatch(html, /our completed projects|\d+ successful projects/i);
});

test("design is narrow-screen and accessible without JavaScript", () => {
  assert.match(css, /max-width: 620px/);
  assert.match(css, /max-width: 370px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(html, /<script\b/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /fetchpriority="high"/);
});

test("required publishing files are present", () => {
  for (const file of ["index.html","site.css","forma.lock","favicon.svg","robots.txt","sitemap.xml",".nojekyll"]) {
    assert.ok(existsSync(join(root.pathname, file)), "missing: " + file);
  }
});
