import { expect } from "@playwright/test";

// Local mirror of Forma's reference conformance helpers
// (kemiller2002/forma PR #155, tests/site-browser/ui-conformance-helpers.mjs)
// for the canonical contract visual-engineering/UI-LAYOUT-INTERACTION@1.0.0.
// This file cites that contract; it does not redefine it. Exported names and
// signatures match Forma's so this file can be replaced by the published
// shared helpers without changing the specs. Functions in the "Local
// extensions" section are not (yet) in Forma and are candidates for upstream.
//
// Pure evaluation functions decide a status; thin browser adapters only
// observe. Missing evidence is UNKNOWN, never PASS.

export const STATUS = Object.freeze({ PASS: "PASS", FAIL: "FAIL", UNKNOWN: "UNKNOWN" });
export const DEFAULT_TOLERANCE_CSS_PX = 1;
export const DEFAULT_TIMEOUT_MS = 5000;

const EDGES = Object.freeze({
  top: box => box.y,
  bottom: box => box.y + box.height,
  center: box => box.y + box.height / 2,
  left: box => box.x,
  right: box => box.x + box.width
});

// ---------------------------------------------------------------------------
// Pure helpers (Forma API)
// ---------------------------------------------------------------------------

const describeTarget = ({ role, name }) => `${role} "${name instanceof RegExp ? name.source : name}"`;

const requireSemanticTarget = (target, label) => {
  if (!target?.role || target.name === undefined || target.name === "") {
    throw new Error(`${label} must specify both accessible role and name.`);
  }
  return target;
};

export const edgeCoordinate = (box, edge) => {
  const read = EDGES[edge];
  if (!read) throw new Error(`Unsupported alignment edge "${edge}". Use one of: ${Object.keys(EDGES).join(", ")}.`);
  return read(box);
};

export const classifyPeerObservation = ({ peer, count, box }) => {
  const element = describeTarget(peer);
  if (count === 0) return { element, status: STATUS.UNKNOWN, reason: "element not found in the accessibility tree (missing or hidden)" };
  if (count > 1) return { element, status: STATUS.UNKNOWN, reason: `accessible name is ambiguous (${count} matches)` };
  if (!box) return { element, status: STATUS.UNKNOWN, reason: "no bounding box (not rendered)" };
  if (!(box.width > 0) || !(box.height > 0)) return { element, status: STATUS.UNKNOWN, reason: `zero-size box (${box.width}x${box.height})`, box };
  return { element, status: STATUS.PASS, box };
};

export const validateAlignmentGroup = group => {
  const { ruleId = "ULI-L01", id, peers, edge = "top", toleranceCssPx = DEFAULT_TOLERANCE_CSS_PX } = group ?? {};
  if (!id) throw new Error("A declared alignment group requires an id.");
  if (!Array.isArray(peers) || peers.length < 2) throw new Error(`Alignment group ${id} requires at least two declared peers.`);
  if (!/^ULI-L\d{2}$/.test(ruleId)) throw new Error(`Alignment group ${id} must cite a ULI-L rule ID.`);
  if (!(toleranceCssPx >= 0)) throw new Error(`Alignment group ${id} tolerance must be a non-negative number.`);
  peers.forEach((peer, index) => requireSemanticTarget(peer, `Peer ${index + 1} of ${id}`));
  edgeCoordinate({ x: 0, y: 0, width: 0, height: 0 }, edge);
  return Object.freeze({ ruleId, id, peers, edge, toleranceCssPx });
};

export const evaluateAlignment = (group, observations) => {
  const { ruleId, id, edge, toleranceCssPx } = validateAlignmentGroup(group);
  const measurements = observations.map(classifyPeerObservation)
    .map(item => (item.status === STATUS.PASS ? { ...item, coordinate: edgeCoordinate(item.box, edge) } : item));
  const base = { ruleId, group: id, edge, toleranceCssPx, measurements };
  const unknown = measurements.filter(item => item.status !== STATUS.PASS);
  if (unknown.length > 0) {
    return { ...base, status: STATUS.UNKNOWN, deltaCssPx: null, reason: unknown.map(item => `${item.element}: ${item.reason}`).join("; ") };
  }
  const coordinates = measurements.map(item => item.coordinate);
  const deltaCssPx = Math.max(...coordinates) - Math.min(...coordinates);
  const status = deltaCssPx <= toleranceCssPx ? STATUS.PASS : STATUS.FAIL;
  return { ...base, status, deltaCssPx,
    reason: `${edge}-edge delta ${deltaCssPx.toFixed(2)} CSS px ${status === STATUS.PASS ? "<=" : ">"} tolerance ${toleranceCssPx} CSS px` };
};

