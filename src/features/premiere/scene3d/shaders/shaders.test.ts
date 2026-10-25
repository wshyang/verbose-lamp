import { describe, expect, it } from 'vitest';
import { cinemaNitrateShader } from './cinemaNitrate.glsl';
import { goldDustFragmentShader, goldDustVertexShader } from './goldDust.glsl';
import { greenLightFragmentShader, greenLightVertexShader } from './greenLight.glsl';

// The GLSL moved verbatim out of GatsbySceneManager (ADDENDUM-022 §2.2);
// these pins fail loudly if a uniform or signature constant ever drifts.
describe('premiere GLSL sources', () => {
  it('cinema nitrate keeps its ShaderPass shape and uniforms', () => {
    expect(Object.keys(cinemaNitrateShader.uniforms)).toEqual([
      'tDiffuse',
      'uTime',
      'uNitrate',
      'uAspect',
    ]);
    expect(cinemaNitrateShader.vertexShader).toContain('gl_Position');
    expect(cinemaNitrateShader.fragmentShader).toContain('uniform float uNitrate');
    expect(cinemaNitrateShader.fragmentShader).toContain('hash12');
    expect(cinemaNitrateShader.fragmentShader).toContain('caOffset');
    expect(cinemaNitrateShader.fragmentShader).toContain('silverTone');
  });

  it('green light keeps its pulse uniforms and emerald', () => {
    expect(greenLightVertexShader).toContain('varying vec2 vUv');
    expect(greenLightFragmentShader).toContain('uniform float uIntensity');
    expect(greenLightFragmentShader).toContain('vec3 emerald = vec3(0.08, 0.98, 0.52)');
  });

  it('gold dust keeps its twinkle attributes', () => {
    expect(goldDustVertexShader).toContain('uniform float uCamZ');
    expect(goldDustVertexShader).toContain('attribute float aScale');
    expect(goldDustVertexShader).toContain('attribute float aPhase');
    expect(goldDustFragmentShader).toContain('vTwinkle');
    expect(goldDustFragmentShader).toContain('gl_PointCoord');
  });
});
