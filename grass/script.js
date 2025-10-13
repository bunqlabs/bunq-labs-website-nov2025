import * as THREE from 'three';
import Stats from 'https://unpkg.com/three@latest/examples/jsm/libs/stats.module.js';
import {
  planeSize,
  grassCount,
  bladeWidth,
  bladeHeight,
  bladeSegments,
  taperFactor,
  initialUniforms,
  cameraConfig,
} from './config.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { initDebugPanel } from './debugPanel.js';
import { WindField } from './windField.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  cameraConfig.fov,
  window.innerWidth / window.innerHeight,
  cameraConfig.near,
  cameraConfig.far
);
camera.position.set(...cameraConfig.position);
camera.lookAt(...cameraConfig.lookAt);

const renderer = new THREE.WebGLRenderer({
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Stats.js setup
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
stats.dom.style.position = 'absolute';
stats.dom.style.left = '10px';
stats.dom.style.top = '10px';
stats.dom.style.zIndex = '1001'; // above gradient overlay
document.body.appendChild(stats.dom);

// Ground plane
const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
scene.add(ground);

// Grass setup
const grassGeometry = new THREE.PlaneGeometry(
  bladeWidth,
  bladeHeight,
  1,
  bladeSegments
);
// Taper the top vertices
const vertices = grassGeometry.attributes.position.array;
for (let i = 0; i < vertices.length; i += 3) {
  const y = vertices[i + 1];
  if (y > bladeHeight / 2 - 0.001) {
    vertices[i] *= taperFactor;
  }
}
grassGeometry.attributes.position.needsUpdate = true;
grassGeometry.translate(0, bladeHeight / 2, 0);

const uniforms = {
  time: { value: 0.0 },
  turbulenceAmplitude: { value: initialUniforms.turbulenceAmplitude },
  turbulenceFrequency: { value: initialUniforms.turbulenceFrequency },
  damping: { value: initialUniforms.damping },
  windStrength: { value: initialUniforms.windStrength },
  planeSize: { value: planeSize },
  windTex: { value: null },
  // Glow
  glowThreshold: { value: initialUniforms.glowThreshold },
  glowBoost: { value: initialUniforms.glowBoost },
};

// Shaders are now provided by ./shaders.js

const grassMaterial = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  side: THREE.DoubleSide,
});

const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
scene.add(grass);

// Position instances
const dummy = new THREE.Object3D();
for (let i = 0; i < grassCount; i++) {
  dummy.position.set(
    Math.random() * planeSize - planeSize / 2,
    0,
    Math.random() * planeSize - planeSize / 2
  );
  dummy.rotation.y = Math.random() * Math.PI * 2;
  dummy.updateMatrix();
  grass.setMatrixAt(i, dummy.matrix);
}
grass.instanceMatrix.needsUpdate = true;

// Wind field: ping-pong FBO updated each frame
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const windField = new WindField(renderer, initialUniforms.fieldResolution, {
  decay: initialUniforms.trailDecay,
  diffusion: initialUniforms.diffusion,
  advection: initialUniforms.advection,
  injectionRadius: initialUniforms.injectionRadius,
  injectionStrength: initialUniforms.injectionStrength,
});
uniforms.windTex.value = windField.texture;

let currentGroundPoint = null; // THREE.Vector3 or null
let lastGroundPoint = null;

window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug panel moved to ./debugPanel.js
const gui = initDebugPanel(uniforms, windField, initialUniforms);

// Animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  stats.begin();
  // Time and dt
  const t = currentTime * 0.001;
  const dt = Math.max(0.001, t - (uniforms.time.value || 0));
  uniforms.time.value = t;

  // Raycast ground at current mouse
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(ground);
  lastGroundPoint = currentGroundPoint;
  currentGroundPoint =
    intersects.length > 0 ? intersects[0].point.clone() : null;

  // Build injection params
  let mouseUv = null;
  let dir = new THREE.Vector2(0, 0);
  if (currentGroundPoint && lastGroundPoint) {
    // Map world XZ to UV 0..1
    mouseUv = new THREE.Vector2(
      currentGroundPoint.x / planeSize + 0.5,
      currentGroundPoint.z / planeSize + 0.5
    );
    const dx = currentGroundPoint.x - lastGroundPoint.x;
    const dz = currentGroundPoint.z - lastGroundPoint.z;
    dir.set(dx, dz);
  }

  // Update wind field
  windField.update(mouseUv, dir, dt);
  uniforms.windTex.value = windField.texture;

  renderer.render(scene, camera);
  stats.end();
}
animate(performance.now());
