// public/js/theme.js
// Any element with [data-theme-toggle] becomes a working toggle -
// this is what lets the nav button and the switch on the Settings
// page both control the same theme and stay in sync.
(function () {
  const STORAGE_KEY = 'reunite-theme';

  function applyStored() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    } else {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
    updateToggles();
  }

  function updateToggles() {
    const isDark = currentTheme() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (el) {
      el.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.checked = isDark;
      }
      const label = el.querySelector && el.querySelector('[data-theme-toggle-label]');
      if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
    });
  }

  applyStored();

  document.addEventListener('DOMContentLoaded', function () {
    updateToggles();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      });
    });
  });
})();
