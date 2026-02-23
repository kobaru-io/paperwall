// ── Types ─────────────────────────────────────────────────────────

export type TabName = 'dashboard' | 'history' | 'stats' | 'settings';

const TAB_LABELS: Record<TabName, string> = {
  dashboard: 'Home',
  history: 'History',
  stats: 'Stats',
  settings: 'Settings',
};

// ── Public API ────────────────────────────────────────────────────

export function renderTabBar(
  container: HTMLElement,
  activeTab: TabName,
  onTabChange: (tab: TabName) => void,
): void {
  container.innerHTML = '';

  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  nav.setAttribute('aria-label', 'Navigation tabs');

  for (const tab of Object.keys(TAB_LABELS) as TabName[]) {
    const label = TAB_LABELS[tab];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-button' + (tab === activeTab ? ' tab-button--active' : '');
    btn.dataset['tab'] = tab;
    btn.textContent = label;
    btn.setAttribute('aria-selected', String(tab === activeTab));
    btn.addEventListener('click', () => onTabChange(tab));
    nav.appendChild(btn);
  }

  const openInTabBtn = document.createElement('button');
  openInTabBtn.type = 'button';
  openInTabBtn.className = 'open-in-tab-btn';
  openInTabBtn.textContent = '↗';
  openInTabBtn.title = 'Open in tab';
  openInTabBtn.setAttribute('aria-label', 'Open extension in a full browser tab');
  openInTabBtn.addEventListener('click', () => {
    const url = chrome.runtime.getURL('popup.html') + '#tab=' + activeTab;
    chrome.tabs.create({ url });
  });

  nav.appendChild(openInTabBtn);
  container.appendChild(nav);
}
