import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@latest/examples/jsm/loaders/GLTFLoader.js';

// Data schema describing models and their instances.
// Keys follow the requested format: objects -> model 1, model 2, ...
// rotation is in degrees [x, y, z]. location and scale are in world units.

export const objects = {
  'model 1': {
    model_location: 'assets/objects/stone1/stone1.glb',
    normal_map_location: 'assets/objects/stone1/stone1_normal.webp',
    instances: {
      instance1: {
        location: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [10, 10, 10],
      },
    },
    shadow_map_location: null,
  },

  'model 2': {
    model_location: 'assets/objects/stone.glb',
    normal_map_location: null,
    instances: {
      instance1: {
        location: [10, 1, -10],
        rotation: [0, 45, 0],
        scale: [15, 15, 15],
      },
      instance2: {
        location: [-12, 1, 8],
        rotation: [0, -20, 0],
        scale: [12, 12, 12],
      },
    },
    shadow_map_location: null,
  },
};

// Custom shader for imported objects: grey base + simple top-down light
// Now supports optional normal map with on-the-fly TBN from derivatives.
const objectsVertexShader = `
  varying vec3 vViewPos;
  varying vec3 vViewNormal;
  varying vec2 vUv;
  void main() {
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = viewPos.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const objectsFragmentShader = `
  #ifdef GL_OES_standard_derivatives
  #extension GL_OES_standard_derivatives : enable
  #endif
  precision mediump float;
  varying vec3 vViewPos;
  varying vec3 vViewNormal;
  varying vec2 vUv;
  uniform vec3 baseColor;
  uniform float ambient;      // 0..1
  // Pseudo point light from above (shader-only)
  uniform vec3 lightPos;      // world position of light
  uniform vec3 lightColor;    // light RGB
  uniform float lightIntensity;// overall intensity
  uniform float lightAtten;   // attenuation coefficient (~ small value)

  uniform sampler2D normalMap;
  uniform vec2 normalScale;   // scale for XY perturbation
  uniform float hasNormalMap; // 0 or 1

  vec3 perturbNormal(vec3 N, vec3 viewPos, vec2 uv) {
    if (hasNormalMap < 0.5) return N;
    // Scale-invariant TBN using view-space derivatives (three.js technique)
    vec3 q0 = dFdx(viewPos);
    vec3 q1 = dFdy(viewPos);
    vec2 st0 = dFdx(uv);
    vec2 st1 = dFdy(uv);
    vec3 S = normalize(q0 * st1.t - q1 * st0.t);
    vec3 T = normalize(-q0 * st1.s + q1 * st0.s);
    vec3 Nn = normalize(N);
    mat3 tsn = mat3(S, T, Nn);

    vec3 mapN = texture2D(normalMap, uv).xyz * 2.0 - 1.0;
    mapN.xy *= normalScale;
    return normalize(tsn * mapN);
  }

  void main() {
    // Base normal in view space
    vec3 N = normalize(vViewNormal);
    // Apply normal map if present
    N = perturbNormal(N, vViewPos, vUv);

    // Ambient term (cheap)
    vec3 base = baseColor * ambient;

    // Fast Lambert diffuse with distance attenuation in view space
    vec3 lightPosView = (viewMatrix * vec4(lightPos, 1.0)).xyz;
    vec3 L = lightPosView - vViewPos;
    float d2 = max(dot(L, L), 1e-6);
    float invLen = inversesqrt(d2);
    vec3 ldir = L * invLen; // normalized light dir
    float ndotl = max(dot(N, ldir), 0.0);
    float atten = 1.0 / (1.0 + lightAtten * d2);
    vec3 diffuse = baseColor * lightColor * (lightIntensity * ndotl * atten);

    // Combine ambient + diffuse
    vec3 color = base + diffuse;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Base shader material used for all imported objects
export function createObjectsMaterial() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: objectsVertexShader,
    fragmentShader: objectsFragmentShader,
    uniforms: {
      baseColor: { value: new THREE.Color(0xbbbbbb) },
      ambient: { value: 0.1 },
      lightPos: { value: new THREE.Vector3(0, 30, -20) },
      lightColor: { value: new THREE.Color(0xffffff) },
      lightIntensity: { value: 10.0 },
      lightAtten: { value: 0.015 },
      normalMap: { value: null },
      normalScale: { value: new THREE.Vector2(1, 1) },
      hasNormalMap: { value: 0.0 },
    },
    side: THREE.FrontSide,
  });
  // Enable derivatives for dFdx/dFdy on WebGL1
  mat.extensions = { derivatives: true };
  return mat;
}

