import * as THREE from 'three';

export const isMobile = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULTS = { distort: 0.7, round: 0, noise: 0.15 };

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('shape') || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem('shape', JSON.stringify(s)); } catch { /* private mode */ }
}

// Shared by the spiky and clay vertex shaders.
const NOISE_GLSL = `
      // --- simplex noise 3D (Ashima / Ian McEwan) ---
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }

      // --- classic gradient (Perlin-style) noise ---
      vec3 hash3(vec3 p) {
        p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }
      float perlin(vec3 x) {
        vec3 i = floor(x), f = fract(x);
        vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(
          mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
              mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
          mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
              mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
      }

      // Blend of Perlin, simplex and a ridged simplex layer.
      float mixedNoise(vec3 p, float t) {
        float a = perlin(p * 1.4 + vec3(0.0, t, 0.0));
        float b = snoise(p * 2.6 - vec3(t * 0.7, 0.0, 0.0));
        float c = 1.0 - abs(snoise(p * 5.0 + vec3(0.0, 0.0, t * 0.5)));
        return 0.5 * a + 0.35 * b + 0.3 * (c - 0.5);
      }

`;

// Panel mode (subpages): the sphere is squashed into a flat slab with a rectangular outline,
// uBox = its half-size in world units. The equator of the sphere lands exactly on the
// rectangle's edge; both hemispheres flatten onto its front and back.
const PANEL_GLSL = `
      uniform vec3 uBox;
      vec3 panelShape(vec3 d) {
        float m = max(abs(d.x), abs(d.y));
        vec2 sq = m > 1e-4 ? d.xy * (length(d.xy) / m) : d.xy;
        return vec3(sq * uBox.xy, d.z * uBox.z);
      }
`;

// One random hue per visit (kept in sessionStorage so every page of a visit matches).
// The background is dark navy, so hues from 0.55 to 0.75 (blues/indigos) are skipped.
function visitHue() {
  try {
    const saved = sessionStorage.getItem('hue');
    if (saved !== null) return +saved;
  } catch { /* storage blocked */ }
  const h = randomHue();
  try { sessionStorage.setItem('hue', h); } catch { /* storage blocked */ }
  return h;
}

function randomHue() {
  const h = Math.random() * 0.8;
  return h > 0.55 ? h + 0.2 : h;
}

