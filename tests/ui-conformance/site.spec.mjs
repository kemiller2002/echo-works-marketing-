import { expect, test } from "@playwright/test";
import {
  CONTRACT_WIDTHS,
  expectActionOutcome,
  expectDestinationClearOfHeader,
  expectLabelIntact,
  expectNoOverflow,
  expectPeerAlignment,
  recordTabSequence,
  settleFontsAndFrames,
  wasFocusedDuringSequence
} from "./ui-conformance-helpers.mjs";

// EchoWorks conformance to visual-engineering/UI-LAYOUT-INTERACTION@1.0.0.
// Surface: the single published route "/" (dist/index.html). Rule IDs are
// cited per assertion; the action inventory below is the complete list of
// enabled, visible actions on the page.

const DESKTOP_NAV_MIN_WIDTH = 851; // site.css @media (max-width: 850px) switches to the details menu
const STACKED_FORM_MAX_WIDTH = 620; // site.css @media (max-width: 620px) stacks the form grid
const COLUMN_ACTIONS_MAX_WIDTH = 370; // site.css @media (max-width: 370px) stacks hero actions
// Content-driven breakpoints: 851 (first desktop-nav width) and 1000 (two-column
// contact layout where "What are you interested in?" wraps to two lines).
const WIDTHS = [...CONTRACT_WIDTHS, DESKTOP_NAV_MIN_WIDTH, 1000];

const DESTINATIONS = Object.freeze({
  "#top": { role: "heading", level: 1 },
  "#expertise": { role: "heading", name: /^What we bring/ },
  "#approach": { role: "heading", name: /^A clear path from/ },
  "#studio": { role: "heading", name: /^A small studio/ },
  "#contact": { role: "heading", name: /^Let.s start with/ }
});

const NAV_ITEMS = Object.freeze([
  ["Home", "#top"], ["Expertise", "#expertise"], ["Approach", "#approach"], ["The studio", "#studio"], ["Contact us", "#contact"]
]);

const IN_PAGE_CTAS = Object.freeze([
  ["EchoWorks home", "#top"], ["Explore what we do", "#expertise"], ["Meet the studio", "#studio"],
  ["Our point of view", "#studio"], ["echoworks.", "#top"], ["BACK TO TOP", "#top"]
]);

const destination = (page, hash) => {
  const { role, ...options } = DESTINATIONS[hash];
  return page.getByRole(role, options);
};
const hashPattern = hash => new RegExp(`${hash.replace("#", "\\#")}$`);
const isDesktop = width => width >= DESKTOP_NAV_MIN_WIDTH;

const open = async (page, width, path = "/") => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  await settleFontsAndFrames(page);
};

// The native <summary> is a disclosure button to assistive technology, but
// Playwright's ARIA role map has no implicit role for it, so it is addressed
// through its declared test id (README: stable data-testid selectors).
const menuToggle = page => page.getByTestId("mobile-navigation").locator("summary");

// ULI-L05: the hero footer bar never overlaps the hero actions.
const expectHeroBarClearOfActions = async page => {
  const [actions, bar] = await Promise.all([
    page.getByRole("link", { name: "Meet the studio" }).boundingBox(),
    page.getByText("DESIGN WITH INTENTION").boundingBox()
  ]);
  expect(bar.y, "ULI-L05: hero footer text overlaps the hero actions").toBeGreaterThanOrEqual(actions.y + actions.height);
};

