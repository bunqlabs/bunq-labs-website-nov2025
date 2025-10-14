import * as THREE from 'three';
import Lenis from 'lenis';
import { OrbitControls } from 'https://unpkg.com/three@latest/examples/jsm/controls/OrbitControls.js';
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
const container = document.getElementById('webgl');
container.appendChild(renderer.domElement);
// Prevent page scrolling/zooming from intercepting touch interactions
renderer.domElement.style.touchAction = 'none';

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.target.set(0, 0, 0);
// Disabled by default; enable via debug panel toggle
controls.enabled = false;
controls.update();

// Toggle API for orbit controls (used by debug panel)
function setOrbitControlsEnabled(enabled) {
  controls.enabled = !!enabled;
}
function getOrbitControlsEnabled() {
  return !!controls.enabled;
}

// Expose scroll speed controls for debug panel
function setScrollSpeed(v) {
  SCROLL_NORM_PER_PIXEL = v;
}
function getScrollSpeed() {
  return SCROLL_NORM_PER_PIXEL;
}

// Stats.js setup
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
stats.dom.style.position = 'absolute';
stats.dom.style.left = '10px';
stats.dom.style.top = '10px';
stats.dom.style.zIndex = '1001'; // above gradient overlay
container.appendChild(stats.dom);

// Lenis smooth scroll
const lenis = new Lenis({
  smoothWheel: true,
  smoothTouch: true,
});
// Initialize lastScrollY to current scroll for consistent delta
try {
  lastScrollY = lenis?.scroll ?? window.scrollY;
} catch {}

// Ground plane
const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
scene.add(ground);

// Keep ground plane width matched to viewport aspect
function updateGroundToViewport() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = vh > 0 ? vw / vh : 1;
  // Scale X relative to Z to match aspect; Y remains 1
  ground.scale.set(aspect, 1, 1);
}
// Initialize ground size based on current viewport
updateGroundToViewport();

// Grass base positions normalized to [-0.5, 0.5] in X/Z.
// We scale these to the ground's current world extents so grass adapts to viewport.
const grassBasePositions = new Array(grassCount);

// Instancing helper reused for placement
const dummy = new THREE.Object3D();

// Scroll-driven conveyor effect state (declare before first use)
let scrollOffsetNormZ = 0;
let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
let SCROLL_NORM_PER_PIXEL = 0.0003; // 1000px scroll == one full plane length

function applyGrassPositions() {
  const extentX = planeSize * ground.scale.x;
  const extentZ = planeSize * ground.scale.z;
  for (let i = 0; i < grassCount; i++) {
    const base = grassBasePositions[i];
    const x = base.x * extentX;
    let zNorm = base.z - scrollOffsetNormZ; // normalized conveyor offset
    zNorm = ((((zNorm + 0.5) % 1) + 1) % 1) - 0.5; // wrap to [-0.5, 0.5]
    const z = zNorm * extentZ;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = base.rot;
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
}

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

// Stable per-instance random seed attribute for bending/color
const randomSeeds = new Float32Array(grassCount);
for (let i = 0; i < grassCount; i++) randomSeeds[i] = Math.random();
grassGeometry.setAttribute(
  'aRandomSeed',
  new THREE.InstancedBufferAttribute(randomSeeds, 1)
);

const uniforms = {
  time: { value: 0.0 },
  turbulenceAmplitude: { value: initialUniforms.turbulenceAmplitude },
  turbulenceFrequency: { value: initialUniforms.turbulenceFrequency },
  damping: { value: initialUniforms.damping },
  windStrength: { value: initialUniforms.windStrength },
  // Dynamic ground extents for UV mapping in shader (x,z)
  planeExtent: { value: new THREE.Vector2(planeSize, planeSize) },
  // Scroll conveyor offset in world Z units for turbulence coherence
  scrollOffsetZ: { value: 0.0 },
  windTex: { value: null },
  // Glow
  glowThreshold: { value: initialUniforms.glowThreshold },
  glowBoost: { value: initialUniforms.glowBoost },
};

// Keep shader plane extent uniform in sync with ground scaling
function updatePlaneExtentUniform() {
  uniforms.planeExtent.value.set(
    planeSize * ground.scale.x,
    planeSize * ground.scale.z
  );
}
// Initialize plane extent uniform once uniforms exist
updatePlaneExtentUniform();

// Keep turbulence scroll offset uniform in sync (world units)
function updateScrollUniform() {
  const extentZ = planeSize * ground.scale.z;
  uniforms.scrollOffsetZ.value = scrollOffsetNormZ * extentZ;
}
updateScrollUniform();

// Shaders are now provided by ./shaders.js

const grassMaterial = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  side: THREE.DoubleSide,
});

const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
scene.add(grass);

// Position instances based on ground extents using normalized base positions
for (let i = 0; i < grassCount; i++) {
  grassBasePositions[i] = {
    x: Math.random() - 0.5,
    z: Math.random() - 0.5,
    rot: Math.random() * Math.PI * 2,
  };
}
applyGrassPositions();

