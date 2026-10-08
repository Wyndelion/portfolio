// Dark/light toggle. Dark is the default on every new visit; a choice only lasts for the session.
// The saved choice is applied by a tiny inline script in each page's <head> (no flash);
// this adds the button and broadcasts changes to the 3D shape.
const root = document.documentElement;

const btn = document.createElement('button');
btn.className = 'theme-toggle';
btn.type = 'button';
btn.innerHTML = `
  <svg class="i-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  <svg class="i-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

function sync() {
  const light = root.dataset.theme === 'light';
  btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
}
btn.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  try { sessionStorage.setItem('theme', next); } catch { /* private mode */ }
  sync();
  document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
});
sync();
document.querySelector('.nav nav')?.append(btn);
