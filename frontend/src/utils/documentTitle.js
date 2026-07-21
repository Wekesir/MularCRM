/**
 * Shared document.title composer so unread notification counts stay visible
 * across route changes: "(10) Users | Muler Credit"
 */

let pageTitlePart = '';
let businessNamePart = 'OMNICRM';
let unreadCountPart = 0;

function applyDocumentTitle() {
  const base = pageTitlePart
    ? `${pageTitlePart} | ${businessNamePart}`
    : businessNamePart;
  document.title =
    unreadCountPart > 0 ? `(${unreadCountPart}) ${base}` : base;
}

/** Set / update the page segment (e.g. "Users", "Management"). */
export function setPageDocumentTitle(pageTitle, businessName) {
  pageTitlePart = pageTitle ? String(pageTitle) : '';
  if (businessName != null && businessName !== '') {
    businessNamePart = String(businessName);
  }
  applyDocumentTitle();
}

/** Clear page segment on unmount; keep brand (+ unread if any). */
export function clearPageDocumentTitle(businessName) {
  pageTitlePart = '';
  if (businessName != null && businessName !== '') {
    businessNamePart = String(businessName);
  }
  applyDocumentTitle();
}

/** Update unread count prefix; call whenever notifications unread changes. */
export function setUnreadDocumentTitleCount(count) {
  const n = Number(count);
  unreadCountPart = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  applyDocumentTitle();
}
