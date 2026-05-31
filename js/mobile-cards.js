export function isMobileLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches;
}

/**
 * @param {string} tableHtml
 * @param {string} cardsHtml
 */
export function dataListHtml(tableHtml, cardsHtml) {
  if (!isMobileLayout()) return tableHtml;
  return `<div class="data-list-cards">${cardsHtml}</div>`;
}

export function emptyListHtml(message) {
  return `<div class="empty">${message}</div>`;
}
