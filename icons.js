// icons.js
// ---------------------------------------------------------------
// Small line icons, drawn as SVG (shapes described in code, so they
// stay crisp at any size and take on the text colour).
// In the HTML, write <i data-icon="book"></i> and it gets swapped
// for the drawing below when the app starts.
// ---------------------------------------------------------------

const ICON_PATHS = {
  book:   '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  undo:   '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  x:      '<path d="M18 6 6 18M6 6l12 12"/>',
  grip:   '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  sound:  '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute:   '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  flag:   '<path d="M5 22V4M5 4h11l-2 4 2 4H5"/>',
  shot:   '<path d="M6 4h12l-1.6 15.2A2 2 0 0 1 14.4 21H9.6a2 2 0 0 1-2-1.8z"/><path d="M6.8 10h10.4"/>',
  sun:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:   '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  auto:   '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  globe:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
  back:   '<path d="M21 5H9l-6 7 6 7h12z"/><path d="m17 9-5 5M12 9l5 5"/>',
};

function icon(name, cls = "icon") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

// The Cambodice die (used as the "o" in the logo)
const DIE_SVG = `<svg class="die" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="1" y="1" width="22" height="22" rx="6" fill="#6a52c9"/>
  <g fill="#fff"><circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="12" cy="12" r="2"/>
  <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></g></svg>`;

// Swap every <i data-icon="..."> on the page for its drawing
document.querySelectorAll("[data-icon]").forEach((el) => {
  el.outerHTML = icon(el.dataset.icon, el.className || "icon");
});
document.querySelectorAll(".logo-die").forEach((el) => (el.outerHTML = DIE_SVG));
