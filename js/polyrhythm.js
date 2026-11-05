// Rhythm Rush demo: Polyrhythm Dash's 12 platforms + Rhythm Rush's beat detector,
// running in the browser.
//
// Motion: platform k (1..12) does one swing in  T * n / (k + n - 1)  seconds,
// where T is one beat at the chosen BPM and n is the ratio (64 for 63/64).
// Positions come from the audio clock, so they never drift.
// Colors: with music, every platform steps through the palette on each detected
// beat (Rhythm Rush). With no music, each platform steps on its own swing (Dash).

const NOTES = [
  ['B', 493.88], ['A#', 466.16], ['A', 440.0], ['G#', 415.3], ['G', 392.0], ['F#', 369.99],
  ['F', 349.23], ['E', 329.63], ['D#', 311.13], ['D', 293.66], ['C#', 277.18], ['C', 261.63],
];
// Polyrhythm Dash's color list
const PALETTE = ['#ff0000', '#ff6600', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#660080', '#ff00ff'];
const RATIOS = [2, 4, 8, 16, 64];
const COUNT = NOTES.length;

// Rhythm Rush's detector settings (ClientColorPlatforms)
const HISTORY = 20;
const SENSITIVITY = 1.2;

const TRACKS = [
  { id: 'space', name: 'Space Race', src: 'assets/music/space_race.mp3', bpm: 130 },
  { id: 'flow', name: 'Flow', src: 'assets/music/flow.mp3', bpm: null },
];

const $ = (s, r = document) => r.querySelector(s);

const state = {
  n: 64,
  bpm: 130,
  notes: false,
  thresholdMode: 'mult', // 'mult' = average × 1.2, or a fixed offset like '50' / '100'
  source: 'flow',
  fileUrl: null,
  fileName: '',
  running: false,
  t0: 0,
  swings: new Array(COUNT).fill(0),
  colors: NOTES.map((_, i) => i % PALETTE.length),
  pulse: new Array(NOTES.length).fill(0), // 1 right after a beat, fades to 0
  lastFrame: 0,
  history: [],
  debounce: false,
  loud: 0,
  graph: [],
  taps: [],
};

let ctx, analyser, buf, notesBus, mediaEl, mediaNode, streamNode, stream, raf = 0;

// ---------- Audio ----------

function ensureAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  buf = new Float32Array(analyser.fftSize);
  notesBus = ctx.createGain();
  notesBus.gain.value = 0.09;
  notesBus.connect(ctx.destination);
}

function playNote(freq) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(1, now + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  osc.connect(env).connect(notesBus);
  osc.start(now);
  osc.stop(now + 0.75);
}

function mediaElement() {
  if (!mediaEl) {
    mediaEl = new Audio();
    mediaEl.loop = true;
    mediaEl.crossOrigin = 'anonymous';
    mediaNode = ctx.createMediaElementSource(mediaEl);
    mediaNode.connect(analyser);
    mediaNode.connect(ctx.destination);
  }
  return mediaEl;
}

function stopSource() {
  if (mediaEl) mediaEl.pause();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (streamNode) {
    streamNode.disconnect();
    streamNode = null;
  }
}

async function startSource() {
  stopSource();
  const kind = state.source;
  if (kind === 'none') return;

  if (kind === 'tab') {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      throw new Error('No audio was shared. Pick a tab and tick "Share tab audio".');
    }
    stream.getAudioTracks()[0].addEventListener('ended', () => stop('Tab sharing ended.'));
    // Only into the analyser: the tab is already playing the sound.
    streamNode = ctx.createMediaStreamSource(stream);
    streamNode.connect(analyser);
    return;
  }

  const el = mediaElement();
  const src = kind === 'file' ? state.fileUrl : TRACKS.find((t) => t.id === kind).src;
  if (el.dataset.src !== src) {
    el.src = src;
    el.dataset.src = src;
  }
  el.currentTime = 0;
  await el.play();
}

// ---------- Timing ----------

// Rhythm Rush's Easy speed: one swing (one way) every two beats
const SWING_BEATS = 2;
const beat = () => 60 / state.bpm;
const swingTime = (i) => (beat() * SWING_BEATS * state.n) / (i + state.n);

function syncSwings() {
  const t = ctx ? ctx.currentTime - state.t0 : 0;
  for (let i = 0; i < COUNT; i++) state.swings[i] = Math.floor(Math.max(t, 0) / swingTime(i));
}

function restartClock(at) {
  state.t0 = at ?? (ctx ? ctx.currentTime : 0);
  syncSwings();
}

// ---------- Beat detector (Rhythm Rush's loop) ----------

