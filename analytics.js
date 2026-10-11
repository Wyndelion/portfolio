// GoatCounter: cookieless, anonymous visit counts. See https://www.goatcounter.com
// Paste your site code below (the "xyz" in https://xyz.goatcounter.com). While it is empty
// nothing is loaded and nothing is sent.
const CODE = 'wyndelion';

// Calls made before count.js has loaded are queued and sent once it is ready.
const queue = [];
let ready = false;

function send(data) {
  if (!CODE) return;
  if (ready) window.goatcounter.count(data);
  else queue.push(data);
}

if (CODE) {
  // The site uses #/routes, so page views are sent by hand (see trackPage) instead of on load.
  window.goatcounter = { no_onload: true };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${CODE}.goatcounter.com/count`;
  s.onload = () => { ready = true; queue.splice(0).forEach(d => window.goatcounter.count(d)); };
  document.head.append(s);
}

export function trackPage(route, title) {
  send({ path: route === 'home' ? '/' : `/${route}`, title });
}

const trackEvent = name => send({ path: name, title: name, event: true });

// Clicks on links that leave the site (itch.io, LinkedIn, GitHub, screenshots) and on the email link.
document.addEventListener('click', e => {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a) return;
  if (a.protocol === 'mailto:') return trackEvent('click/email');
  if (a.hostname && a.hostname !== location.hostname) {
    trackEvent(a.hostname === 'img.itch.zone' ? 'click/screenshot' : `click/${a.hostname}${a.pathname.replace(/\/$/, '')}`);
  }
});

// Other interactions
document.addEventListener('themechange', e => trackEvent(`theme/${e.detail}`));
document.addEventListener('shapecolor', () => trackEvent('shape/color'));
