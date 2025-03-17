import * as THREE from 'https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js';

// Setup Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create an Infinite Floor (Large Ground Plane)
const planeGeometry = new THREE.PlaneGeometry(1000, 1000);  // Increased size for the "infinite" effect
const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

// Create Player (Cube)
const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);

player.position.y = 0.5;
camera.position.set(0, 5, 10);
camera.lookAt(player.position);

// Add Lighting to the Scene
const pointLight = new THREE.PointLight(0xffffff, 1, 100);
pointLight.position.set(10, 10, 10);  // Position the light
scene.add(pointLight);

// Optionally, add a light helper to visualize the light's position
const lightHelper = new THREE.PointLightHelper(pointLight, 1);
scene.add(lightHelper);

// Handle Keyboard Input
const keys = {};
document.addEventListener('keydown', (event) => keys[event.code] = true);
document.addEventListener('keyup', (event) => keys[event.code] = false);

function updateCameraPosition() {
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 10;  // Adjust the distance as needed
    camera.position.y = 5;  // Maintain the height of the camera
    camera.lookAt(player.position);
}

function update() {
    if (keys['ArrowUp']) player.position.z -= 0.1;
    if (keys['ArrowDown']) player.position.z += 0.1;
    if (keys['ArrowLeft']) player.position.x -= 0.1;
    if (keys['ArrowRight']) player.position.x += 0.1;

    updateCameraPosition();  // Keep camera updated with player movement
}

// Game Loop
function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}
animate();

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