const openMobileMenu = async page => {
  await menuToggle(page).click();
  await expect(page.getByTestId("mobile-navigation")).toHaveAttribute("open", "");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
};

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("ULI-L05/L09: no horizontal page overflow or escaping text", async ({ page }) => {
      await open(page, width);
      await expectNoOverflow(page);
      await expectHeroBarClearOfActions(page);
    });

    test("ULI-L05: 200% text scale keeps text inside its containers", async ({ page }) => {
      await open(page, width);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expectNoOverflow(page);
      await expectHeroBarClearOfActions(page);
    });

    test("ULI-L06/L09: navigation labels are intact", async ({ page }) => {
      await open(page, width);
      if (isDesktop(width)) {
        const nav = page.getByRole("navigation", { name: "Primary navigation" });
        for (const [name] of NAV_ITEMS) await expectLabelIntact(nav.getByRole("link", { name, exact: true }));
      } else {
        await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeHidden();
        await expectLabelIntact(menuToggle(page));
        await openMobileMenu(page);
        const nav = page.getByRole("navigation", { name: "Mobile navigation" });
        for (const [name] of NAV_ITEMS) await expectLabelIntact(nav.getByRole("link", { name, exact: true }));
      }
    });

    for (const [name, hash] of NAV_ITEMS) {
      test(`ULI-A01/A02/L05: nav "${name}" reaches ${hash} clear of the header`, async ({ page }) => {
        await open(page, width);
        if (hash === "#top") await page.getByRole("heading", { name: /^What we bring/ }).scrollIntoViewIfNeeded();
        if (!isDesktop(width)) await openMobileMenu(page);
        await expectActionOutcome(page, { ruleId: "ULI-A02", action: { role: "link", name }, outcome: { kind: "url", expected: hashPattern(hash) } });
        await expectDestinationClearOfHeader(page, destination(page, hash), page.getByRole("banner"));
        if (!isDesktop(width)) {
          // ULI-L08: the flyout closes instead of covering the destination.
          await expect(page.getByTestId("mobile-navigation")).not.toHaveAttribute("open", "");
        }
      });
    }

    for (const [name, hash] of IN_PAGE_CTAS) {
      test(`ULI-A01/A02: CTA "${name}" reaches ${hash}`, async ({ page }) => {
        await open(page, width);
        const control = page.getByRole("link", { name, exact: true });
        await control.scrollIntoViewIfNeeded();
        await expectActionOutcome(page, { ruleId: "ULI-A02", action: { role: "link", name }, outcome: { kind: "url", expected: hashPattern(hash) } });
        await expectDestinationClearOfHeader(page, destination(page, hash), page.getByRole("banner"));
      });
    }

    test("ULI-L01/L10: declared alignment groups", async ({ page }) => {
      await open(page, width);
      const footerLinks = { ruleId: "ULI-L10", id: "footer-contact-links", edge: "top",
        peers: [{ role: "link", name: "Email" }, { role: "link", name: "Call" }, { role: "link", name: "LinkedIn" }] };
      await expectPeerAlignment(page, footerLinks);

      // Declared composition: one row, centered on a shared axis; when the row
      // wraps (flex-wrap) or stacks (<= 370px), actions share the start edge.
      const heroActions = [{ role: "link", name: "Explore what we do" }, { role: "link", name: "Meet the studio" }];
      const [primary, secondary] = await Promise.all(heroActions.map(({ name }) => page.getByRole("link", { name }).boundingBox()));
      const wrapped = width <= COLUMN_ACTIONS_MAX_WIDTH || secondary.y >= primary.y + primary.height;
      await expectPeerAlignment(page, wrapped
        ? { ruleId: "ULI-L10", id: "hero-actions-wrapped", edge: "left", peers: heroActions }
        : { ruleId: "ULI-L10", id: "hero-actions-row", edge: "center", peers: heroActions });

      if (isDesktop(width)) {
        await expectPeerAlignment(page, { ruleId: "ULI-L07", id: "primary-nav-row", edge: "center",
          peers: NAV_ITEMS.map(([name]) => ({ role: "link", name })) });
      }

      if (width > STACKED_FORM_MAX_WIDTH) {
        await expectPeerAlignment(page, { ruleId: "ULI-L01", id: "inquiry-row-1", edge: "top",
          peers: [{ role: "textbox", name: "Your name" }, { role: "textbox", name: "Email address" }] });
        await expectPeerAlignment(page, { ruleId: "ULI-L01", id: "inquiry-row-2", edge: "top",
          peers: [{ role: "textbox", name: "Phone number (optional)" }, { role: "combobox", name: "What are you interested in?" }] });
      } else {
        await expectPeerAlignment(page, { ruleId: "ULI-L01", id: "inquiry-stacked-left-edge", edge: "left",
          peers: [{ role: "textbox", name: "Your name" }, { role: "textbox", name: "Email address" },
            { role: "textbox", name: "Phone number (optional)" }, { role: "combobox", name: "What are you interested in?" }] });
      }
    });
  });
}

