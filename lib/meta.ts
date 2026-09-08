// The one copy of the link preview's text.
//
// Spec §9: what the visitor sees on screen is literally what someone receiving
// the link will see. That only holds while the card drawn on the page and the
// card a scraper builds say the same thing — so the title and the description
// live here, and both app/layout.tsx's metadata and components/PreviewCard.tsx
// read them from this module instead of each carrying its own copy.
//
// Spanish, like every other string a visitor reads.
export const SITE_TITLE = "Dos máquinas";
export const SITE_DESCRIPTION =
  "La miniatura de esta página la dibuja un ordenador sin tarjeta gráfica.";
