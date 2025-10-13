// Exported vertex and fragment shaders for the grass material

export const vertexShader = `
  uniform float time;
  uniform float turbulenceAmplitude;
  uniform float turbulenceFrequency;
  uniform float damping;
  uniform float windStrength;  // scales field effect
  uniform float planeSize;     // world units of ground plane extent
  uniform sampler2D windTex;   // RG wind vector field in UV space
  varying float vHeight;
  varying float vRandomSeed;
  varying float vWindMag;      // for glow
  void main() {
    vec3 basePos = instanceMatrix[3].xyz;
    vec3 pos = position;
    float heightFactor = pos.y / 1.0;
    vHeight = heightFactor;

    // Generate pseudo-random seed based on base position
    float randomSeed = fract(sin(dot(basePos.xz, vec2(12.9898, 78.233))) * 43758.5453);
    vRandomSeed = randomSeed;

    // Baseline random bending
    float randomAngle = randomSeed * 2.0 * 3.14159265359;
    vec2 bendDir = vec2(cos(randomAngle), sin(randomAngle));
    float bendAmount = damping * heightFactor;
    pos.x += bendDir.x * bendAmount;
    pos.z += bendDir.y * bendAmount;

    // Sample wind field in UV mapped from world XZ
    vec2 uv = basePos.xz / planeSize + 0.5;
    vec2 wind = texture2D(windTex, uv).xy;
    vWindMag = length(wind);
    pos.x += wind.x * windStrength * heightFactor;
    pos.z += wind.y * windStrength * heightFactor;

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

export const fragmentShader = `
  varying float vHeight;
  varying float vRandomSeed;
  varying float vWindMag;
  // Glow uniforms
  uniform float glowThreshold; // speed threshold where glow starts
  uniform float glowBoost;     // max intensity addition
  void main() {
    vec3 bottomColor = vec3(0.0, 0.0, 0.0); // Black base
    float grayValue = vRandomSeed * 0.1;     // Randomness in brightness
    vec3 topColor = vec3(grayValue, grayValue, grayValue); // Random grayscale
    vec3 baseColor = mix(bottomColor, topColor + 0.1, vHeight);

    // Electric blue glow increases with local wind magnitude
    vec3 glowColor = vec3(0.2, 0.6, 1.0); // electric blue
    float glow = smoothstep(glowThreshold, glowThreshold * 3.0, vWindMag) * glowBoost;
    vec3 color = baseColor + glow * glowColor;

    gl_FragColor = vec4(color, 1.0);
  }
`;
