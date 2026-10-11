import './theme.js';
import { trackPage } from './analytics.js';
import { createShape, loadSettings, saveSettings } from './shape.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;

// Hash routes (#/projects) so it works on any static host with no server rules.
const currentRoute = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return document.querySelector(`#panel section[data-route="${r}"]`) ? r : 'home';
};

const shape = createShape($('bg'), { panel: $('panel'), drag: true, panelStart: currentRoute() !== 'home' });

let shown = currentRoute();
let swapTimer = 0;
const FADE_MS = 200; // text fade-out before the swap (fade-in is in the CSS)
let swapToken = 0;

function fillPanel(route) {
  document.querySelectorAll('#panel section').forEach(s => { s.hidden = s.dataset.route !== route; });
  $('panel').scrollTop = 0;
}

function show(route) {
  const from = shown;
  shown = route;
  root.dataset.route = route;
  const title = document.querySelector(`#panel section[data-route="${route}"]`)?.dataset.title;
  document.title = title ? `${title} | David Zandanell` : 'David Zandanell';
  trackPage(route, document.title);
  document.querySelectorAll('.nav nav a').forEach(a => {
    if (a.dataset.route === route.split('/')[0]) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  clearTimeout(swapTimer);
  swapToken++;
  $('panel').classList.remove('swap');
  if (route === 'home') {
    shape.setMode('blob');
    return; // keep the last section in place so it can fade out instead of blanking
  }
  shape.setMode('panel');
  if (from !== 'home' && from !== route) {
    // Section to section: the shape stays put, only the text fades out, swaps and fades back in.
    $('panel').classList.add('swap');
    const token = ++swapToken;
    swapTimer = setTimeout(() => {
      fillPanel(route);
      // Un-hide at opacity 0 first, then fade in on the next frame (no transition from display:none).
      requestAnimationFrame(() => requestAnimationFrame(() => { if (token === swapToken) $('panel').classList.remove('swap'); }));
    }, FADE_MS);
  } else {
    fillPanel(route);
  }
}
addEventListener('hashchange', () => show(currentRoute()));
show(currentRoute());
// Transitions stay off until the first frames are drawn, so loading on a subpage doesn't animate.
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('ready')));

// ---- Scroll to navigate: home, projects, about, contact (and back up) ----
// Scrolling past the end of a page moves to the next one; scrolling past the top moves to the
// previous one. Project pages only go back up to the project list.
const ORDER = ['home', 'projects', 'about', 'contact'];
const nextOf = r => ORDER[ORDER.indexOf(r) + 1]; // undefined for contact and project pages
const prevOf = r => (r.startsWith('projects/') ? 'projects' : ORDER[ORDER.indexOf(r) - 1]);

let cooldownUntil = 0; // ignore input while a transition plays (also swallows trackpad inertia)
let lastScrollAt = 0; // last time the panel's own content moved
let accum = 0; // wheel distance collected past an edge
let lastWheel = 0;

$('panel').addEventListener('scroll', () => { lastScrollAt = performance.now(); }, { passive: true });

function go(route) {
  const involvesHome = shown === 'home' || route === 'home';
  cooldownUntil = performance.now() + (involvesHome ? 1600 : 800);
  accum = 0;
  // replace, so scrolling through the site doesn't fill up the back button history
  location.replace(route === 'home' ? '#/' : `#/${route}`);
}

const edges = () => {
  const p = $('panel');
  return { top: p.scrollTop <= 1, bottom: p.scrollTop + p.clientHeight >= p.scrollHeight - 2 };
};

addEventListener('wheel', e => {
  if (e.ctrlKey || (e.target instanceof Element && e.target.closest('.controls'))) return; // pinch zoom, sliders
  const now = performance.now();
  if (now < cooldownUntil) { accum = 0; return; }
  const dir = Math.sign(e.deltaY);
  if (!dir) return;

  if (shown === 'home') {
    if (dir < 0) return;
    if (now - lastWheel > 300) accum = 0;
    lastWheel = now;
    accum += e.deltaY;
    if (accum > 60) go('projects');
    return;
  }

  const panel = $('panel');
  // Wheel over the empty sides of the page scrolls the panel too.
  if (!panel.contains(e.target)) panel.scrollTop += e.deltaY;
  const target = dir > 0 ? nextOf(shown) : prevOf(shown);
  const atEdge = dir > 0 ? edges().bottom : edges().top;
  // Only wheel movement that happens while the content has stopped at the edge counts,
  // so a flick that merely reaches the end doesn't carry on into the next page.
  if (!target || !atEdge || now - lastScrollAt < 180) { accum = 0; return; }
  if (now - lastWheel > 300 || Math.sign(accum) !== dir) accum = 0;
  lastWheel = now;
  accum += e.deltaY;
  if (Math.abs(accum) > 140) go(target);
}, { passive: true });

// Touch: a quick vertical swipe. In a page it only counts if the swipe started at the edge
// and the content didn't move.
let touch = null;
addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || (e.target instanceof Element && e.target.closest('.controls'))) { touch = null; return; }
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, time: performance.now(), scrollTop: $('panel').scrollTop, ...edges() };
}, { passive: true });
addEventListener('touchend', e => {
  const s = touch;
  touch = null;
  if (!s || performance.now() < cooldownUntil) return;
  const t = e.changedTouches[0];
  const dy = s.y - t.clientY; // positive: finger moved up, which means scroll down
  if (Math.abs(dy) < 70 || Math.abs(dy) < Math.abs(t.clientX - s.x) * 1.5 || performance.now() - s.time > 700) return;
  const dir = dy > 0 ? 1 : -1;
  if (shown === 'home') { if (dir > 0) go('projects'); return; }
  const target = dir > 0 ? nextOf(shown) : prevOf(shown);
  const atEdge = dir > 0 ? s.bottom : s.top;
  if (target && atEdge && $('panel').scrollTop === s.scrollTop) go(target);
}, { passive: true });

const settings = loadSettings();
const inputs = { distort: $('s-distort'), round: $('s-round'), noise: $('s-noise') };
for (const [key, el] of Object.entries(inputs)) {
  el.value = settings[key];
  el.addEventListener('input', () => {
    settings[key] = +el.value;
    shape.apply(settings);
    saveSettings(settings);
  });
}

// iOS only allows the motion-sensor permission prompt from a tap, so it can't pop up on load.
// Instead the first tap anywhere on the page asks for it (Android needs no permission at all).
if (shape.needsPermission) {
  const ask = () => {
    removeEventListener('click', ask);
    removeEventListener('touchend', ask);
    shape.requestTilt();
  };
  addEventListener('click', ask);
  addEventListener('touchend', ask);
}
