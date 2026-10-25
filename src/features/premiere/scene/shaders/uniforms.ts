// Uniform factories for the standalone shaders. Pure (no three import) so the contract test
// can compare their keys against the uniforms the GLSL declares (ADDENDUM-025). Each call
// returns fresh objects: uniforms are mutated every frame and must never be shared.

export interface UniformSlot<T> {
  value: T;
}

export function createCinemaNitrateUniforms() {
  return {
    tDiffuse: { value: null } as UniformSlot<unknown>,
    uTime: { value: 0 },
    uNitrate: { value: 0 }, // 0 = full golden 3D color, 1 = 1920s B&W silver-nitrate projection
    uAspect: { value: 1.77 },
  };
}

export function createGreenLightUniforms() {
  return {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
  };
}

export function createGoldDustUniforms() {
  return {
    uTime: { value: 0 },
    uCamZ: { value: 10 },
  };
}
