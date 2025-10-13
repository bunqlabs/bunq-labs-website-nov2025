import GUI from 'lil-gui';

// Initializes the lil-gui debug panel for uniforms.
// Returns the GUI instance so callers can customize if needed.
export function initDebugPanel(uniforms, windField = null, configValues = null) {
  const gui = new GUI();
  gui.add(uniforms.turbulenceAmplitude, 'value', 0.0, 2.0, 0.1).name('Turbulence Amplitude');
  gui.add(uniforms.turbulenceFrequency, 'value', 0.0, 5.0, 0.1).name('Turbulence Frequency');
  gui.add(uniforms.damping, 'value', 0.0, 2.0, 0.01).name('Default Bend Factor');
  // Wind controls
  gui.add(uniforms.windStrength, 'value', 0.0, 5.0, 0.05).name('Wind Strength');
  if (windField && configValues) {
    const wf = gui.addFolder('Wind Field');
    wf.add(configValues, 'trailDecay', 0.90, 0.999, 0.001)
      .name('Decay')
      .onChange((v) => windField.setParams({ decay: v }));
    wf.add(configValues, 'diffusion', 0.0, 1.0, 0.01)
      .name('Diffusion')
      .onChange((v) => windField.setParams({ diffusion: v }));
    wf.add(configValues, 'advection', 0.0, 3.0, 0.05)
      .name('Advection')
      .onChange((v) => windField.setParams({ advection: v }));
    wf.add(configValues, 'injectionRadius', 0.005, 0.2, 0.001)
      .name('Brush Radius')
      .onChange((v) => windField.setParams({ injectionRadius: v }));
    wf.add(configValues, 'injectionStrength', 0.1, 5.0, 0.05)
      .name('Brush Strength')
      .onChange((v) => windField.setParams({ injectionStrength: v }));
  }
  // Glow controls
  gui.add(uniforms.glowThreshold, 'value', 0.0, 10.0, 0.1).name('Glow Threshold');
  gui.add(uniforms.glowBoost, 'value', 0.0, 2.0, 0.05).name('Glow Boost');
  return gui;
}
