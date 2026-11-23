/* UnitLab - selector de apariencia
   Compatible con Content-Security-Policy: script-src 'self'.
   Solo modifica el tema visual. No interviene en autenticacion ni MongoDB.
*/
(() => {
  'use strict';
  const STORAGE_KEY = 'unitlab-theme';
  const root = document.documentElement;

  const readPreference = () => {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch { return null; }
  };
  const savePreference = (value) => {
    try { localStorage.setItem(STORAGE_KEY, value); }
    catch { /* En navegacion privada puede estar deshabilitado. */ }
  };

  const preference = readPreference();
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  root.dataset.theme = preference === 'light' || preference === 'dark'
    ? preference
    : (prefersDark ? 'dark' : 'light');

  function updateThemeButtons() {
    const isDark = root.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const message = isDark ? 'Activar modo claro' : 'Activar modo oscuro';
      button.setAttribute('aria-label', message);
      button.setAttribute('aria-pressed', String(isDark));
      button.title = message;
      const icon = button.querySelector('.theme-icon');
      const label = button.querySelector('.theme-label');
      if (icon) icon.textContent = isDark ? '☀' : '☾';
      if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? '#0c1325' : '#f7f8fc';
  }

  // Delegacion: tambien funciona despues de iniciar o cerrar sesion.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-theme-toggle]');
    if (!button) return;
    const newTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = newTheme;
    savePreference(newTheme);
    updateThemeButtons();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateThemeButtons, { once: true });
  } else {
    updateThemeButtons();
  }
})();