function detect() {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  // scale RMS roughly into Roblox's PlaybackLoudness range (0..1000)
  const loud = state.source === 'none' ? 0 : Math.min(1000, Math.sqrt(sum / buf.length) * 2600);
  state.loud = loud;

  state.history.push(loud);
  if (state.history.length > HISTORY) state.history.shift();
  const avg = state.history.reduce((a, b) => a + b, 0) / state.history.length;
  // the shipped version used 1.2× the average; fixed offsets were the tuning alternative
  const threshold = state.thresholdMode === 'mult' ? avg * SENSITIVITY : avg + Number(state.thresholdMode);

  let hit = false;
  if (loud < threshold) state.debounce = false;
  if (loud >= threshold && !state.debounce && loud > 8) {
    state.debounce = true;
    hit = true;
    state.colors = state.colors.map((c) => (c + 1) % PALETTE.length);
    state.pulse.fill(1);
  }

  state.graph.push({ loud, threshold, hit });
  if (state.graph.length > 360) state.graph.shift();
}

// ---------- Drawing ----------

const stageCanvas = $('#poly-stage');
const graphCanvas = $('#poly-graph');

function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}

function drawStage(t) {
  const { g, w, h } = fit(stageCanvas);
  g.clearRect(0, 0, w, h);

  const label = 34;
  const pad = 10;
  const laneH = (h - pad * 2) / COUNT;
  const trackX = label + 6;
  const trackW = w - trackX - pad;
  const platW = Math.max(26, Math.min(70, trackW * 0.1));
  const platH = laneH * 0.62;
  const border = 1 + (state.loud / 1000) * 7;

  g.font = '500 11px "JetBrains Mono", monospace';
  g.textBaseline = 'middle';

  for (let i = 0; i < COUNT; i++) {
    const y = pad + i * laneH + laneH / 2;
    const color = PALETTE[state.colors[i]];
    const pulse = state.pulse[i];

    g.fillStyle = '#6b7560';
    g.textAlign = 'right';
    g.fillText(NOTES[i][0], label, y);

    // lane line takes the platform's color and flashes on each beat
    g.strokeStyle = color;
    g.globalAlpha = 0.22 + 0.6 * pulse;
    g.lineWidth = 2 + 3 * pulse;
    g.beginPath();
    g.moveTo(trackX, y);
    g.lineTo(trackX + trackW, y);
    g.stroke();
    g.globalAlpha = 1;

    const phase = t / swingTime(i);
    const pos = (1 - Math.cos(Math.PI * phase)) / 2;
    const scale = 1 + 0.3 * pulse; // size pop on the beat
    const w = platW * scale;
    const hgt = Math.min(platH * scale, laneH * 0.95);
    const cx = trackX + platW / 2 + pos * (trackW - platW);

    g.shadowColor = color;
    g.shadowBlur = 4 + 26 * pulse;
    g.fillStyle = color;
    g.fillRect(cx - w / 2, y - hgt / 2, w, hgt);
    g.shadowBlur = 0;
    g.strokeStyle = '#e8f0de';
    g.lineWidth = border;
    g.strokeRect(cx - w / 2 + border / 2, y - hgt / 2 + border / 2, w - border, hgt - border);
  }
}