export const formatReport = report => {
  const details = (report.measurements ?? [])
    .map(item => `  - ${item.element}: ${item.status}${item.coordinate !== undefined ? ` ${report.edge}=${item.coordinate.toFixed(2)}px` : ""}${item.reason ? ` (${item.reason})` : ""}`)
    .join("\n");
  const subject = report.group ? `group ${report.group}` : report.action;
  return `${report.ruleId} ${report.status}: ${subject}: ${report.reason}${details ? `\n${details}` : ""}`;
};

export const matchesExpected = (observed, expected) => {
  if (observed === null || observed === undefined) return false;
  if (expected instanceof RegExp) return expected.test(String(observed));
  return observed === expected;
};

const OUTCOME_KINDS = Object.freeze({
  text: { needsTarget: true, expectedType: "string-or-regexp" },
  visible: { needsTarget: true, expectedType: "boolean" },
  checked: { needsTarget: true, expectedType: "boolean" },
  attribute: { needsTarget: true, expectedType: "string-or-regexp" },
  url: { needsTarget: false, expectedType: "string-or-regexp" }
});

export const validateActionContract = contract => {
  const { ruleId = "ULI-A02", action, outcome, timeoutMs = DEFAULT_TIMEOUT_MS } = contract ?? {};
  requireSemanticTarget(action, "Action control");
  if (!/^ULI-A\d{2}$/.test(ruleId)) throw new Error("An action assertion must cite a ULI-A rule ID.");
  const kind = OUTCOME_KINDS[outcome?.kind];
  if (!kind) throw new Error(`An action requires an observable outcome kind: ${Object.keys(OUTCOME_KINDS).join(", ")}.`);
  if (kind.needsTarget) requireSemanticTarget(outcome.target, `Outcome target for ${outcome.kind}`);
  if (outcome.kind === "attribute" && !outcome.attribute) throw new Error("Attribute outcome requires an attribute name.");
  const typeOk = kind.expectedType === "boolean"
    ? typeof outcome.expected === "boolean"
    : typeof outcome.expected === "string" || outcome.expected instanceof RegExp;
  if (!typeOk) throw new Error(`Outcome ${outcome.kind} requires an explicit expected ${kind.expectedType} post-state.`);
  if (!(timeoutMs > 0 && Number.isFinite(timeoutMs))) throw new Error("Action assertions require a bounded positive timeoutMs.");
  return Object.freeze({ ruleId, action, outcome, timeoutMs });
};

export const evaluateActionPremise = ({ ruleId, action, outcome, pre, controlIssue }) => {
  const base = { ruleId, action: describeTarget(action), outcome: outcome.kind, expected: String(outcome.expected), pre, post: null };
  if (controlIssue) return { ...base, status: STATUS.UNKNOWN, reason: controlIssue };
  if (pre.missing && outcome.kind !== "visible") return { ...base, status: STATUS.UNKNOWN, reason: "outcome target not found before activation" };
  if (pre.count > 1) return { ...base, status: STATUS.UNKNOWN, reason: `outcome target name is ambiguous (${pre.count} matches)` };
  if (matchesExpected(pre.value, outcome.expected)) {
    return { ...base, status: STATUS.FAIL, reason: "pre-state already satisfies the expected post-state; no transition can be demonstrated" };
  }
  return null;
};

export const evaluateActionOutcome = ({ ruleId, action, outcome, pre, post, controlIssue }) => {
  const premise = evaluateActionPremise({ ruleId, action, outcome, pre, controlIssue });
  if (premise) return premise;
  const base = { ruleId, action: describeTarget(action), outcome: outcome.kind, expected: String(outcome.expected), pre, post };
  if (!post) return { ...base, status: STATUS.FAIL, reason: "no post-state observed" };
  if (!matchesExpected(post.value, outcome.expected)) return { ...base, status: STATUS.FAIL, reason: "expected post-state never appeared within the timeout" };
  if (post.value === pre.value) return { ...base, status: STATUS.FAIL, reason: "post-state equals pre-state" };
  return { ...base, status: STATUS.PASS, reason: "expected post-state observed after activation" };
};

// ---------------------------------------------------------------------------
// Browser adapters (Forma API, observation only)
// ---------------------------------------------------------------------------

// A target may carry an optional `scope` Locator (local extension) when the
// same accessible name legitimately appears in several landmarks, e.g. a
// header and a footer link both named "Features".
const semantic = (page, { role, name, scope }) => (scope ?? page).getByRole(role, { name, exact: typeof name === "string" });
const normalizeText = value => (value ?? "").replace(/\s+/g, " ").trim();

export const settleFontsAndFrames = page =>
  page.evaluate(() => document.fonts.ready.then(() =>
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));