// Track all imported roots for conveyor updates
const importedRoots = [];
const importedBaseZ = new WeakMap();

export function updateImportedObjectConveyor(scrollOffsetNormZ, extentZ) {
  if (!isFinite(extentZ) || extentZ <= 1e-5) return;
  for (const root of importedRoots) {
    const baseZ = importedBaseZ.get(root);
    if (baseZ === undefined) continue;
    root.position.z = baseZ - scrollOffsetNormZ * extentZ;
  }
}

export async function loadObjectsFromData(scene, data) {
  if (!data || !data.objects) return [];
  const gltfLoader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();

  const modelEntries = Object.entries(data.objects);
  const created = [];

  for (const [, cfg] of modelEntries) {
    const url = cfg.model_location;
    if (!url) continue;

    // Prepare shader material for this model
    let material = createObjectsMaterial();
    if (cfg.normal_map_location) {
      try {
        const nm = await new Promise((res, rej) =>
          texLoader.load(cfg.normal_map_location, res, undefined, rej)
        );
        nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
        // Ensure correct sampling for normal maps
        try {
          if ('colorSpace' in nm) nm.colorSpace = THREE.NoColorSpace;
        } catch {}
        try {
          if ('encoding' in nm) nm.encoding = THREE.LinearEncoding;
        } catch {}
        nm.flipY = false;
        // Clone material so each model can have its own normal map
        material = material.clone();
        material.uniforms.normalMap.value = nm;
        material.uniforms.hasNormalMap.value = 1.0;
        if (
          material.uniforms.normalScale &&
          material.uniforms.normalScale.value
        ) {
          // Per-model override via data normal_scale; default assumes -Y (DirectX) maps
          const ns = Array.isArray(cfg.normal_scale)
            ? cfg.normal_scale
            : [1, -1];
          material.uniforms.normalScale.value.set(ns[0] || 1, ns[1] || -1);
        }
        material.needsUpdate = true;
      } catch (e) {
        console.warn('Failed loading normal map', cfg.normal_map_location, e);
      }
    }

    // Load GLB
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(url, resolve, undefined, reject);
    }).catch((e) => {
      console.warn('Failed to load GLTF', url, e);
      return null;
    });
    if (!gltf) continue;

    // Assign material to all meshes in the source
    gltf.scene.traverse((child) => {
      if (child.isMesh) child.material = material;
    });

    const instances = Array.isArray(cfg.instances)
      ? cfg.instances
      : cfg.instances && typeof cfg.instances === 'object'
      ? Object.values(cfg.instances)
      : [];
    if (instances.length === 0) {
      // If no explicit instances provided, create one default at origin of provided transform
      const root = gltf.scene.clone(true);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.scale.set(1, 1, 1);
      scene.add(root);
      importedRoots.push(root);
      importedBaseZ.set(root, root.position.z);
      created.push(root);
      continue;
    }

    // Create one clone per instance
    for (const inst of instances) {
      const root = gltf.scene.clone(true);
      // location
      const loc = Array.isArray(inst.location) ? inst.location : [0, 0, 0];
      root.position.set(loc[0] || 0, loc[1] || 0, loc[2] || 0);
      // rotation in degrees -> radians
      const rotDeg = Array.isArray(inst.rotation) ? inst.rotation : [0, 0, 0];
      const toRad = (d) => (typeof d === 'number' ? (d * Math.PI) / 180 : 0);
      root.rotation.set(toRad(rotDeg[0]), toRad(rotDeg[1]), toRad(rotDeg[2]));
      // scale
      const scl = Array.isArray(inst.scale) ? inst.scale : [1, 1, 1];
      root.scale.set(scl[0] || 1, scl[1] || 1, scl[2] || 1);

      scene.add(root);
      importedRoots.push(root);
      importedBaseZ.set(root, root.position.z);
      created.push(root);
    }
  }

  return created;
}
