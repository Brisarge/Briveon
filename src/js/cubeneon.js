import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

let isAnimating = false;
let animationFrameId = null;

let audio, audioContext, analyser, source;
let renderer, camera, scene, composer;
let cubes = [];
let colorIndices = [];
let loudnessHistory = [];

const bufferLength = 128;
const dataArray = new Uint8Array(bufferLength);
const colorPalette = [
  new THREE.Color(0.0, 1.0, 0.5), new THREE.Color(0.0, 0.9, 0.7), new THREE.Color(0.0, 0.8, 1.0),
  new THREE.Color(0.2, 0.6, 1.0), new THREE.Color(0.3, 0.5, 1.0), new THREE.Color(0.5, 0.4, 1.0),
  new THREE.Color(0.6, 0.4, 1.0), new THREE.Color(0.7, 0.3, 1.0), new THREE.Color(0.8, 0.2, 1.0),
  new THREE.Color(0.75, 0.0, 0.85), new THREE.Color(0.7, 0.0, 0.7), new THREE.Color(0.6, 0.0, 0.6)
];

let lastColorCheck = 0;
let lastColorChangeTime = 0;
const colorUpdateInterval = 16.67;
const maxHistorySize = 20;
const BPM = 130;
const BPS = BPM / 60;
const baseTweenTime = (1000 / BPS) * 8;
const waveAmplitude = 2;
const orbitRadius = 20;
const focusPoint = new THREE.Vector3(0, 0, 0);
const orbitSpeed = 0.001;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function createCube(position, scene) {
  const size = 0.8;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const color = new THREE.Color(Math.random(), Math.random(), Math.random());
  const material = new THREE.MeshStandardMaterial({
    color: color, emissive: color, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.1
  });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.copy(position);
  cube.userData = { baseSize: size };
  scene.add(cube);
  return cube;
}

function updateColorsBPM(currentTime) {
  if (currentTime - lastColorCheck < colorUpdateInterval) return;
  lastColorCheck = currentTime;

  analyser.getByteFrequencyData(dataArray);
  const avgLoudness = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

  loudnessHistory.push(avgLoudness);
  if (loudnessHistory.length > maxHistorySize) loudnessHistory.shift();

  const avgHistory = loudnessHistory.reduce((a, b) => a + b, 0) / loudnessHistory.length;
  const threshold = avgHistory * 1.05;

  if (avgLoudness >= threshold && currentTime - lastColorChangeTime > 200) {
    cubes.forEach((cube, i) => {
      const newColor = colorPalette[colorIndices[i]];
      cube.material.color.copy(newColor);
      cube.material.emissive.copy(newColor);
      colorIndices[i] = (colorIndices[i] + 1) % colorPalette.length;
    });
    lastColorChangeTime = currentTime;
  }
}

function updatePolyrhythmCubes(now) {
  cubes.forEach((cube, index) => {
    const delayIndex = index;
    const adjustedTime = baseTweenTime / ((delayIndex + 63) / 64);
    const phaseTime = (now % adjustedTime) / adjustedTime;
    const wave = Math.sin(phaseTime * Math.PI * 2);
    const yOffset = wave * waveAmplitude;
    cube.position.y = yOffset + cube.userData.baseSize * 4;
  });
}

function getLoudestFrequencyIndex() {
  let maxIndex = 0;
  let maxValue = 0;
  for (let i = 0; i < bufferLength; i++) {
    if (dataArray[i] > maxValue) {
      maxValue = dataArray[i];
      maxIndex = i;
    }
  }
  return maxIndex % cubes.length;
}

function animate() {
  if (!isAnimating) return;
  animationFrameId = requestAnimationFrame(animate);

  const now = performance.now();
  analyser.getByteFrequencyData(dataArray);
  updateColorsBPM(now);

  const angle = now * orbitSpeed;
  camera.position.x = Math.cos(angle) * orbitRadius;
  camera.position.z = Math.sin(angle) * orbitRadius;
  camera.lookAt(focusPoint);

  cubes.forEach((cube, index) => {
    const fftIndex = Math.floor(index / cubes.length * bufferLength);
    const intensity = dataArray[fftIndex] / 255;
    const rawY = intensity * intensity * 20;
    const clampedY = clamp(rawY, 0.1, 50);
    cube.scale.set(1.5, clampedY, 1.5);
    cube.material.emissiveIntensity = clamp(intensity * 1.5, 0.05, 5);
  });

  updatePolyrhythmCubes(now);
  composer.render();
}

function startVisualizer() {
  if (isAnimating) return;
  isAnimating = true;
  loudnessHistory = [];

  // 🎧 Audio setup
  audio = new Audio("assets/music/space_race.mp3");
  audio.loop = true;
  audio.crossOrigin = "anonymous";

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  analyser.fftSize = 256;

  // 🖼 Three.js setup
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(15, 15, 15);
  camera.lookAt(0, 5, 0);

  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
  composer.addPass(bloomPass);

  scene.add(new THREE.AmbientLight(0x222222));
  const pointLight = new THREE.PointLight(0xffffff, 1, 50);
  pointLight.position.set(0, 10, 10);
  scene.add(pointLight);

  const backgroundLight = new THREE.PointLight(0xffffff, 0.5, 100);
  backgroundLight.position.set(0, 0, -50);
  scene.add(backgroundLight);

  // 🎲 Generate cubes
  cubes = [];
  const gridSize = 12;
  const spacing = 2;
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const posX = (x - gridSize / 2) * spacing;
      const posZ = (z - gridSize / 2) * spacing;
      cubes.push(createCube(new THREE.Vector3(posX, 0, posZ), scene));
    }
  }
  colorIndices = cubes.map((_, i) => i % colorPalette.length);

  animate();

  audioContext.resume().then(() => {
    audio.play().catch(console.error);
  });

  window.addEventListener("resize", handleResize);
}

function handleResize() {
  if (!camera || !renderer || !composer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function stopVisualizer() {
  isAnimating = false;
  cancelAnimationFrame(animationFrameId);

  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }

  if (scene) scene.clear();
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.remove();
  }

  window.removeEventListener("resize", handleResize);
}

export { startVisualizer, stopVisualizer };
