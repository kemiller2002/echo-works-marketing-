import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInquiryMailto } from "../contact.mjs";

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
  for (const file of ["index.html","site.css","contact.mjs","forma.lock","favicon.svg","robots.txt","sitemap.xml",".nojekyll"]) {
    assert.ok(existsSync(join(root.pathname, file)), "missing: " + file);
  }
});

test("Contact us keeps the original studio's invitation and offers a complete accessible inquiry", () => {
  assert.match(html, /Contact us/);
  assert.match(html, /Interested in working together/);
  assert.match(html, /<form[^>]+id="project-inquiry"[^>]+data-testid="inquiry-form"/);
  const names = ["name", "email", "phone", "projectType", "location", "message"];
  for (const name of names) {
    assert.match(html, new RegExp('name="' + name + '"'), "missing field " + name);
  }
  for (const id of ["inquiry-name", "inquiry-email", "inquiry-phone", "inquiry-type", "inquiry-location", "inquiry-message"]) {
    assert.match(html, new RegExp('for="' + id + '"'), "missing accessible label " + id);
    assert.match(html, new RegExp('id="' + id + '"'), "missing form control " + id);
  }
  for (const id of ["inquiry-name","inquiry-email","inquiry-message"]) {
    const tag = html.match(new RegExp('<(?:input|textarea)[^>]+id="' + id + '"[^>]*>', "s"))?.[0];
    assert.ok(tag?.includes("required"), "required field must validate: " + id);
  }
  assert.match(html, /type="email"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Your email app will open, and you.ll need to press Send/);
  assert.match(html, /Nothing is stored on this website/);
  assert.doesNotMatch(html, /action="(?:#|https?:\/\/[^"]*)"/);
});

test("inquiry adapter encodes all user data in a draft without claiming submission", () => {
  const uri = createInquiryMailto({
    name: "Alex Builder",
    email: "alex@example.com",
    phone: "555-555-5555",
    projectType: "Construction administration",
    location: "Indianapolis, IN",
    message: "We need an architectural partner & a clear plan."
  });
  assert.ok(uri.startsWith("mailto:jacquelyn.brice@echoworks.studio?subject="));
  assert.equal(new URLSearchParams(uri.split("?")[1]).get("subject"), "EchoWorks inquiry: Construction administration");
  const body = new URLSearchParams(uri.split("?")[1]).get("body");
  for (const fragment of ["Alex Builder","alex@example.com","555-555-5555","Construction administration","Indianapolis, IN","architectural partner & a clear plan"]) {
    assert.ok(body.includes(fragment), "message must contain: " + fragment);
  }
  assert.doesNotMatch(uri, /[\r\n]/);
  const hostile = createInquiryMailto({projectType:"Architectural rendering\r\nBcc:mail@example.org", name:"Someone",email:"safe@example.org",message:"Hello"});
  assert.ok(!new URLSearchParams(hostile.split("?")[1]).get("subject").includes("\n"), "subject cannot gain extra headers");
});

test("new visual identity is distinct, readable, and responsive", () => {
  assert.match(css, /--ew-paper: #f6f1e8/);
  assert.match(css, /--ew-dark: #51343a/);
  assert.match(css, /--ew-display: "Fraunces"/);
  assert.match(css, /--ew-sans: "Source Sans 3"/);
  assert.match(html, /family=Fraunces/);
  assert.match(html, /family=Source\+Sans\+3/);
  assert.doesNotMatch(css, /#1f3530|#243e35|#172c25|Italiana|DM Sans/i);
  assert.match(css, /font: 500 clamp\(1\.15rem,1\.36vw,1\.32rem\)\/1\.65/);
  assert.match(css, /\.ew-form-grid \{ grid-template-columns: 1fr;/);
});
