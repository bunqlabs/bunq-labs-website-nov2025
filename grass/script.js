import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@latest/examples/jsm/controls/OrbitControls.js";
// Model loading and object material logic
import {
  loadObjectsFromData,
  updateImportedObjectConveyor,
  objects as objectsData,
} from "./objects.js";

import Stats from "https://unpkg.com/three@latest/examples/jsm/libs/stats.module.js";
import {
  planeSize,
  grassCount,
  bladeWidth,
  bladeHeight,
  bladeSegments,
  taperFactor,
  initialUniforms,
  cameraConfig,
} from "./config.js";
import { grassVertexShader, grassFragmentShader } from "./shaders.js";
import { initDebugPanel } from "./debugPanel.js";
import { WindField } from "./windField.js";

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
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
const container = document.getElementById("webgl");
container.appendChild(renderer.domElement);
// Prevent page scrolling/zooming from intercepting touch interactions
renderer.domElement.style.touchAction = "none";

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
  updateScrollState(window.scrollY || 0);
}
function getScrollSpeed() {
  return SCROLL_NORM_PER_PIXEL;
}

// Stats.js setup
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
stats.dom.style.position = "absolute";
stats.dom.style.left = "10px";
stats.dom.style.top = "10px";
stats.dom.style.zIndex = "1001"; // above gradient overlay
if (document.body) {
  document.body.appendChild(stats.dom);
} else {
  container.appendChild(stats.dom);
}

// Ground plane
const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
scene.add(ground);

// Load objects defined in objects.js and apply initial conveyor position
loadObjectsFromData(scene, { objects: objectsData })
  .then(() => {
    try {
      updateImportedObjectConveyor(
        scrollOffsetNormZ,
        planeSize * ground.scale.z
      );
    } catch {}
  })
  .catch(() => {});

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
let SCROLL_NORM_PER_PIXEL = 0.0005; // 1000px scroll == one full plane length

// Initialize conveyor offset from current page scroll so model/grass start aligned
// Only set the offset here; uniforms will be updated after they're created below
{
  const initialScroll = window.scrollY || 0;
  scrollOffsetNormZ = initialScroll * SCROLL_NORM_PER_PIXEL;
}

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
  "aRandomSeed",
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
  // Normalized scroll offset (1 = one full plane length)
  scrollOffsetNorm: { value: 0.0 },
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
  uniforms.scrollOffsetNorm.value = scrollOffsetNormZ;
}
updateScrollUniform();

// Conveyor update for imported model now lives in ./models.js

// Shaders are now provided by ./shaders.js

const grassMaterial = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: grassVertexShader,
  fragmentShader: grassFragmentShader,
  side: THREE.DoubleSide,
});

const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
// Disable frustum culling since shader scroll offsets blades beyond instance bounds
grass.frustumCulled = false;
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
  const els = document.querySelectorAll("[data-bend-on-scroll]");
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

function updateScrollState(currentY) {
  scrollOffsetNormZ = currentY * SCROLL_NORM_PER_PIXEL;
  updateScrollUniform();
  updateBendElements();
  updateImportedObjectConveyor(scrollOffsetNormZ, planeSize * ground.scale.z);
}

// Native scroll events drive the conveyor
window.addEventListener("scroll", () => {
  const currentY = window.scrollY || window.pageYOffset || 0;
  updateScrollState(currentY);
});

// Sync initial state post-initialization
updateScrollState(window.scrollY || 0);

// Wind field: ping-pong FBO updated each frame
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let isHovering = false; // only raycast/inject when cursor is over the canvas
const windField = new WindField(renderer, initialUniforms.fieldResolution, {
  decay: initialUniforms.trailDecay,
  diffusion: initialUniforms.diffusion,
  advection: initialUniforms.advection,
  injectionRadius: initialUniforms.injectionRadius,
  injectionStrength: initialUniforms.injectionStrength,
  injectionStrengthMax: initialUniforms.injectionStrengthMax,
});
uniforms.windTex.value = windField.texture;

// Pointer events (viewport-wide)

function updateFromPointer(e) {
  let cx = 0,
    cy = 0;
  if (e && e.touches && e.touches.length > 0) {
    cx = e.touches[0].clientX;
    cy = e.touches[0].clientY;
  } else if (e && e.changedTouches && e.changedTouches.length > 0) {
    cx = e.changedTouches[0].clientX;
    cy = e.changedTouches[0].clientY;
  } else if (e) {
    cx = e.clientX;
    cy = e.clientY;
  }
  mouse.x = (cx / window.innerWidth) * 2 - 1;
  mouse.y = -(cy / window.innerHeight) * 2 + 1;
}

// React while pointer is anywhere over the window (viewport-wide hover)
window.addEventListener(
  "pointermove",
  (e) => {
    updateFromPointer(e);
    isHovering = true;
  },
  { capture: true }
);
// When pointer leaves the window or tab loses focus, stop hovering
window.addEventListener("pointerout", (e) => {
  if (!e.relatedTarget) {
    isHovering = false;
    window.__lastGroundPoint = null;
  }
});
window.addEventListener("blur", () => {
  isHovering = false;
  window.__lastGroundPoint = null;
});

// Resize handler
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateGroundToViewport();
  updatePlaneExtentUniform();
  updateScrollUniform();
  updateBendElements();
  updateImportedObjectConveyor(scrollOffsetNormZ, planeSize * ground.scale.z);
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
  stats.begin();
  // Time and dt
  const t = currentTime * 0.001;
  const dt = Math.max(0.001, t - (uniforms.time.value || 0));
  uniforms.time.value = t;

  // Build injection params using precise ground-plane raycast, aligned with shader mapping
  const extentX = planeSize * ground.scale.x;
  const extentZ = planeSize * ground.scale.z;
  let mouseUv = null;
  const dir = new THREE.Vector2(0, 0);
  if (isHovering) {
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(ground, false);
    if (hit.length > 0) {
      const p = hit[0].point;
      // Map world XZ to stationary ground UV (no scroll compensation)
      const u = Math.min(Math.max(p.x / extentX + 0.5, 0), 1);
      const v = Math.min(Math.max(p.z / extentZ + 0.5, 0), 1);
      mouseUv = new THREE.Vector2(u, v);
      if (!window.__lastGroundPoint)
        window.__lastGroundPoint = new THREE.Vector3(p.x, p.y, p.z);
      const dx = p.x - window.__lastGroundPoint.x;
      const dz = p.z - window.__lastGroundPoint.z;
      dir.set(dx, dz);
      window.__lastGroundPoint.copy(p);
    } else {
      window.__lastGroundPoint = null;
    }
  } else {
    window.__lastGroundPoint = null;
  }
  // Update wind field
  windField.update(mouseUv, dir, dt);
  uniforms.windTex.value = windField.texture;

  controls.update();
  renderer.render(scene, camera);
  stats.end();
}
animate(performance.now());