const observePeer = async (page, peer, timeoutMs) => {
  const locator = semantic(page, peer);
  const count = await locator.count();
  const box = count === 1 ? await locator.boundingBox({ timeout: timeoutMs }) : null;
  return { peer, count, box };
};

const sameObservations = (a, b) =>
  a.length === b.length && a.every((item, index) => {
    const other = b[index];
    if (item.count !== other.count) return false;
    if (!item.box || !other.box) return item.box === other.box;
    return ["x", "y", "width", "height"].every(key => Math.abs(item.box[key] - other.box[key]) < 0.01);
  });

const readStableObservations = async (page, peers, timeoutMs, deadline, previous) => {
  await settleFontsAndFrames(page);
  const current = await Promise.all(peers.map(peer => observePeer(page, peer, timeoutMs)));
  if (previous && sameObservations(previous, current)) return current;
  if (Date.now() >= deadline) return null;
  return readStableObservations(page, peers, timeoutMs, deadline, current);
};

export const measureAlignment = async (page, group, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const declared = validateAlignmentGroup(group);
  const stable = await readStableObservations(page, declared.peers, timeoutMs, Date.now() + timeoutMs, null);
  if (!stable) {
    return { ruleId: declared.ruleId, group: declared.id, edge: declared.edge, toleranceCssPx: declared.toleranceCssPx,
      measurements: [], status: STATUS.UNKNOWN, deltaCssPx: null, reason: "layout did not stabilize within the timeout" };
  }
  return evaluateAlignment(declared, stable);
};

export const expectPeerAlignment = async (page, group, options) => {
  const report = await measureAlignment(page, group, options);
  expect(report.status, formatReport(report)).toBe(STATUS.PASS);
  return report;
};

const observeOutcome = async (page, outcome, timeoutMs) => {
  if (outcome.kind === "url") return { value: page.url(), missing: false };
  const target = semantic(page, outcome.target);
  const count = await target.count();
  if (outcome.kind === "visible") return { value: count === 1 ? await target.isVisible() : false, missing: count === 0, count };
  if (count !== 1) return { value: null, missing: count === 0, count };
  switch (outcome.kind) {
    case "text": return { value: normalizeText(await target.textContent({ timeout: timeoutMs })), missing: false, count };
    case "checked": return { value: await target.isChecked({ timeout: timeoutMs }), missing: false, count };
    case "attribute": return { value: await target.getAttribute(outcome.attribute, { timeout: timeoutMs }), missing: false, count };
    default: throw new Error(`Unsupported observable outcome: ${outcome.kind}`);
  }
};

const inspectControl = async control => {
  const count = await control.count();
  if (count === 0) return "action control not found";
  if (count > 1) return `action control name is ambiguous (${count} matches)`;
  if (!(await control.isVisible())) return "action control is not visible";
  if (!(await control.isEnabled())) return "action control is disabled";
  return null;
};

export const runActionAssertion = async (page, contract) => {
  const { ruleId, action, outcome, timeoutMs } = validateActionContract(contract);
  const control = semantic(page, action);
  const controlIssue = await inspectControl(control);
  const pre = await observeOutcome(page, outcome, timeoutMs);
  const premise = evaluateActionPremise({ ruleId, action, outcome, pre, controlIssue });
  if (premise) return premise;
  await control.click({ timeout: timeoutMs });
  const appeared = await expect(async () => {
    const observed = await observeOutcome(page, outcome, timeoutMs);
    expect(matchesExpected(observed.value, outcome.expected), `observed ${JSON.stringify(observed.value)}`).toBe(true);
  }).toPass({ timeout: timeoutMs }).then(() => true, () => false);
  const post = await observeOutcome(page, outcome, timeoutMs);
  return { ...evaluateActionOutcome({ ruleId, action, outcome, pre, post }), waitedForExpected: appeared };
};

export const expectActionOutcome = async (page, contract) => {
  const report = await runActionAssertion(page, contract);
  expect(report.status, `${formatReport(report)} (pre=${JSON.stringify(report.pre?.value)}, post=${JSON.stringify(report.post?.value)})`).toBe(STATUS.PASS);
  return report;
};

// ---------------------------------------------------------------------------
// Local extensions (upstream candidates; not yet in Forma)
// ---------------------------------------------------------------------------

// The four widths every surface is tested at (ULI-L09).
export const CONTRACT_WIDTHS = Object.freeze([320, 390, 768, 1280]);