function drawGraph() {
  const { g, w, h } = fit(graphCanvas);
  g.clearRect(0, 0, w, h);
  const data = state.graph;
  if (!data.length) return;

  const max = Math.max(200, ...data.map((d) => Math.max(d.loud, d.threshold))) * 1.1;
  const step = w / 359;
  const x0 = w - (data.length - 1) * step;
  const yOf = (v) => h - 4 - (v / max) * (h - 8);

  g.strokeStyle = 'rgba(255,0,255,0.55)';
  g.lineWidth = 1;
  data.forEach((d, i) => {
    if (!d.hit) return;
    const x = x0 + i * step;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  });

  const line = (key, color, width, dash) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    data.forEach((d, i) => {
      const x = x0 + i * step;
      const y = yOf(d[key]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    g.setLineDash([]);
  };
  line('threshold', 'rgba(232,240,222,0.7)', 1, [4, 4]);
  line('loud', '#8bc641', 2, []);
}

// ---------- Readouts ----------

function updateReadouts(t) {
  const n = state.n;
  $('#poly-spread').textContent = `${((COUNT + n - 1) / n).toFixed(2)}×`;
  const cycleBeats = 2 * n * SWING_BEATS; // platform 1 swings out and back n times
  $('#poly-realign').textContent = `${cycleBeats / 4} bar${cycleBeats / 4 === 1 ? '' : 's'}`;
  if (state.running) {
    const beatsIn = t / beat();
    const left = cycleBeats - (beatsIn % cycleBeats);
    $('#poly-countdown').textContent = `${(left / 4).toFixed(1)} bars`;
  } else {
    $('#poly-countdown').textContent = '–';
  }
}

// ---------- Loop ----------

function frame() {
  raf = requestAnimationFrame(frame);
  const t = ctx.currentTime - state.t0;
  const now = performance.now();
  const dt = state.lastFrame ? (now - state.lastFrame) / 1000 : 0;
  state.lastFrame = now;
  const fade = Math.exp(-dt / 0.14);
  for (let i = 0; i < COUNT; i++) state.pulse[i] *= fade;
  detect();

  for (let i = 0; i < COUNT; i++) {
    const swing = Math.floor(Math.max(t, 0) / swingTime(i));
    if (swing > state.swings[i]) {
      state.swings[i] = swing;
      if (state.notes) playNote(NOTES[i][1]);
      if (state.source === 'none') {
        state.colors[i] = (state.colors[i] + 1) % PALETTE.length;
        state.pulse[i] = 1;
      }
    }
  }

  drawStage(Math.max(t, 0));
  drawGraph();
  updateReadouts(t);
}

function idle() {
  drawStage(0);
  drawGraph();
  updateReadouts(0);
}

// ---------- Controls ----------

const status = $('#poly-status');
const playBtn = $('#poly-play');

async function start() {
  ensureAudio();
  await ctx.resume();
  status.textContent = '';
  try {
    await startSource();
  } catch (err) {
    status.textContent = err.name === 'NotAllowedError' ? 'Sharing was cancelled.' : err.message;
    return;
  }
  state.history = [];
  state.graph = [];
  state.debounce = false;
  restartClock();
  state.running = true;
  playBtn.textContent = 'Stop';
  if (!raf) frame();
}

function stop(message = '') {
  stopSource();
  state.running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  state.loud = 0;
  state.lastFrame = 0;
  state.pulse.fill(0);
  playBtn.textContent = 'Play';
  status.textContent = message;
  idle();
}

playBtn.addEventListener('click', () => (state.running ? stop() : start()));

function pressed(group, value) {
  group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
}

// Sources
const sources = $('#poly-sources');
const fileInput = $('#poly-file');
const canShareTab = !!navigator.mediaDevices?.getDisplayMedia && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
if (!canShareTab) sources.querySelector('[data-value="tab"]').hidden = true;

async function chooseSource(value) {
  state.source = value;
  pressed(sources, value);
  const track = TRACKS.find((t) => t.id === value);
  if (track?.bpm) setBpm(track.bpm, false);
  if (state.running) {
    try {
      ensureAudio();
      await startSource();
      restartClock();
      status.textContent = track && !track.bpm ? 'Tap along to set the BPM.' : '';
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Sharing was cancelled.' : err.message;
    }
  } else if (value === 'file' || value === 'tab' || (track && !track.bpm)) {
    status.textContent = 'Press Play, then tap along to set the BPM.';
  } else {
    status.textContent = '';
  }
}

sources.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.value === 'file') {
    fileInput.click();
    return;
  }
  chooseSource(btn.dataset.value);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  state.fileUrl = URL.createObjectURL(file);
  state.fileName = file.name;
  sources.querySelector('[data-value="file"]').textContent = file.name.length > 22 ? `${file.name.slice(0, 20)}…` : file.name;
  chooseSource('file');
});

// Ratio
const ratios = $('#poly-ratios');
ratios.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.n = Number(btn.dataset.value);
  pressed(ratios, btn.dataset.value);
  if (state.running) {
    // restart on the current beat so the new ratio starts in unison, still on the grid
    const t = ctx.currentTime - state.t0;
    restartClock(state.t0 + Math.floor(t / beat()) * beat());
  }
  updateReadouts(0);
});

// Beat threshold
const thresholds = $('#poly-thresholds');
const thresholdKey = $('#poly-thr-key');
thresholds.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.thresholdMode = btn.dataset.value;
  pressed(thresholds, btn.dataset.value);
  thresholdKey.textContent = btn.dataset.value === 'mult' ? 'average × 1.2' : `average + ${btn.dataset.value}`;
  state.debounce = false;
});

// BPM
const bpmInput = $('#poly-bpm');
function setBpm(value, restart = true) {
  state.bpm = Math.min(220, Math.max(40, Math.round(value)));
  bpmInput.value = state.bpm;
  if (restart && state.running) restartClock();
}
bpmInput.addEventListener('change', () => setBpm(Number(bpmInput.value) || state.bpm));

$('#poly-tap').addEventListener('click', () => {
  ensureAudio();
  const now = ctx.currentTime;
  state.taps = state.taps.filter((t) => now - t < 2.5);
  state.taps.push(now);
  if (state.taps.length >= 3) {
    const gaps = state.taps.slice(1).map((t, i) => t - state.taps[i]).slice(-4);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    state.bpm = Math.min(220, Math.max(40, Math.round(60 / avg)));
    bpmInput.value = state.bpm;
    // lock the platforms onto the taps
    if (state.running) restartClock(now);
  }
});

const notesBox = $('#poly-notes');
state.notes = notesBox.checked; // browsers can restore the checkbox on reload
notesBox.addEventListener('change', (e) => {
  state.notes = e.target.checked;
});

window.addEventListener('resize', () => {
  if (!state.running) idle();
});

idle();
