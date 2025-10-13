import * as THREE from 'three';
import GUI from 'lil-gui';
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  mousePos: { value: new THREE.Vector3(9999, 0, 9999) },
  mouseDir: { value: new THREE.Vector2(0, 0) },
  radius: { value: initialUniforms.radius },
  strength: { value: initialUniforms.strength },
  time: { value: 0.0 },
  turbulenceAmplitude: { value: initialUniforms.turbulenceAmplitude },
  turbulenceFrequency: { value: initialUniforms.turbulenceFrequency },
  damping: { value: initialUniforms.damping },
  trailStrength: { value: initialUniforms.trailStrength },
  trailDecay: { value: initialUniforms.trailDecay },
};

const vertexShader = `
  uniform vec3 mousePos;
  uniform vec2 mouseDir;
  uniform float radius;
  uniform float strength;
  uniform float time;
  uniform float turbulenceAmplitude;
  uniform float turbulenceFrequency;
  uniform float damping;
  uniform float trailStrength;
  uniform float trailDecay;
  varying float vHeight;
  varying float vRandomSeed;
  void main() {
    vec3 basePos = instanceMatrix[3].xyz;
    vec3 pos = position;
    vec2 baseXZ = basePos.xz;
    vec2 mouseXZ = mousePos.xz;
    float dist = distance(baseXZ, mouseXZ);
    float heightFactor = pos.y / 1.0;
    vHeight = heightFactor;

    // Generate pseudo-random seed based on base position
    float randomSeed = fract(sin(dot(baseXZ, vec2(12.9898, 78.233))) * 43758.5453);
    vRandomSeed = randomSeed;

    // Calculate damping multiplier (2x inside interaction zone)
    float dampingFactor = damping;
    if (dist < radius) {
      dampingFactor *= 2.0;
    }

    // Random bending direction using randomSeed
    float randomAngle = randomSeed * 2.0 * 3.14159265359;
    vec2 bendDir = vec2(cos(randomAngle), sin(randomAngle));
    float bendAmount = dampingFactor * heightFactor;

    // Mouse trail effect
    vec2 trailBendDir = vec2(0.0, 0.0);
    float trailBendAmount = 0.0;
    if (dist < radius && length(mouseDir) > 0.0) {
      float factor = (1.0 - dist / radius) * trailStrength * heightFactor;
      trailBendDir = normalize(mouseDir);
      trailBendAmount = factor;
    }

    // Apply bending
    pos.x += bendDir.x * bendAmount;
    pos.z += bendDir.y * bendAmount;

    // Turbulence
    float turbulence = sin(basePos.x * turbulenceFrequency + time) *
                       sin(basePos.z * turbulenceFrequency + time) *
                       turbulenceAmplitude * heightFactor;
    pos.x += turbulence;
    pos.z += turbulence;

    // Compute world position
    vec4 worldPos = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * worldPos;
  }
`;

const fragmentShader = `
  varying float vHeight;
  varying float vRandomSeed;
  void main() {
    vec3 bottomColor = vec3(0.0, 0.0, 0.0); // Black base
    float grayValue = vRandomSeed * 0.1;     // Randomness in brightness
    vec3 topColor = vec3(grayValue, grayValue, grayValue); // Random grayscale
    vec3 baseColor = mix(bottomColor, topColor + 0.1, vHeight);

    gl_FragColor = vec4(baseColor, 1.0);
  }
`;

const grassMaterial = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  side: THREE.DoubleSide,
});

const grass = new THREE.InstancedMesh(
  grassGeometry,
  grassMaterial,
  grassCount
);
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

// Mouse interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let lastMousePos = new THREE.Vector3(9999, 0, 9999);
let trailEffect = new THREE.Vector2(0, 0);

window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(ground);
  if (intersects.length > 0) {
    uniforms.mousePos.value.copy(intersects[0].point);
  } else {
    uniforms.mousePos.value.set(9999, 0, 9999);
  }
});

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug panel
const gui = new GUI();
gui.add(uniforms.radius, 'value', 1.0, 10.0, 0.1).name('Trail Radius');
gui.add(uniforms.strength, 'value', 0.0, 5.0, 0.1).name('Default Bend Strength');
gui.add(uniforms.trailStrength, 'value', 0.0, 2.0, 0.1).name('Trail Strength');
gui.add(uniforms.trailDecay, 'value', 0.0, 1.0, 0.01).name('Trail Decay');
gui.add(uniforms.turbulenceAmplitude, 'value', 0.0, 2.0, 0.1).name('Turbulence Amplitude');
gui.add(uniforms.turbulenceFrequency, 'value', 0.0, 5.0, 0.1).name('Turbulence Frequency');
gui.add(uniforms.damping, 'value', 0.0, 2.0, 0.01).name('Default Bend Factor');

// Animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  stats.begin();

  // Update mouse direction for trail effect
  const currentMousePos = uniforms.mousePos.value;
  if (currentMousePos.x < 9999 && lastMousePos.x < 9999) {
    const mouseDelta = new THREE.Vector2(
      currentMousePos.x - lastMousePos.x,
      currentMousePos.z - lastMousePos.z
    );
    trailEffect.lerp(mouseDelta, 0.1); // Smooth the direction
    uniforms.mouseDir.value.copy(trailEffect);
  } else {
    trailEffect.set(0, 0);
    uniforms.mouseDir.value.set(0, 0);
  }
  lastMousePos.copy(currentMousePos);

  // Apply trail decay
  trailEffect.multiplyScalar(uniforms.trailDecay.value);

  // Update turbulence
  uniforms.time.value = currentTime * 0.001;

  renderer.render(scene, camera);
  stats.end();
}
animate(performance.now());

