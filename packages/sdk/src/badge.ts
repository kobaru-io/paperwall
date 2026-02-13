const BADGE_ID = 'paperwall-badge';
const STYLE_ID = 'paperwall-badge-style';

const BADGE_CSS = `
#${BADGE_ID} {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 999999;
  padding: 6px 12px;
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: default;
  user-select: none;
  opacity: 0.85;
  transition: opacity 0.2s ease;
}
#${BADGE_ID}:hover {
  opacity: 1;
}
`;

/**
 * Shows the Paperwall badge in the bottom-right corner.
 * If the badge already exists, this is a no-op.
 */
export function showBadge(): void {
  if (document.getElementById(BADGE_ID)) {
    return;
  }

  // Inject style tag
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BADGE_CSS;
  document.head.appendChild(style);

  // Create badge element
  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.textContent = 'Paperwall';
  badge.setAttribute('aria-label', 'Paperwall micropayment badge');
  badge.setAttribute('role', 'status');
  document.body.appendChild(badge);
}

/**
 * Removes the Paperwall badge and its style tag from the DOM.
 */
export function removeBadge(): void {
  const badge = document.getElementById(BADGE_ID);
  if (badge) {
    badge.remove();
  }

  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}
