import './theme.js';
import { createShape, loadSettings, saveSettings } from './shape.js';

const $ = id => document.getElementById(id);
const shape = createShape($('bg'), { side: 'center', drag: true });

const settings = loadSettings();
const inputs = { distort: $('s-distort'), round: $('s-round'), noise: $('s-noise') };
for (const [key, el] of Object.entries(inputs)) {
  el.value = settings[key]; // range input clamps saved values to its max
  el.addEventListener('input', () => {
    settings[key] = +el.value;
    shape.apply(settings);
    saveSettings(settings); // subpages pick these up
  });
}

if (shape.needsPermission) {
  const btn = $('tilt');
  btn.hidden = false;
  btn.addEventListener('click', async () => { if (await shape.requestTilt()) btn.hidden = true; });
}
