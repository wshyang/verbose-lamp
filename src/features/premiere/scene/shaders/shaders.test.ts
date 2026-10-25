import { describe, expect, test } from 'vitest';
import cinemaNitrateFrag from './cinemaNitrate.frag?raw';
import cinemaNitrateVert from './cinemaNitrate.vert?raw';
import goldDustFrag from './goldDust.frag?raw';
import goldDustVert from './goldDust.vert?raw';
import greenLightFrag from './greenLight.frag?raw';
import greenLightVert from './greenLight.vert?raw';
import {
  createCinemaNitrateUniforms,
  createGoldDustUniforms,
  createGreenLightUniforms,
} from './uniforms';
import { parseAttributeNames, parseUniformNames } from './glslDeclarations';

interface ShaderContract {
  readonly name: string;
  readonly vert: string;
  readonly frag: string;
  readonly uniformKeys: readonly string[];
}

// Uniforms ShaderMaterial/ShaderPass inject themselves are not declared in our GLSL, so
// the contract is: every uniform our GLSL declares is a key the TS side supplies, and
// every key the TS side supplies is declared by the fragment or vertex source.
const CONTRACTS: readonly ShaderContract[] = [
  {
    name: 'cinema nitrate pass',
    vert: cinemaNitrateVert,
    frag: cinemaNitrateFrag,
    uniformKeys: Object.keys(createCinemaNitrateUniforms()),
  },
  {
    name: 'green light',
    vert: greenLightVert,
    frag: greenLightFrag,
    uniformKeys: Object.keys(createGreenLightUniforms()),
  },
  {
    name: 'gold dust',
    vert: goldDustVert,
    frag: goldDustFrag,
    uniformKeys: Object.keys(createGoldDustUniforms()),
  },
];

describe.each(CONTRACTS)('$name shader source', ({ vert, frag, uniformKeys }) => {
  test('vertex and fragment sources each define main()', () => {
    expect(vert).toContain('void main()');
    expect(frag).toContain('void main()');
  });

  test('declared uniforms match the uniforms the TS side supplies', () => {
    const declared = [...parseUniformNames(vert), ...parseUniformNames(frag)];

    expect([...new Set(declared)].sort()).toEqual([...uniformKeys].sort());
  });
});

describe('createCinemaNitrateUniforms', () => {
  test('returns a fresh object each call so passes never share mutable uniforms', () => {
    const first = createCinemaNitrateUniforms();
    const second = createCinemaNitrateUniforms();

    first.uTime.value = 5;

    expect(second.uTime.value).toBe(0);
  });

  test('starts in full colour with a widescreen aspect', () => {
    const uniforms = createCinemaNitrateUniforms();

    expect(uniforms.uNitrate.value).toBe(0);
    expect(uniforms.uAspect.value).toBe(1.77);
    expect(uniforms.tDiffuse.value).toBeNull();
  });
});

describe('uniform factories', () => {
  test('green light starts dark-pulse at full intensity', () => {
    const uniforms = createGreenLightUniforms();

    expect(uniforms.uTime.value).toBe(0);
    expect(uniforms.uIntensity.value).toBe(1);
  });

  test('gold dust starts with the camera at its default depth', () => {
    const uniforms = createGoldDustUniforms();

    expect(uniforms.uTime.value).toBe(0);
    expect(uniforms.uCamZ.value).toBe(10);
  });
});

describe('gold dust vertex attributes', () => {
  // The former manager set exactly these per-point attributes on the dust geometry.
  test('declares the attributes the dust geometry supplies', () => {
    expect(parseAttributeNames(goldDustVert).sort()).toEqual(['aPhase', 'aScale']);
  });
});
