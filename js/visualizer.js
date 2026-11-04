// Neon cube visualizer (from the original cubeneon.js), now drawn inside a
// container element instead of the full page.
// Changes from the original: renders into its container and follows its size,
// one shared cube geometry, pause/resume/track switching without rebuilding,
// rendering skipped while off screen, and the resize crash fixed (orbitRadius
// was a const that handleResize tried to reassign).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const BUFFER_LENGTH = 128;
const GRID_SIZE = 12;
const SPACING = 2;
const CUBE_SIZE = 0.8;

const COLOR_PALETTE = [
  [0.0, 1.0, 0.5], [0.0, 0.9, 0.7], [0.0, 0.8, 1.0],
  [0.2, 0.6, 1.0], [0.3, 0.5, 1.0], [0.5, 0.4, 1.0],
  [0.6, 0.4, 1.0], [0.7, 0.3, 1.0], [0.8, 0.2, 1.0],
  [0.75, 0.0, 0.85], [0.7, 0.0, 0.7], [0.6, 0.0, 0.6],
].map(([r, g, b]) => new THREE.Color(r, g, b));

const COLOR_UPDATE_INTERVAL = 16.67;
const MAX_HISTORY = 20;
const BPM = 130;
const BASE_TWEEN_TIME = (1000 / (BPM / 60)) * 8;
const WAVE_AMPLITUDE = 2;
const ORBIT_SPEED = 0.001;
const BASE_ORBIT = 20;
const FOCUS = new THREE.Vector3(0, 0, 0);

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export function createVisualizer(container) {
  const dataArray = new Uint8Array(BUFFER_LENGTH);

  let renderer, scene, camera, composer, geometry, resizeObserver;
  let cubes = [];
  let colorIndices = [];
  let loudnessHistory = [];
  let lastColorCheck = 0;
  let lastColorChangeTime = 0;
  let orbitRadius = BASE_ORBIT;

  let audio, audioContext, analyser;
  let playing = false;
  let visible = true;
  let raf = 0;

  function initScene() {
    if (renderer) return;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x202020, 0);
    container.prepend(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 5, 0);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 360), 1.5, 0.4, 0.85));

    scene.add(new THREE.AmbientLight(0x222222));
    const pointLight = new THREE.PointLight(0xffffff, 1, 50);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);
    const backLight = new THREE.PointLight(0xffffff, 0.5, 100);
    backLight.position.set(0, 0, -50);
    scene.add(backLight);

    geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const color = new THREE.Color(Math.random(), Math.random(), Math.random());
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.5,
          metalness: 0.2,
          roughness: 0.1,
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set((x - GRID_SIZE / 2) * SPACING, 0, (z - GRID_SIZE / 2) * SPACING);
        scene.add(cube);
        cubes.push(cube);
      }
    }
    colorIndices = cubes.map((_, i) => i % COLOR_PALETTE.length);

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
  }

  function initAudio() {
    if (audio) return;
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = BUFFER_LENGTH * 2;
    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Pull the camera back on narrow (portrait) shapes so the grid still fits.
    orbitRadius = BASE_ORBIT * clamp(16 / 9 / camera.aspect, 1, 1.8);
    if (!raf) composer.render();
  }

  function updateColorsOnBeat(now) {
    if (now - lastColorCheck < COLOR_UPDATE_INTERVAL) return;
    lastColorCheck = now;

    const avgLoudness = dataArray.reduce((a, b) => a + b, 0) / BUFFER_LENGTH;
    loudnessHistory.push(avgLoudness);
    if (loudnessHistory.length > MAX_HISTORY) loudnessHistory.shift();

    const avgHistory = loudnessHistory.reduce((a, b) => a + b, 0) / loudnessHistory.length;
    if (avgLoudness >= avgHistory * 1.05 && now - lastColorChangeTime > 200) {
      cubes.forEach((cube, i) => {
        const next = COLOR_PALETTE[colorIndices[i]];
        cube.material.color.copy(next);
        cube.material.emissive.copy(next);
        colorIndices[i] = (colorIndices[i] + 1) % COLOR_PALETTE.length;
      });
      lastColorChangeTime = now;
    }
  }

  function frame(now) {
    if (!playing || !visible) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);

    analyser.getByteFrequencyData(dataArray);
    updateColorsOnBeat(now);

    const angle = now * ORBIT_SPEED;
    camera.position.x = Math.cos(angle) * orbitRadius;
    camera.position.z = Math.sin(angle) * orbitRadius;
    camera.lookAt(FOCUS);

    const bandWidth = Math.floor(BUFFER_LENGTH / GRID_SIZE);
    cubes.forEach((cube, index) => {
      // each row listens to its own slice of the spectrum
      const row = Math.floor(index / GRID_SIZE);
      const bandStart = row * bandWidth;
      let sum = 0;
      for (let i = 0; i < bandWidth; i++) sum += dataArray[bandStart + i] || 0;
      const intensity = sum / bandWidth / 255;

      cube.scale.set(1.5, clamp(intensity * intensity * 20, 0.1, 50), 1.5);
      cube.material.emissiveIntensity = clamp(intensity * 1.5, 0.05, 5);

      // polyrhythm: every cube waves on a slightly different period
      const period = BASE_TWEEN_TIME / ((index + 63) / 64);
      const phase = (now % period) / period;
      cube.position.y = Math.sin(phase * Math.PI * 2) * WAVE_AMPLITUDE + CUBE_SIZE * 4;
    });

    composer.render();
  }

  function startLoop() {
    if (!raf && playing && visible) raf = requestAnimationFrame(frame);
  }

  function sameSrc(src) {
    return audio.src && audio.src === new URL(src, document.baseURI).href;
  }

  return {
    get playing() {
      return playing;
    },

    async play(src) {
      initScene();
      initAudio();
      if (src && !sameSrc(src)) audio.src = src;
      await audioContext.resume();
      await audio.play();
      playing = true;
      startLoop();
    },

    pause() {
      if (audio) audio.pause();
      playing = false;
    },

    stop() {
      this.pause();
      if (audio) audio.currentTime = 0;
      loudnessHistory = [];
    },

    setTrack(src) {
      if (!audio || sameSrc(src)) return;
      audio.src = src;
      if (playing) audio.play().catch(() => {});
    },

    setVisible(isVisible) {
      visible = isVisible;
      startLoop();
    },

    destroy() {
      this.stop();
      cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver?.disconnect();
      cubes.forEach((c) => c.material.dispose());
      geometry?.dispose();
      composer?.dispose?.();
      renderer?.dispose();
      renderer?.domElement.remove();
      audioContext?.close();
    },
  };
}
