#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

node --test tests/site.test.mjs

if [[ ! -f assets/forma/forma-marketing.css ]]; then
  echo "Missing pinned Forma CSS. Install via Forma's v0.4.1 install-presentation action or install.sh first." >&2
  exit 2
fi

rm -rf dist
mkdir -p dist/assets/forma
cp index.html site.css contact.mjs navigation.mjs favicon.svg robots.txt sitemap.xml .nojekyll dist/
cp assets/forma/forma-marketing.css dist/assets/forma/
test -s dist/index.html
for module in $(grep -o '<script type="module" src="[^"]*"' index.html | sed 's/.*src="\([^"]*\)"/\1/'); do
  test -s "dist/$module" || { echo "Referenced module missing from dist: $module" >&2; exit 3; }
done
test -s dist/assets/forma/forma-marketing.css
echo "Built EchoWorks site in dist/"
