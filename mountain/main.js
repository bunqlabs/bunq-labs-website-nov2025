import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import Lenis from 'lenis';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 0, 0.65);
scene.add(camera);

// Light plane
const screenWidth = 0.192;
const screenHeight = 0.108;
const screenLightIntensity = 1000;
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(screenWidth, screenHeight),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
scene.add(screen);

// Apply looping video as the screen material color (map)
const video = document.createElement('video');
video.src = './showreel/showreel.mp4';
video.muted = true;
video.loop = true;
video.playsInline = true;
video.preload = 'auto';
video.autoplay = true;
video.addEventListener('canplay', () => video.play().catch(() => {}), {
  once: true,
});
const resumeVideo = () => video.play().catch(() => {});
window.addEventListener('click', resumeVideo, { once: true });
window.addEventListener('touchstart', resumeVideo, { once: true });

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace; // video is color data
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.generateMipmaps = false;

screen.material = new THREE.MeshBasicMaterial({
  map: videoTexture,
  toneMapped: false,
});
const screenLight = new THREE.RectAreaLight(
  0xffffff,
  screenLightIntensity,
  screenWidth,
  screenHeight * 2
);
screenLight.rotation.y = Math.PI;
screen.add(screenLight);

//   const dir = new THREE.DirectionalLight(0xffffff, 1.0);
//   dir.position.set(5, 10, 5);
//   dir.castShadow = true;
//   dir.shadow.mapSize.set(2048, 2048);
//   scene.add(dir);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// Debug GUI to toggle orbit controls
const gui = new GUI();
gui.title('Debug');
gui.add(controls, 'enabled').name('Orbit Controls');

// Postprocessing: UnrealBloomPass
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.2, // strength
  5, // radius
  0.01 // threshold
);
composer.addPass(bloomPass);

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
// Load mountain texture and use it for normal + displacement
const mountainTex = texLoader.load('./mountain_texture.webp');
mountainTex.colorSpace = THREE.LinearSRGBColorSpace; // non-color data
mountainTex.flipY = false; // match glTF UV convention

loader.load(
  // Model resides next to this HTML
  './mountain_export.glb',
  (gltf) => {
    const root = gltf.scene || gltf.scenes[0];
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        // Apply a MeshStandardMaterial to all imported meshes
        const baseColor =
          obj.material && obj.material.color ? obj.material.color : 0x000000;
        obj.material = new THREE.MeshStandardMaterial({
          color: 0x222222,
          roughness: 0.5,
          metalness: 0.85,
          metalnessMap: mountainTex,
          bumpMap: mountainTex,
          bumpScale: -10,
        });
      }
    });
    scene.add(root);
  },
  (evt) => {
    if (evt.total) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      console.log(`Loading model: ${pct}%`);
    }
  },
  (err) => {
    console.error('Failed to load GLB:', err);
    const note = document.createElement('div');
    note.className = 'ui badge error';
    note.textContent =
      'Could not load GLB. If opened from file://, run a local server.';
    document.body.appendChild(note);
  }
);

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
window.addEventListener('resize', onResize);

// Average video color sampling via requestVideoFrameCallback (larger sample for stability)
const sampleCanvas = document.createElement('canvas');
const sampleW = 16; // wider sampling to reduce rapid color changes
const sampleH = 9;
sampleCanvas.width = sampleW;
sampleCanvas.height = sampleH;
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
sampleCtx.imageSmoothingEnabled = true;

function updateLightFromVideo() {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    return;
  sampleCtx.clearRect(0, 0, sampleW, sampleH);
  sampleCtx.drawImage(video, 0, 0, sampleW, sampleH);
  const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  let r = 0,
    g = 0,
    b = 0;
  const count = sampleW * sampleH;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  r = r / (255 * count);
  g = g / (255 * count);
  b = b / (255 * count);
  const c = new THREE.Color(r, g, b);
  c.convertSRGBToLinear();
  screenLight.color.copy(c);
}

function startVideoSampling() {
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = () => {
      updateLightFromVideo();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    // Fallback ~30fps
    setInterval(updateLightFromVideo, 33);
  }
}

video.addEventListener('play', startVideoSampling, { once: true });

// Mild snowfall particles
const snowCount = 1000;
const snowArea = { x: 0.5, y: 0.5, z: 0.5 };
const snowGeo = new THREE.BufferGeometry();
const snowPositions = new Float32Array(snowCount * 3);
const snowSpeeds = new Float32Array(snowCount);
for (let i = 0; i < snowCount; i++) {
  snowPositions[i * 3 + 0] = (Math.random() - 0.5) * snowArea.x;
  snowPositions[i * 3 + 1] = Math.random() * snowArea.y; // start above
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * snowArea.z;
  snowSpeeds[i] = 0.05 + Math.random() * 0.15; // downward speed
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
snowGeo.setAttribute('aSpeed', new THREE.BufferAttribute(snowSpeeds, 1));
const snowMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.004,
  transparent: true,
  opacity: 0.03,
  depthWrite: false,
});
const snow = new THREE.Points(snowGeo, snowMat);
scene.add(snow);

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  controls.update();
  // Light color updates are driven by requestVideoFrameCallback
  // update snowfall
  const pos = snowGeo.getAttribute('position');
  const spd = snowGeo.getAttribute('aSpeed');
  const t = performance.now() * 0.001;
  for (let i = 0; i < snowCount; i++) {
    let x = pos.getX(i) + Math.sin(i * 12.9898 + t * 0.5) * 0.0005;
    let y = pos.getY(i) - spd.getX(i) * dt * 0.2;
    let z = pos.getZ(i) + Math.cos(i * 78.233 + t * 0.3) * 0.0005;
    if (y < -snowArea.y * 0.5) {
      y = snowArea.y * 0.5;
    }
    // keep inside bounds
    if (x < -snowArea.x * 0.5) x = -snowArea.x * 0.5;
    if (x > snowArea.x * 0.5) x = snowArea.x * 0.5;
    if (z < -snowArea.z * 0.5) z = -snowArea.z * 0.5;
    if (z > snowArea.z * 0.5) z = snowArea.z * 0.5;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;

  composer.render();
  requestAnimationFrame(animate);
}
animate();
