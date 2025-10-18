// Exported vertex and fragment shaders for the grass material

export const grassVertexShader = `
  uniform float time;
  uniform float turbulenceAmplitude;
  uniform float turbulenceFrequency;
  uniform float damping;
  uniform float windStrength;  // scales field effect
  uniform vec2 planeExtent;    // world units of ground plane extents (x,z)
  uniform sampler2D windTex;   // RG wind vector field in UV space
  // Glow uniforms (computed in vertex shader)
  uniform float glowThreshold; // speed threshold where glow starts
  uniform float glowBoost;     // max intensity addition
  // Scroll conveyor offset in world Z units to keep turbulence coherent while scrolling
  uniform float scrollOffsetZ;
  // Normalized scroll offset in plane units (-inf..inf), 1 = one full plane length
  uniform float scrollOffsetNorm;
  // Per-instance stable random seed (0..1)
  attribute float aRandomSeed;
  varying float vHeight;
  varying float vRandomSeed;
  varying float vGlow;         // per-vertex glow factor
  void main() {
    vec3 basePos = instanceMatrix[3].xyz;
    vec3 pos = position;
    float heightFactor = pos.y / 1.0;
    vHeight = heightFactor;

    // Use stable per-instance random seed
    float randomSeed = aRandomSeed;
    vRandomSeed = aRandomSeed;

    // Baseline random bending
    float randomAngle = randomSeed * 2.0 * 3.14159265359;
    vec2 bendDir = vec2(cos(randomAngle), sin(randomAngle));
    float bendAmount = damping * heightFactor;
    pos.x += bendDir.x * bendAmount;
    pos.z += bendDir.y * bendAmount;

    // Sample wind field in UV mapped from world XZ (stationary relative to ground)
    vec2 uv = basePos.xz / planeExtent + 0.5;
    // Clamp to domain; do not scroll-wrap so UV stays fixed to ground
    uv = vec2(clamp(uv.x, 0.0, 1.0), clamp(uv.y, 0.0, 1.0));
    vec2 wind = texture2D(windTex, uv).xy;
    float windMag = length(wind);
    pos.x += wind.x * windStrength * heightFactor;
    pos.z += wind.y * windStrength * heightFactor;

    // Vertex-based glow (stronger toward the blade tip)
    float glow = smoothstep(glowThreshold, glowThreshold * 3.0, windMag) * glowBoost;
    vGlow = glow * heightFactor;

    // Turbulence (offset by scroll so pattern moves with grass)
    float tx = basePos.x;
    float tz = basePos.z - scrollOffsetZ;
    float turbulence = sin(tx * turbulenceFrequency + time) *
                       sin(tz * turbulenceFrequency + time) *
                       turbulenceAmplitude * heightFactor;
    pos.x += turbulence;
    pos.z += turbulence;

    // Apply conveyor offset on world Z (independent of instance rotation)
    float extentZ = planeExtent.y;
    float zNorm = basePos.z / max(extentZ, 1e-5);           // normalize to [-0.5, 0.5]
    zNorm = fract(zNorm - scrollOffsetNorm + 0.5) - 0.5;    // scroll and wrap
    float newZBase = zNorm * extentZ;
    float deltaZ = newZBase - basePos.z;

    // Compute world position from instance, then add world-space Z delta
    vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
    worldPos.z += deltaZ;
    // Project
    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
  }
`;

export const grassFragmentShader = `
  varying float vHeight;
  varying float vRandomSeed;
  varying float vGlow; // computed in vertex shader
  void main() {
    vec3 bottomColor = vec3(0.0, 0.0, 0.0); // Black base
    float grayValue = vRandomSeed * 0.3 + 0.1;     // Randomness in brightness
    vec3 topColor = vec3(grayValue, grayValue, grayValue); // Random grayscale
    vec3 baseColor = mix(bottomColor, topColor + 0.1, vHeight);

    // Electric blue glow from vertex shader
    vec3 glowColor = vec3(0.5, 0.5, 0.5); // electric blue
    vec3 color = baseColor + vGlow * glowColor;

    gl_FragColor = vec4(color, 1.0);
  }
`;