// ULI-L05: decide horizontal overflow from an observation. Text that escapes
// the viewport or a clipping ancestor is a FAIL even when overflow is hidden
// or clipped, because clipping hides it rather than fixing it.
export const evaluateOverflow = ({ scrollWidth, clientWidth, escapes }) => {
  if (!(clientWidth > 0)) return { ruleId: "ULI-L05", status: STATUS.UNKNOWN, reason: "no viewport width observed", escapes: [] };
  const pageOverflow = scrollWidth - clientWidth;
  const failed = pageOverflow > 0 || escapes.length > 0;
  return {
    ruleId: "ULI-L05", status: failed ? STATUS.FAIL : STATUS.PASS, escapes,
    reason: `document scrollWidth ${scrollWidth} vs clientWidth ${clientWidth}; ${escapes.length} text run(s) escaping viewport or clipping container`
  };
};

export const measureOverflow = async page => {
  await settleFontsAndFrames(page);
  const observation = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const clippingAncestor = element => {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (getComputedStyle(node).overflowX !== "visible") return node;
      }
      return null;
    };
    const escapes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const element = text.parentElement;
      if (!text.textContent.trim() || !element.checkVisibility()) continue;
      const own = element.getBoundingClientRect();
      if (own.width <= 1 && own.height <= 1) continue; // visually hidden (sr-only / unfocused skip link)
      const range = document.createRange();
      range.selectNodeContents(text);
      const clip = clippingAncestor(element)?.getBoundingClientRect();
      const escaped = [...range.getClientRects()].find(rect => rect.width > 0 &&
        (rect.right > viewport + 0.5 || rect.left < -0.5 || (clip && (rect.right > clip.right + 0.5 || rect.left < clip.left - 0.5))));
      if (escaped) escapes.push(`${element.tagName.toLowerCase()} "${text.textContent.trim().slice(0, 40)}" ${escaped.left.toFixed(1)}..${escaped.right.toFixed(1)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: viewport, escapes };
  });
  return evaluateOverflow(observation);
};

export const expectNoOverflow = async page => {
  const report = await measureOverflow(page);
  expect(report.status, `${report.ruleId} ${report.status}: ${report.reason}\n${report.escapes.join("\n")}`).toBe(STATUS.PASS);
  return report;
};

// ULI-L05: scale the browser's default text size (what a user's font-size
// setting changes), so rem/em sizes and em-based media queries respond as they
// would for that user. Chromium only (CDP Page.setFontSizes).
export const scaleDefaultText = async (page, factor) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Page.setFontSizes", { fontSizes: { standard: Math.round(16 * factor), fixed: Math.round(13 * factor) } });
  await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)),
    { message: "default text size did not change" }).toBeGreaterThan(16 * factor - 1);
  await settleFontsAndFrames(page);
};

// ULI-L06: a label is intact when its content fits its own box and the box is
// fully inside the viewport.
export const evaluateLabelIntegrity = ({ name, scrollWidth, clientWidth, scrollHeight, clientHeight, left, right, viewport }) => {
  const clipped = scrollWidth > clientWidth + 1 || scrollHeight > clientHeight + 1;
  const offscreen = left < -0.5 || right > viewport + 0.5;
  return { ruleId: "ULI-L06", name, status: clipped || offscreen ? STATUS.FAIL : STATUS.PASS,
    reason: `${clipped ? "content clipped" : "content fits"}; ${offscreen ? "box offscreen" : "box on screen"}` };
};

export const expectLabelIntact = async locator => {
  await expect(locator).toBeVisible();
  const observation = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { name: element.textContent.trim(), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, left: rect.left, right: rect.right,
      viewport: document.documentElement.clientWidth };
  });
  const report = evaluateLabelIntegrity(observation);
  expect(report.status, `${report.ruleId} ${report.status}: "${report.name}": ${report.reason}`).toBe(STATUS.PASS);
  return report;
};

// ULI-L05: an in-page destination is reached when its landmark/heading is in
// the viewport and not covered by a sticky header.
export const expectDestinationClearOfHeader = async (page, destination, header) => {
  await expect(destination).toBeInViewport();
  await expect.poll(async () => {
    const [target, bar] = await Promise.all([destination.boundingBox(), header.boundingBox()]);
    return target && bar ? target.y - (bar.y + bar.height) : Number.NEGATIVE_INFINITY;
  }, { message: "ULI-L05: destination must not sit under the sticky header" }).toBeGreaterThanOrEqual(0);
};

// ULI-A08: Tab through the page and report whether a control received focus.
export const recordTabSequence = async (page, maxSteps) => {
  await page.evaluate(() => { window.__uliFocused = new Set(); });
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press("Tab");
    await page.evaluate(() => window.__uliFocused.add(document.activeElement));
  }
};

export const wasFocusedDuringSequence = locator => locator.evaluate(element => window.__uliFocused?.has(element) ?? false);