// A spiky crystal built from small closed loops. Each loop runs tip -> neighbour -> node ->
// neighbour, and every corner of every loop is drawn as a little curve. The Roundness slider
// grows those curves from sharp corners into smooth arcs. All motion is in the vertex shader,
// so the CPU cost per frame is a single draw call.
// opts.side: 'center' or 'right' (where the shape sits on wide screens).
export function createShape(canvas, opts = {}) {
  const side = opts.side ?? 'center';
  const dim = opts.dim ?? 1;
  const drag = opts.drag ?? false; // grab-and-spin (landing page only)
  let panelTarget = opts.panelStart ? 1 : 0; // 1 = collected into the content panel
  let panelT = panelTarget;
  const hue0 = visitHue();
  const panelEl = opts.panel ?? null; // subpages: element the shape collects itself around

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);

  const N = isMobile ? 40 : 72;
  const M = isMobile ? 5 : 8; // samples per rounded corner
  const dirs = [];
  const seeds = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // Fibonacci sphere: even spread of directions.
    const y = 1 - (i + 0.5) / N * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * 2.399963;
    v.set(Math.cos(phi) * r, y, Math.sin(phi) * r);
    dirs.push(v.clone());
    seeds.push(Math.random());
  }

  // Corner = { id, tip } where id is a sphere direction index and tip says whether it is the
  // raised tip or the base node. Each loop is [tip a, node n1, node a, node n2] where n1 and
  // n2 are neighbours of a on roughly opposite sides, so the spike reads as a diamond facet.
  const loops = [];
  for (let a = 0; a < N; a++) {
    const near = [];
    for (let b = 0; b < N; b++) if (b !== a) near.push([dirs[a].distanceToSquared(dirs[b]), b]);
    near.sort((p, q) => p[0] - q[0]);
    const n1 = near[0][1];
    let n2 = near[1][1], best = 2;
    const e1 = dirs[n1].clone().sub(dirs[a]);
    for (let k = 1; k < 5; k++) {
      const d = e1.dot(dirs[near[k][1]].clone().sub(dirs[a]));
      if (d < best) { best = d; n2 = near[k][1]; }
    }
    loops.push([[a, 1], [n1, 0], [a, 0], [n2, 0]]);
  }

  // One vertex per curve sample: it carries its corner plus the previous and next corner.
  const aC = [], aP = [], aN = [], kinds = [], seedAttr = [], aT = [], index = [];
  const push = (c, p, n, t) => {
    aC.push(...dirs[c[0]].toArray()); aP.push(...dirs[p[0]].toArray()); aN.push(...dirs[n[0]].toArray());
    kinds.push(c[1], p[1], n[1]);
    seedAttr.push(seeds[c[0]], seeds[p[0]], seeds[n[0]]);
    aT.push(t);
  };
  for (const loop of loops) {
    const first = aT.length;
    for (let c = 0; c < loop.length; c++) {
      const corner = loop[c], prev = loop[(c + loop.length - 1) % loop.length], next = loop[(c + 1) % loop.length];
      for (let m = 0; m <= M; m++) push(corner, prev, next, m / M);
    }
    const count = aT.length - first;
    for (let i = 0; i < count; i++) index.push(first + i, first + (i + 1) % count);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(aT.length * 3), 3));
  geo.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 3));
  geo.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 3));
  geo.setAttribute('aN', new THREE.Float32BufferAttribute(aN, 3));
  geo.setAttribute('aKinds', new THREE.Float32BufferAttribute(kinds, 3));
  geo.setAttribute('aSeeds', new THREE.Float32BufferAttribute(seedAttr, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  geo.setIndex(index);

  const uniforms = {
    uTime: { value: 0 },
    uDistort: { value: DEFAULTS.distort },
    uRound: { value: DEFAULTS.round },
    uNoise: { value: DEFAULTS.noise },
    uColor: { value: new THREE.Color().setHSL(hue0, 0.9, 0.55) },
    uDim: { value: dim },
    uMouse: { value: new THREE.Vector2(9, 9) },
    uMouseStr: { value: 0 },
    uAspect: { value: 1 },
    uPanel: { value: 0 },
    uBox: { value: new THREE.Vector3(1, 1, 0.35) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uDistort, uRound, uNoise, uMouseStr, uAspect, uPanel;
      uniform vec2 uMouse;
      attribute vec3 aC, aP, aN, aKinds, aSeeds;
      attribute float aT;
      varying float vKind;

${PANEL_GLSL}
${NOISE_GLSL}      // World position of one corner: spike length from distortion, then noise on top.
      vec3 corner(vec3 dir, float kind, float seed) {
        float wave = 0.5 + 0.5 * sin(dot(dir, vec3(1.3, 2.1, 0.7)) * 5.0 + uTime + seed * 6.0);
        float len = uDistort * 2.4 * (0.15 + 0.85 * wave * (0.4 + 0.6 * seed));
        len *= 1.0 - 0.8 * uPanel; // collected into a panel, the spikes shrink to a fringe
        vec3 q = dir * 1.5;
        vec3 n = vec3(mixedNoise(q, uTime), mixedNoise(q + 31.4, uTime), mixedNoise(q + 71.7, uTime));
        vec3 wobble = n * uNoise * 1.6 * (0.4 + 0.6 * kind) * (1.0 - 0.7 * uPanel);
        vec3 shell = mix(dir, panelShape(dir), uPanel);
        // Pointer: find where this corner would appear on screen and pull the spike in when
        // the cursor is near. Measured on the un-retracted position so it doesn't flicker.
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(shell + dir * kind * len + wobble, 1.0);
        vec2 d = (clip.xy / clip.w - uMouse) * vec2(uAspect, 1.0);
        float near = smoothstep(0.28, 0.0, length(d)) * uMouseStr;
        return shell + dir * kind * len * (1.0 - 0.95 * near) + wobble;
      }

      void main() {
        vec3 c = corner(aC, aKinds.x, aSeeds.x);
        vec3 p0 = corner(aP, aKinds.y, aSeeds.y);
        vec3 p1 = corner(aN, aKinds.z, aSeeds.z);
        // Roundness: the curve starts/ends part-way along the two edges and uses the corner
        // as its control point (quadratic Bezier), so 0 = sharp corner, 1 = fully rounded.
        float k = uRound * 0.5;
        vec3 a = mix(c, p0, k);
        vec3 b = mix(c, p1, k);
        float t = aT;
        vec3 p = (1.0 - t) * (1.0 - t) * a + 2.0 * t * (1.0 - t) * c + t * t * b;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        // Fade follows the same curve as the geometry, so brightness stays continuous at any roundness.
        float ka = mix(aKinds.x, aKinds.y, k), kb = mix(aKinds.x, aKinds.z, k);
        vKind = (1.0 - t) * (1.0 - t) * ka + 2.0 * t * (1.0 - t) * aKinds.x + t * t * kb;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uDim;
      varying float vKind;
      void main() {
        float a = (0.15 + 0.7 * vKind) * uDim;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), vKind * 0.35), a);
      }`,
  });

  const mesh = new THREE.Group();
  const spiky = new THREE.LineSegments(geo, material);
  mesh.add(spiky);

  // Light mode: the smooth lump from the very first draft. Same lobe formula and edge-glow
  // shading as back then; at the default slider values it is identical to it.
  // Distortion = lump height, Roundness = lumps soften, Noise = lump frequency (default 0.15 = original).
  // The cursor flattens the clay where it comes near, like it retracts the spikes.
  const clayUniforms = {
    ...uniforms,
    uColor: { value: new THREE.Color().setHSL(hue0, 0.85, 0.6) },
    uLight: { value: 0 },
  };
  const clay = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, isMobile ? 24 : 48),
    new THREE.ShaderMaterial({
      uniforms: clayUniforms,
      transparent: true,
      vertexShader: /* glsl */`
        uniform float uTime, uDistort, uRound, uNoise, uMouseStr, uAspect, uPanel;
        uniform vec2 uMouse;
        varying vec3 vNormal, vView;
${PANEL_GLSL}
        void main() {
          vec3 p = position * 1.6;
          float freq = 2.0 * (1.0 + (uNoise - 0.15) * 2.0);
          float n = sin(p.x * freq + uTime) * sin(p.y * freq + uTime * 0.8) * sin(p.z * freq + uTime * 1.2);
          n = sign(n) * pow(abs(n), 1.0 + uRound); // 0 = original lumps, higher = softer
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(p + normal * n * uDistort, 1.0);
          vec2 q = (clip.xy / clip.w - uMouse) * vec2(uAspect, 1.0);
          float near = smoothstep(0.28, 0.0, length(q)) * uMouseStr * (1.0 - uPanel);
          p += normal * (n * uDistort * (1.0 - near) - 0.3 * near);
          p = mix(p, panelShape(normalize(position)), uPanel);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uLight, uPanel;
        varying vec3 vNormal, vView;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
          vec3 col = mix(uColor * 0.15, uColor, f) + f * 0.25;
          // As a panel the middle turns pale so text stays readable; only the glowing rim keeps colour.
          col = mix(col, vec3(0.93, 0.92, 0.89), uPanel * (1.0 - f) * 0.92);
          gl_FragColor = vec4(col, uLight);
        }`,
    })
  );
  mesh.add(clay);
  scene.add(mesh);

  // Theme: 0 = dark (spiky), 1 = light (clay). Eased so switching cross-fades.
  let light = document.documentElement.dataset.theme === 'light' ? 1 : 0;
  let lightTarget = light;
  document.addEventListener('themechange', e => { lightTarget = e.detail === 'light' ? 1 : 0; });

  function apply(s) {
    uniforms.uDistort.value = s.distort;
    uniforms.uRound.value = s.round;
    uniforms.uNoise.value = s.noise;
  }
  apply(loadSettings());

  // Input
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const mouseTarget = new THREE.Vector2();
  let pointerOn = false;
  // Rotation is kept as a quaternion and turned in screen space, so dragging always moves the
  // shape the way the cursor moves. Releasing keeps the momentum, which slowly fades.
  const dragQ = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), tiltQ = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vel = { x: 0, y: 0 }, last = { x: 0, y: 0 };
  let dragging = false;
  function spin(x, y) { dragQ.premultiply(tmpQ.setFromEuler(euler.set(x, y, 0))); }
  addEventListener('pointermove', e => {
    if (!pointerOn && uniforms.uMouseStr.value < 0.01) uniforms.uMouse.value.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); // no sweep-in from offscreen
    pointerOn = true;
    mouseTarget.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2);
    if (dragging) {
      vel.y = (e.clientX - last.x) * 0.006;
      vel.x = (e.clientY - last.y) * 0.006;
      last.x = e.clientX; last.y = e.clientY;
      spin(vel.x, vel.y);
    }
  });
  addEventListener('pointerdown', e => {
    if (!drag || panelTarget === 1 || e.pointerType === 'touch' || e.target.closest('input, button, a, nav')) return;
    dragging = true;
    last.x = e.clientX; last.y = e.clientY;
    vel.x = vel.y = 0;
    document.documentElement.classList.add('dragging');
  });
  // Pointer leaves the window or a finger lifts: spikes spring back out.
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => {
    if (e.pointerType === 'touch') pointerOn = false;
    if (dragging) { dragging = false; document.documentElement.classList.remove('dragging'); }
  });
  document.documentElement.addEventListener('pointerleave', () => { pointerOn = false; });
  function onOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    target.y = THREE.MathUtils.clamp(e.gamma / 45, -1, 1) * 0.8;
    target.x = THREE.MathUtils.clamp((e.beta - 45) / 45, -1, 1) * 0.8;
  }

  // Gyro: Android and others work straight away. iOS needs a user gesture, so the page
  // asks for it via the returned needsPermission / requestTilt.
  const hasGyro = isMobile && 'DeviceOrientationEvent' in window;
  const needsPermission = hasGyro && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (hasGyro && !needsPermission) addEventListener('deviceorientation', onOrientation);
  async function requestTilt() {
    try {
      if (await DeviceOrientationEvent.requestPermission() === 'granted') {
        addEventListener('deviceorientation', onOrientation);
        return true;
      }
    } catch { /* denied */ }
    return false;
  }

  const panelCenter = new THREE.Vector2();
  const identityQ = new THREE.Quaternion();
  let lastNow = performance.now();
  // Colour change on click: declared up here because the render loop starts before the handlers below are set up.
  const CORE = 0.55; // fraction of the shape's radius that counts as "the middle"
  const HUE_MS = 3000;
  let hue = hue0, hueFrom = hue0, hueTo = hue0, hueT = 1, lastHueNow = performance.now();
  let panelMs = 1800; // how long a full blob <-> panel morph takes
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    uniforms.uAspect.value = w / h;
    camera.position.z = w < h ? 11 : 7.5;
    camera.updateProjectionMatrix();
    if (panelEl) {
      const r = panelEl.getBoundingClientRect();
      const wpp = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z / h; // world units per pixel at z = 0
      uniforms.uBox.value.set(r.width / 2 * wpp, r.height / 2 * wpp, 0.35);
      panelCenter.set((r.left + r.width / 2 - w / 2) * wpp, -(r.top + r.height / 2 - h / 2) * wpp);
    }
    mesh.position.x = side === 'right' && w >= h ? 3.4 : 0;
    mesh.position.y = side === 'right' && w < h ? 2.5 : 0;
  }
  addEventListener('resize', resize);
  resize();
  if (panelEl) new ResizeObserver(resize).observe(panelEl);

  const clock = new THREE.Clock();
  let running = true;
  let lastT = 0;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) loop(); });
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const k = reduceMotion ? 0 : 1;
    const t = clock.getElapsedTime() * k;
    uniforms.uTime.value = t * 0.6;
    uniforms.uMouse.value.lerp(mouseTarget, 0.25);
    uniforms.uMouseStr.value += ((pointerOn ? 1 : 0) - uniforms.uMouseStr.value) * 0.1;
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    const dt = t - lastT;
    lastT = t;
    if (!dragging) {
      spin(vel.x, vel.y);
      vel.x *= 0.95; vel.y *= 0.95;
    }
    spin(0.08 * dt, 0.12 * dt); // idle drift
    light += (lightTarget - light) * 0.1;
    if (Math.abs(lightTarget - light) < 0.002) light = lightTarget;
    let ease = 0;
    if (panelEl) {
      // Progress moves toward the target (blob <-> panel) and is eased for the morph.
      const now = performance.now();
      const step = Math.min((now - lastNow) / panelMs, 0.1);
      lastNow = now;
      if (reduceMotion) panelT = panelTarget;
      else panelT = panelTarget > panelT ? Math.min(panelTarget, panelT + step) : Math.max(panelTarget, panelT - step);
      const p = panelT;
      ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      uniforms.uPanel.value = ease;
    }
    uniforms.uDim.value = dim * (1 - light) * (1 - 0.3 * ease);
    clayUniforms.uLight.value = light;
    spiky.visible = light < 0.999;
    clay.visible = light > 0.001;
    clay.scale.setScalar(0.92 + 0.08 * light);
    mesh.quaternion.copy(tiltQ.setFromEuler(euler.set(cur.x, cur.y, 0))).multiply(dragQ);
    if (panelEl) {
      mesh.quaternion.slerp(identityQ, ease);
      mesh.position.set(panelCenter.x * ease, panelCenter.y * ease, 0);
    }
    if (hueT < 1) {
      const now = performance.now();
      hueT = Math.min(1, hueT + (now - lastHueNow) / HUE_MS);
      lastHueNow = now;
      const e = hueT < 0.5 ? 2 * hueT * hueT : 1 - Math.pow(-2 * hueT + 2, 2) / 2;
      const delta = ((hueTo - hueFrom + 1.5) % 1) - 0.5; // shortest way round the colour wheel
      hue = (hueFrom + delta * e + 1) % 1;
      uniforms.uColor.value.setHSL(hue, 0.9, 0.55);
      clayUniforms.uColor.value.setHSL(hue, 0.85, 0.6);
      if (hueT >= 1) { try { sessionStorage.setItem('hue', hue); } catch { /* storage blocked */ } }
    }
    renderer.render(scene, camera);
  }
  loop();

  // Click the middle of the shape (landing page only) and the colour slowly drifts to a new hue.

  function inCore(e) {
    const c = new THREE.Vector3();
    mesh.getWorldPosition(c).project(camera);
    const cx = (c.x * 0.5 + 0.5) * innerWidth, cy = (-c.y * 0.5 + 0.5) * innerHeight;
    const pxPerWorld = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z);
    const radius = (1 + uniforms.uDistort.value) * pxPerWorld * CORE;
    return Math.hypot(e.clientX - cx, e.clientY - cy) < radius;
  }

  function changeColor() {
    hueFrom = hue;
    do { hueTo = randomHue(); } while (Math.min(Math.abs(hueTo - hue), 1 - Math.abs(hueTo - hue)) < 0.15);
    hueT = 0;
    lastHueNow = performance.now();
  }

  let press = null;
  addEventListener('pointerdown', e => { press = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', e => {
    const p = press;
    press = null;
    // a tap or click, not the end of a drag, on the canvas itself, while showing the blob
    if (!p || e.target !== canvas || panelTarget === 1 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
    if (inCore(e)) changeColor();
  });
  addEventListener('pointermove', e => {
    const over = e.pointerType !== 'touch' && e.target === canvas && panelTarget === 0 && !dragging && inCore(e);
    document.documentElement.classList.toggle('over-core', over);
  });

  function setMode(mode, ms = 1800) {
    panelMs = ms;
    panelTarget = mode === 'panel' ? 1 : 0;
    if (panelTarget === 1 && dragging) { dragging = false; document.documentElement.classList.remove('dragging'); }
  }

  return { apply, needsPermission, requestTilt, setMode };
}
