import './theme.js';
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

if (shape.needsPermission) {
  const btn = $('tilt');
  btn.hidden = false;
  btn.addEventListener('click', async () => { if (await shape.requestTilt()) btn.hidden = true; });
}
