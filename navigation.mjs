/**
 * EchoWorks mobile navigation behavior.
 *
 * The mobile menu is a native <details> disclosure, so it works without
 * JavaScript. This module only restores the expected flyout state after an
 * in-page destination is chosen (UI-LAYOUT-INTERACTION ULI-L08): the menu
 * closes instead of staying open over the destination, and Escape closes it
 * and returns focus to the toggle (ULI-A08).
 */
export function shouldCloseMenu(event) {
  if (event.type === "keydown") return event.key === "Escape";
  return Boolean(event.target?.closest?.("a[href]"));
}

if (typeof document !== "undefined") {
  const menu = document.querySelector('[data-testid="mobile-navigation"]');
  const toggle = menu?.querySelector("summary");
  const close = (event) => {
    if (!menu?.open || !shouldCloseMenu(event)) return;
    menu.open = false;
    if (event.type === "keydown") toggle?.focus();
  };
  menu?.addEventListener("click", close);
  menu?.addEventListener("keydown", close);
}