test.describe("whole-page actions", () => {
  test("ULI-A02/A08: skip link moves focus to the main content", async ({ page }) => {
    await open(page, 1280);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("ULI-A01/A02: external, email and telephone destinations are valid", async ({ page }) => {
    await open(page, 1280);
    const mail = "mailto:jacquelyn.brice@echoworks.studio";
    await expect(page.getByRole("link", { name: "jacquelyn.brice@echoworks.studio" })).toHaveAttribute("href", mail);
    await expect(page.getByRole("link", { name: "Email", exact: true })).toHaveAttribute("href", mail);
    await expect(page.getByRole("link", { name: "812 584 2085" })).toHaveAttribute("href", "tel:+18125842085");
    await expect(page.getByRole("link", { name: "Call", exact: true })).toHaveAttribute("href", "tel:+18125842085");
    for (const name of ["Connect with Jacquelyn", "LinkedIn"]) {
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/jacquelyn-brice/");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
  });

  test("ULI-A01: every same-origin resource and sitemap route resolves", async ({ page, request }) => {
    await open(page, 1280);
    const local = await page.evaluate(() => [...document.querySelectorAll("link[href], script[src], a[href]")]
      .map(node => new URL(node.getAttribute("href") ?? node.getAttribute("src"), location.href))
      .filter(url => url.origin === location.origin)
      .map(url => url.pathname));
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname);
    expect(routes.length).toBeGreaterThan(0);
    for (const path of new Set([...local, ...routes, "/robots.txt", "/contact.mjs", "/navigation.mjs"])) {
      const response = await request.get(path);
      expect(response.status(), `GET ${path}`).toBe(200);
    }
  });

  test("ULI-A07/A10: inquiry rejects missing fields without claiming progress", async ({ page }) => {
    await open(page, 390);
    const submit = page.getByRole("button", { name: "Continue in your email app" });
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    await expect(page.getByRole("textbox", { name: "Your name" })).toBeFocused();
    expect(await page.getByRole("textbox", { name: "Your name" }).evaluate(input => input.validity.valueMissing)).toBe(true);
    await expect(page.getByRole("status")).toHaveText("");
    await expect(page.getByRole("link", { name: "Open your prepared email again" })).toBeHidden();
  });

  for (const width of [390, 1280]) {
    test(`ULI-A02/A03/A07: inquiry prepares an honest email draft (${width}px)`, async ({ page }) => {
      await open(page, width);
      await page.getByRole("textbox", { name: "Your name" }).fill("Alex Builder");
      await page.getByRole("textbox", { name: "Email address" }).fill("alex@example.com");
      await page.getByRole("combobox", { name: "What are you interested in?" }).selectOption("Interior design");
      await page.getByRole("textbox", { name: "Tell us a little more" }).fill("A clinic renovation.");
      await expectActionOutcome(page, {
        ruleId: "ULI-A02",
        action: { role: "button", name: "Continue in your email app" },
        outcome: { kind: "visible", target: { role: "link", name: "Open your prepared email again" }, expected: true }
      });
      await expect(page.getByRole("status")).toHaveText(/press Send/);
      await expect(page.getByRole("status")).not.toHaveText(/sent|submitted|received/i);
      const href = await page.getByRole("link", { name: "Open your prepared email again" }).getAttribute("href");
      const params = new URLSearchParams(href.split("?")[1]);
      expect(href.startsWith("mailto:jacquelyn.brice@echoworks.studio?")).toBe(true);
      expect(params.get("subject")).toBe("EchoWorks inquiry: Interior design");
      expect(params.get("body")).toContain("Alex Builder");
      await expectNoOverflow(page);
    });
  }

  test("ULI-A08/L08: mobile menu opens, closes with Escape and returns focus", async ({ page }) => {
    await open(page, 320);
    const toggle = menuToggle(page);
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Home", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
    await expect(toggle).toBeFocused();
    await expectNoOverflow(page);
  });

  for (const width of [320, 1280]) {
    test(`ULI-A08: every action is keyboard reachable (${width}px)`, async ({ page }) => {
      await open(page, width);
      await recordTabSequence(page, 45);
      const links = ["Skip to content", "EchoWorks home", "Explore what we do", "Meet the studio", "Our point of view",
        "Connect with Jacquelyn", "jacquelyn.brice@echoworks.studio", "812 584 2085", "echoworks.", "Email", "Call",
        "LinkedIn", "BACK TO TOP", ...(isDesktop(width) ? NAV_ITEMS.map(([name]) => name) : [])];
      const controls = [
        ...links.map(name => page.getByRole("link", { name, exact: true })),
        page.getByRole("button", { name: "Continue in your email app" }),
        page.getByRole("combobox", { name: "What are you interested in?" }),
        ...["Your name", "Email address", "Phone number (optional)", "Project location (optional)", "Tell us a little more"]
          .map(name => page.getByRole("textbox", { name, exact: true })),
        ...(isDesktop(width) ? [] : [menuToggle(page)])
      ];
      for (const control of controls) {
        expect(await wasFocusedDuringSequence(control), `not reached by Tab: ${control}`).toBe(true);
      }
    });
  }

  test("ULI-A06/L08: reduced motion disables smooth scrolling and transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page, 1280);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("smooth");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    const animated = await page.evaluate(() => [...document.querySelectorAll("body *")]
      .filter(element => {
        const style = getComputedStyle(element);
        // Durations of at most 0.01ms (Forma's reduced-motion floor) are treated as no motion.
        const moving = value => value.split(",").some(item => parseFloat(item) * (item.trim().endsWith("ms") ? 1 : 1000) > 0.01);
        return (style.animationName !== "none" && moving(style.animationDuration)) || moving(style.transitionDuration);
      }).map(element => element.className || element.tagName));
    expect(animated).toEqual([]);
    await page.getByRole("link", { name: "Contact us", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Let.s start with/ })).toBeInViewport();
  });
});
