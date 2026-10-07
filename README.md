# EchoWorks marketing website

A new editorial website for EchoWorks LLC, an Indianapolis-based architecture practice licensed in Indiana and Ohio.

## Design direction

This is intentionally **not** the Echelon Foundry marketing design. It uses Forma’s version-pinned, **brand-neutral** presentation layer for semantic patterns and accessible components, then an EchoWorks-owned visual identity (warm limestone, dark pine, burnt clay, monumental serif typography, architectural photography). No Echelon theme is loaded.

## Preview locally

```bash
# Install the checksum-pinned, brand-neutral Forma release
curl -fsSL https://raw.githubusercontent.com/kemiller2002/forma/v0.4.1/actions/install-presentation/install.sh -o install-forma.sh
bash install-forma.sh
python3 -m http.server 8000
# open http://localhost:8000/
```

The production GitHub Pages workflow uses the corresponding pinned Forma action. The site is static HTML/CSS; no client-side application runtime or npm dependency is required. Links are relative so it works at both a project Pages URL and a custom domain.

## Check

```bash
node --test tests/site.test.mjs
```

## Publishing

Pushes to `main` run structural tests, install the pinned Forma stylesheet, assemble `dist/`, and deploy via GitHub Actions to GitHub Pages. In the repository settings choose **Pages → Source: GitHub Actions** if not already set. Set `echoworks.studio` as a custom domain **only after DNS and cutover are explicitly approved**. This repo does not modify existing DNS or the current live Squarespace site.

## Content and image policy

- Professional credentials, business information, and services come from the current EchoWorks website (reviewed October 2026). Confirm copy with the principal before public release.
- The principal's portrait is referenced from EchoWorks' own Squarespace CDN. Permission and image stability should be confirmed for production.
- Other building/interior photographs are Unsplash **editorial illustrative images**, not representations of completed EchoWorks projects. They are labeled as such; replace them with authorized real project photography as it becomes available.
- Contact links use the published business email and telephone. We do **not** collect form submissions without an approved backend/privacy policy.

## Accessibility and behavior

Semantic HTML, skip link, visible focus, reduced motion, responsive CSS down to 320 px, keyboard-operable details menu, actionable email/phone links, and stable selectors for Playwright (`data-testid` attributes). No decorative pseudo-buttons or placeholder CTAs.
