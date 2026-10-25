import { describe, expect, test } from 'vitest';
import { parseAttributeNames, parseUniformNames } from './glslDeclarations';

describe('parseUniformNames', () => {
  test('returns uniform names in declaration order', () => {
    const source = `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      varying vec2 vUv;
    `;

    expect(parseUniformNames(source)).toEqual(['tDiffuse', 'uTime']);
  });

  test('ignores uniforms inside line and block comments', () => {
    const source = `
      // uniform float uOld;
      /* uniform float uAlsoOld;
         uniform float uStillOld; */
      uniform float uLive;
    `;

    expect(parseUniformNames(source)).toEqual(['uLive']);
  });

  test('handles precision qualifiers and multiple names per declaration', () => {
    const source = `
      uniform highp float uA, uB;
      uniform vec3 uColor;
    `;

    expect(parseUniformNames(source)).toEqual(['uA', 'uB', 'uColor']);
  });

  test('returns an empty array when the source declares no uniforms', () => {
    expect(parseUniformNames('void main() {}')).toEqual([]);
  });
});

describe('parseAttributeNames', () => {
  test('returns attribute names and skips varyings and uniforms', () => {
    const source = `
      attribute float aScale;
      attribute float aPhase;
      uniform float uTime;
      varying float vTwinkle;
    `;

    expect(parseAttributeNames(source)).toEqual(['aScale', 'aPhase']);
  });

  test('ignores commented-out attributes', () => {
    expect(parseAttributeNames('// attribute float aGone;\nattribute vec2 aLive;')).toEqual(['aLive']);
  });
});
