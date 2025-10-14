// Tweakable configuration values for the grass scene

export const planeSize = 35;
export const grassCount = 50000;

export const bladeWidth = 0.4;
export const bladeHeight = 2;
export const bladeSegments = 1;
export const taperFactor = 0.1; // 0..1 (fraction of base width at tip)

// Initial uniform values exposed to the GUI
export const initialUniforms = {
  turbulenceAmplitude: 0.2,
  turbulenceFrequency: 0.2,
  damping: 0.3,
  // Wind interaction via field
  windStrength: 1.2, // scales field effect in vertex
  trailDecay: 0.98, // field decay per frame (closer to 1 = longer trails)
  diffusion: 0.25, // 0..1 blur mix
  advection: 1.0, // how far the field self-advects per second
  injectionRadius: 0.07, // in UV (0..1) units
  injectionStrength: 0.15, // base injection power
  fieldResolution: 64, // texture resolution for the wind field
  // Glow behavior
  glowThreshold: 0.3,
  glowBoost: 0.2,
};

// Optional camera configuration (kept here for convenience)
export const cameraConfig = {
  fov: 75,
  near: 0.1,
  far: 1000,
  position: [0, 20, 0],
  lookAt: [0, 0, 0],
};
