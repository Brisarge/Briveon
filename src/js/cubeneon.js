import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'; 

// 🔊 Load Audio
const audio = new Audio("assets/music/space_race.mp3");
audio.loop = true;
audio.crossOrigin = "anonymous";

// 🎵 Web Audio API Setup
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioContext.createAnalyser();
const source = audioContext.createMediaElementSource(audio);
source.connect(analyser);
analyser.connect(audioContext.destination);

// 🎚 Audio Processing Settings
analyser.fftSize = 256;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

// 🖼 Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

// ✨ Bloom Effect
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
composer.addPass(bloomPass);

// 💡 Lighting
const ambientLight = new THREE.AmbientLight(0x222222);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 1, 50);
pointLight.position.set(0, 10, 10);
scene.add(pointLight);

// 🌟 Background Light (Changes Intensity with Bass)
const backgroundLight = new THREE.PointLight(0xffffff, 0.5, 100);
backgroundLight.position.set(0, 0, -50);
scene.add(backgroundLight);

// 🎲 Cube Storage
const cubes = [];
let lastHighlightedCube = null;

let lastColorChangeTime = 0;
const colorPalette = [
  new THREE.Color(0.0, 1.0, 0.5),   // Mint Green
  new THREE.Color(0.0, 0.9, 0.7),   // Seafoam
  new THREE.Color(0.0, 0.8, 1.0),   // Aqua
  new THREE.Color(0.2, 0.6, 1.0),   // Light Sky Blue
  new THREE.Color(0.3, 0.5, 1.0),   // Sky Blue
  new THREE.Color(0.5, 0.4, 1.0),   // Periwinkle
  new THREE.Color(0.6, 0.4, 1.0),   // Lavender
  new THREE.Color(0.7, 0.3, 1.0),   // Orchid
  new THREE.Color(0.8, 0.2, 1.0),   // Electric Purple
  new THREE.Color(0.75, 0.0, 0.85), // Magenta Purple
  new THREE.Color(0.7, 0.0, 0.7),   // Neon Violet
  new THREE.Color(0.6, 0.0, 0.6)    // Deep Violet
];

const loudnessHistory = [];
const maxHistorySize = 50;

let lastColorCheck = 0;
const colorUpdateInterval = 50; // ms

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateColorsBPM(currentTime) {
  if (currentTime - lastColorCheck < colorUpdateInterval) return;
  lastColorCheck = currentTime;

  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const avgLoudness = sum / bufferLength;

  loudnessHistory.push(avgLoudness);
  if (loudnessHistory.length > maxHistorySize) {
    loudnessHistory.shift();
  }

  const avgHistory = loudnessHistory.reduce((a, b) => a + b, 0) / loudnessHistory.length;
  const threshold = avgHistory * 1.2;
  
  

  if (avgLoudness >= threshold && performance.now() - lastColorChangeTime > 200) {
    cubes.forEach((cube, i) => {
      const newColor = colorPalette[colorIndices[i]];
      cube.material.color.copy(newColor);
      cube.material.emissive.copy(newColor);
      colorIndices[i] = (colorIndices[i] + 1) % colorPalette.length;
    });
    lastColorChangeTime = currentTime;
  }
}



// 🎲 Function to Create a Cube
function createCube(position) {
  const size = 0.8;
  const geometry = new THREE.BoxGeometry(size, size, size);

  const color = new THREE.Color(Math.random(), Math.random(), Math.random());
  
  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.5,
    metalness: 0.2,
    roughness: 0.1
  });

  const cube = new THREE.Mesh(geometry, material);
  cube.position.copy(position);

  cube.userData = {
    targetColor: color.clone(),
    baseSize: size,
    speed: 0,
    initialRotX: 0,
    initialRotY: 0
  };

  scene.add(cube);
  cubes.push(cube);
}

// 🎲 Generate Cubes
const gridSize = 12;
const spacing = 2;

