import * as THREE from "../node_modules/three/build/three.module.js";

// Scene, Camera, and Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // Transparent background
document.body.appendChild(renderer.domElement);

const cubes = []; // Store multiple cubes


// Function to Create a Random Cube
function createCube() {
  const size = Math.random() * 2.5 + 0.5; // Random size between 0.5 and 2
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff, wireframe: true });
  const cube = new THREE.Mesh(geometry, material);

  // Random start position (falling from above)
  cube.position.set(
    (Math.random() - 0.5) * 20, // X range: -10 to 10
    Math.random() * 15 + 5, // Y range: 5 to 20 (falling down)
    (Math.random() - 0.5) * 200 // Z range: -10 to 10
  );

  cube.userData = {
    speed: Math.random() * 0.02 + 0.01, // Falling speed
    rotX: Math.random() * 0.02 - 0.01, // Random rotation speed X
    rotY: Math.random() * 0.02 - 0.01, // Random rotation speed Y
  };

  scene.add(cube);
  cubes.push(cube);
}

// Generate multiple cubes
for (let i = 0; i < 50; i++) {
  createCube();
}

// Position the Camera
camera.position.z = 10;

// Animation Loop
function animate() {
  requestAnimationFrame(animate);

  cubes.forEach(cube => {
    cube.rotation.x += cube.userData.rotX;
    cube.rotation.y += cube.userData.rotY;
    cube.position.y -= cube.userData.speed; // Move cube downward

    // Reset cube when it falls below view
    if (cube.position.y < -10) {
      cube.position.y = Math.random() * 15 + 5; // Reset above screen
      cube.position.x = (Math.random() - 0.5) * 20;
      cube.position.z = (Math.random() - 0.5) * 20;
    }
  });

  renderer.render(scene, camera);
}

animate();

// Handle window resizing
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("mousemove", (event) => {
  let x = (event.clientX / window.innerWidth) * 2 - 1;
  let y = -(event.clientY / window.innerHeight) * 2 + 1;
  camera.position.x = x * 3;
  camera.position.y = y * 3;
  camera.lookAt(scene.position);
});
