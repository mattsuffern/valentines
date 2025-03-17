import * as THREE from 'https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js';

// Setup Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create an Infinite Floor (Large Ground Plane) - Green Plane
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

// Create multiple Balls (Spheres) at Random Positions
const balls = [];
const numBalls = 1000;  // Change this number to create more or fewer balls

for (let i = 0; i < numBalls; i++) {
    const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);  // Radius of 0.5, segments for smoothness
    const ballMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const ball = new THREE.Mesh(ballGeometry, ballMaterial);

    // Randomize the ball's position within a certain range
    const randomX = Math.random() * 1000 - 500;  // Random X between -500 and 500
    const randomZ = Math.random() * 1000 - 500;  // Random Z between -500 and 500
    ball.position.set(randomX, 0.5, randomZ);  // Set ball position on the ground

    scene.add(ball);  // Add ball to the scene
    balls.push(ball);  // Keep track of all the balls
}

// Update Function
function update() {
    if (keys['ArrowUp']) player.position.z -= 0.1;
    if (keys['ArrowDown']) player.position.z += 0.1;
    if (keys['ArrowLeft']) player.position.x -= 0.1;
    if (keys['ArrowRight']) player.position.x += 0.1;

    // Camera Follows the Player
    const distance = 20;  // Distance from player to camera
    const height = 10;    // Height of the camera

    // Update camera position based on player's position
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + distance;  // Keep the camera behind the player on the Z-axis
    camera.position.y = player.position.y + height;  // Keep the camera above the player
    camera.lookAt(player.position);  // Make the camera always look at the player
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