for (let x = 0; x < gridSize; x++) {
  for (let z = 0; z < gridSize; z++) {
    const posX = (x - gridSize / 2) * spacing;
    const posZ = (z - gridSize / 2) * spacing;
    const position = new THREE.Vector3(posX, 0, posZ);
    createCube(position);
  }
}

let colorIndices = cubes.map((_, i) => i % colorPalette.length);

// 📸 Camera Position
camera.position.set(15, 15, 15); // Position the camera diagonally above the scene
camera.lookAt(0, 5, 0); // Make the camera look at the center of the scene

let mouseX = 0, mouseY = 0;
document.addEventListener("mousemove", (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
});

// 🎵 Function to Detect the Loudest Frequency Peak
function getLoudestFrequencyIndex() {
  let maxIndex = 0;
  let maxValue = 0;
  for (let i = 0; i < bufferLength; i++) {
    if (dataArray[i] > maxValue) {
      maxValue = dataArray[i];
      maxIndex = i;
    }
  }
  return maxIndex % cubes.length; // Pick a cube index
}

const BPM = 130; // Set this to your track’s BPM
const BPS = BPM / 60;
const baseTweenTime = (1000 / BPS) * 8; // One beat in milliseconds
const waveAmplitude = 2;
const waveDuration = baseTweenTime; // could be bpm synced
let cubeTimers = Array(cubes.length).fill(0); // timer for each cube
let cubeOffsets = Array(cubes.length).fill(0); // vertical offset target

function updatePolyrhythmCubes(now) {
  cubes.forEach((cube, index) => {
    const delayIndex = index; // assuming left-to-right for now
    const adjustedTime = baseTweenTime / ((delayIndex + 63) / 64);

    // Time modulo creates oscillation
    const phaseTime = (now % adjustedTime) / adjustedTime;
    const wave = Math.sin(phaseTime * Math.PI * 2); // full up/down cycle

    // Final offset
    const yOffset = wave * waveAmplitude;
    cube.position.y = yOffset + cube.userData.baseSize * 4; // original offset height
  });
}

const orbitRadius = 20; // Distance from center
const focusPoint = new THREE.Vector3(0, 0, 0); // What camera looks at
const orbitSpeed = 0.001; // Speed of orbiting

// 🎥 Animation Loop
function animate() {
  requestAnimationFrame(animate);
  analyser.getByteFrequencyData(dataArray);

  const highlightedIndex = getLoudestFrequencyIndex();
  const now = performance.now();
  updateColorsBPM(now);

  // 🌀 Orbit camera
  const angle = now * orbitSpeed;
  camera.position.x = Math.cos(angle) * orbitRadius;
  camera.position.z = Math.sin(angle) * orbitRadius;
  camera.lookAt(focusPoint);

  cubes.forEach((cube, index) => {
    const fftIndex = Math.floor(index / cubes.length * bufferLength); // Stretch across the buffer
    const intensity = dataArray[fftIndex] / 255;
  
    const scale = cube.userData.baseSize * (intensity);
    const rawY = scale * intensity * 20;
    if (rawY == 0) {
      cube.scale.set(1.5, 0.1, 1.5); // Set to minimum scale if intensity is zero
    }
    const clampedY = clamp(rawY, 0.1, 50); // Cap between 0.1 and 10
    cube.scale.set(1.5, clampedY, 1.5);
    
    cube.material.emissiveIntensity = clamp(intensity * 1.5, 0.05, 5); // Cap between 0.1 and 2
    cube.position.y = updatePolyrhythmCubes(performance.now());
  });

  composer.render();
}

// 🟢 Start Animation
animate();

const startButton = document.getElementById("start");
if (startButton) {
  startButton.addEventListener("click", () => {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    audio.play().then(() => {
      console.log("Audio started playing.");
    }).catch(err => {
      console.error("Audio play error:", err);
    });
  });
}


// 📏 Handle Window Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

export { audio, audioContext };
