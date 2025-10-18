import * as THREE from 'three';

let butterfly = null;
const wingSize = 0.5;
const butterflyLocations = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(5, 2, 5),
  new THREE.Vector3(-3, 3, 10),
  new THREE.Vector3(2, 1, -5),
];
const butterflyIntervals = [2, 3, 1.5, 2];
const trajectory = {
  positions: [],
  tangents: [],
  segmentStarts: [],
  totalDuration: 0,
};
let currentTimeInCycle = 0;
const trajectoryResolution = 50;

function precomputeTrajectory() {
  trajectory.segmentStarts = [0];
  trajectory.totalDuration = butterflyIntervals.reduce(
    (sum, dur) => sum + dur,
    0
  );
  let totalPoints = 0;

  for (let i = 0; i < butterflyLocations.length - 1; i++) {
    const start = butterflyLocations[i];
    const end = butterflyLocations[i + 1];
    const curve = new THREE.CatmullRomCurve3(
      [start, end],
      false,
      'centripetal',
      0.5
    );
    const points = curve.getPoints(trajectoryResolution);
    const tangents = [];
    for (let j = 0; j <= trajectoryResolution; j++) {
      tangents.push(curve.getTangent(j / trajectoryResolution).normalize());
    }
    trajectory.positions.push(...points);
    trajectory.tangents.push(...tangents);
    totalPoints += trajectoryResolution + 1;
    trajectory.segmentStarts.push(totalPoints);
  }
  const lastToFirst = new THREE.CatmullRomCurve3(
    [butterflyLocations[butterflyLocations.length - 1], butterflyLocations[0]],
    false,
    'centripetal',
    0.5
  );
  const closePoints = lastToFirst.getPoints(trajectoryResolution);
  const closeTangents = [];
  for (let j = 0; j <= trajectoryResolution; j++) {
    closeTangents.push(
      lastToFirst.getTangent(j / trajectoryResolution).normalize()
    );
  }
  trajectory.positions.push(...closePoints);
  trajectory.tangents.push(...closeTangents);
  trajectory.segmentStarts.push(totalPoints + trajectoryResolution + 1);
}

function createButterfly(scene) {
  if (butterfly) {
    scene.remove(butterfly.group);
    butterfly = null;
  }
  const butterflyGroup = new THREE.Group();
  const wingGeometry = new THREE.PlaneGeometry(wingSize, wingSize, 1, 1);
  const textureLoader = new THREE.TextureLoader();
  const wingTexture = textureLoader.load(
    'https://threejs.org/examples/textures/uv_grid_opengl.jpg'
  );
  wingTexture.flipY = false;

  const wingMaterial = new THREE.MeshBasicMaterial({
    map: wingTexture,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
  leftWing.position.set(wingSize * 0.25, 0, 0);
  leftWing.rotation.y = Math.PI / 4;
  butterflyGroup.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
  rightWing.position.set(-wingSize * 0.25, 0, 0);
  rightWing.rotation.y = -Math.PI / 4;
  butterflyGroup.add(rightWing);

  const bodyGeometry = new THREE.BoxGeometry(
    wingSize * 0.1,
    wingSize * 0.2,
    wingSize * 0.5
  );
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  butterflyGroup.add(body);

  butterflyGroup.position.copy(butterflyLocations[0]);
  scene.add(butterflyGroup);
  butterfly = {
    group: butterflyGroup,
    leftWing,
    rightWing,
    baseRotation: new THREE.Euler(0, 0, 0),
  };

  precomputeTrajectory();
}

function updateButterfly(
  dt,
  t,
  windField,
  scrollOffsetNormZ,
  planeSize,
  groundScale
) {
  if (!butterfly) return;

  const flapSpeed = 5;
  let flapAmplitude = Math.PI / 6;
  currentTimeInCycle = (currentTimeInCycle + dt) % trajectory.totalDuration;
  let segmentIndex = 0;
  let accumulatedTime = 0;
  for (let i = 0; i < butterflyIntervals.length; i++) {
    if (currentTimeInCycle < accumulatedTime + butterflyIntervals[i]) {
      segmentIndex = i;
      break;
    }
    accumulatedTime += butterflyIntervals[i];
  }
  const segmentProgress =
    (currentTimeInCycle - accumulatedTime) / butterflyIntervals[segmentIndex];
  let flapSpeedScale = 1;
  if (segmentProgress < 0.2 || segmentProgress > 0.8) {
    flapSpeedScale = 2;
    flapAmplitude = Math.PI / 4;
  }
  const flapAngle = Math.sin(t * flapSpeed * flapSpeedScale) * flapAmplitude;
  butterfly.leftWing.rotation.z = flapAngle;
  butterfly.rightWing.rotation.z = -flapAngle;

  const startIdx = trajectory.segmentStarts[segmentIndex];
  const pointIdx = Math.floor(segmentProgress * trajectoryResolution);
  const idx = Math.min(startIdx + pointIdx, trajectory.positions.length - 1);
  butterfly.group.position.copy(trajectory.positions[idx]);
  const tangent = trajectory.tangents[idx];
  butterfly.group.lookAt(butterfly.group.position.clone().add(tangent));

  const extentZ = planeSize * groundScale.z;
  butterfly.group.position.z -=
    (scrollOffsetNormZ - (butterfly.group.userData.lastScrollOffset || 0)) *
    extentZ;
  butterfly.group.userData.lastScrollOffset = scrollOffsetNormZ;

  const groundPos = butterfly.group.position.clone();
  groundPos.y = 0;
  const u = groundPos.x / (planeSize * groundScale.x) + 0.5;
  const v =
    (groundPos.z / (planeSize * groundScale.z) + 0.5 + scrollOffsetNormZ) % 1;
  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    const windPixel = new THREE.Color();
    windField.renderer.readRenderTargetPixels(
      windField.texture,
      u * windField.resolution,
      v * windField.resolution,
      1,
      1,
      windPixel
    );
    const windForce = new THREE.Vector2(
      windPixel.r * 2 - 1,
      windPixel.g * 2 - 1
    ).multiplyScalar(0.05 * dt);
    butterfly.group.position.x += windForce.x;
    butterfly.group.position.z += windForce.y;
  }
}

function isButterflyEnabled() {
  return !!butterfly;
}

function setButterflyEnabled(enabled, scene) {
  if (enabled && !butterfly) {
    createButterfly(scene);
  } else if (!enabled && butterfly) {
    scene.remove(butterfly.group);
    butterfly = null;
  }
}

export {
  createButterfly,
  updateButterfly,
  isButterflyEnabled,
  setButterflyEnabled,
};
