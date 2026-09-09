// The one copy of the link preview's text.
//
// Spec §9: what the visitor sees on screen is literally what someone receiving
// the link will see. That only holds while the card drawn on the page and the
// card a scraper builds say the same thing — so the title and the description
// live here, and both app/layout.tsx's metadata and components/PreviewCard.tsx
// read them from this module instead of each carrying its own copy.
//
// English, like every other string a visitor reads.
export const SITE_TITLE = "Two machines";
export const SITE_DESCRIPTION =
  "The thumbnail of this page is drawn by a computer with no graphics card.";
