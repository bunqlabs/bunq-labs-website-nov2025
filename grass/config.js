// Tweakable configuration values for the grass scene

export const planeSize = 50;
export const grassCount = 200000;

export const bladeWidth = 0.4;
export const bladeHeight = 2;
export const bladeSegments = 1;
export const taperFactor = 0.1; // 0..1 (fraction of base width at tip)

// Initial uniform values exposed to the GUI
export const initialUniforms = {
  radius: 5.0,
  strength: 0.5,
  turbulenceAmplitude: 0.5,
  turbulenceFrequency: 0.2,
  damping: 0.3,
  trailStrength: 10,
  trailDecay: 10,
};

// Optional camera configuration (kept here for convenience)
export const cameraConfig = {
  fov: 75,
  near: 0.1,
  far: 1000,
  position: [0, 20, 0],
  lookAt: [0, 0, 0],
};