// Bend-on-scroll: tilt media when approaching viewport bottom, flat at center
let BEND_MAX_DEG = -8; // default max bend in degrees
function updateBendElements() {
  const centerY = window.innerHeight / 2;
  const els = document.querySelectorAll('[data-bend-on-scroll]');
  els.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const elCenter = rect.top + rect.height / 2;
    const t = (elCenter - centerY) / centerY; // -1 top, 0 center, 1 bottom
    const onlyBottom = Math.max(0, Math.min(1, t));
    const maxDeg = isNaN(parseFloat(el.dataset.bendMax))
      ? BEND_MAX_DEG
      : parseFloat(el.dataset.bendMax);
    const angle = -onlyBottom * maxDeg; // slight bend at bottom
    el.style.transform = `perspective(1000px) rotateX(${angle}deg)`;
  });
}

// Debug panel API for bend angle
function getBendMax() {
  return BEND_MAX_DEG;
}
function setBendMax(v) {
  BEND_MAX_DEG = v;
  updateBendElements();
}
// Initialize bend once on load
updateBendElements();

// Lenis smooth scroll events drive the conveyor
lenis.on('scroll', (e) => {
  const currentY = e.scroll;
  const dy = currentY - lastScrollY;
  lastScrollY = currentY;
  scrollOffsetNormZ += dy * SCROLL_NORM_PER_PIXEL;
  updateScrollUniform();
  applyGrassPositions();
  updateBendElements();
});

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

// Pointer events: unify mouse and touch, capture drags/swipes on mobile
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let pointerDown = false;

function updateFromPointer(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDown = true;
  updateFromPointer(e);
  lastGroundPoint = null; // reset delta at gesture start
  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch {}
  if (e.pointerType === 'touch') e.preventDefault();
});

renderer.domElement.addEventListener('pointermove', (e) => {
  // Always track position; inject only when allowed (see animate loop)
  updateFromPointer(e);
  if (e.pointerType === 'touch' && pointerDown) e.preventDefault();
});

renderer.domElement.addEventListener('pointerup', (e) => {
  pointerDown = false;
  currentGroundPoint = null;
  lastGroundPoint = null;
  try {
    renderer.domElement.releasePointerCapture(e.pointerId);
  } catch {}
  if (e.pointerType === 'touch') e.preventDefault();
});

renderer.domElement.addEventListener('pointercancel', (e) => {
  pointerDown = false;
  currentGroundPoint = null;
  lastGroundPoint = null;
  if (e.pointerType === 'touch') e.preventDefault();
});

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateGroundToViewport();
  updatePlaneExtentUniform();
  updateScrollUniform();
  applyGrassPositions();
  updateBendElements();
});

// Debug panel moved to ./debugPanel.js
const gui = initDebugPanel(uniforms, windField, initialUniforms, {
  getOrbitEnabled: getOrbitControlsEnabled,
  setOrbitEnabled: setOrbitControlsEnabled,
  getScrollSpeed: getScrollSpeed,
  setScrollSpeed: setScrollSpeed,
  getBendMax: getBendMax,
  setBendMax: setBendMax,
});

// Animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  // Advance Lenis smooth scroll
  try {
    lenis.raf(currentTime);
  } catch {}
  stats.begin();
  // Time and dt
  const t = currentTime * 0.001;
  const dt = Math.max(0.001, t - (uniforms.time.value || 0));
  uniforms.time.value = t;

  // Raycast ground at current pointer
  // Desktop: active on hover/move; Mobile: active only while touching/dragging
  if (!isTouchDevice || pointerDown) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ground);
    lastGroundPoint = currentGroundPoint;
    currentGroundPoint =
      intersects.length > 0 ? intersects[0].point.clone() : null;
  } else {
    lastGroundPoint = null;
    currentGroundPoint = null;
  }

  // Build injection params
  let mouseUv = null;
  let dir = new THREE.Vector2(0, 0);
  if (currentGroundPoint && lastGroundPoint) {
    // Map world XZ to UV 0..1
    const extentX = planeSize * ground.scale.x;
    const extentZ = planeSize * ground.scale.z;
    const u = currentGroundPoint.x / extentX + 0.5;
    const v = currentGroundPoint.z / extentZ + 0.5;
    // Clamp to valid 0..1 so injection stays on the field
    mouseUv = new THREE.Vector2(
      Math.min(Math.max(u, 0), 1),
      Math.min(Math.max(v, 0), 1)
    );
    const dx = currentGroundPoint.x - lastGroundPoint.x;
    const dz = currentGroundPoint.z - lastGroundPoint.z;
    dir.set(dx, dz);
  }

  // Update wind field
  windField.update(mouseUv, dir, dt);
  uniforms.windTex.value = windField.texture;

  controls.update();
  renderer.render(scene, camera);
  stats.end();
}
animate(performance.now());
