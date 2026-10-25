/**
 * Cinema nitrate post shader, moved verbatim from GatsbySceneManager
 * (ADDENDUM-022 §2.2): anamorphic edge dispersion, the silver-nitrate
 * projector blend, anti-banding grain and a soft theatrical vignette.
 * ShaderPass clones the uniforms, so this shared object stays pristine.
 */
export const cinemaNitrateShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNitrate: { value: 0 }, // 0 = full golden 3D color, 1 = 1920s B&W silver-nitrate projection
    uAspect: { value: 1.77 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNitrate;
    uniform float uAspect;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered * vec2(uAspect * 0.62, 1.0), centered * vec2(uAspect * 0.62, 1.0));

      // Subtle anamorphic edge dispersion
      vec2 caOffset = centered * r2 * 0.0045;
      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;
      vec3 col = vec3(r, g, b);

      // 1920s Silver-Nitrate Projector Opening / Filter Mode (Baz Luhrmann homage)
      if (uNitrate > 0.001) {
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        // Subtle projector bulb flicker
        float flicker = 0.94 + 0.06 * sin(uTime * 27.0) * cos(uTime * 13.0);
        // Fine vertical emulsion scratch lines
        float scratchSeed = floor(vUv.x * 380.0 + floor(uTime * 16.0) * 19.3);
        float scratch = step(0.9965, hash12(vec2(scratchSeed, floor(uTime * 14.0)))) * 0.22;
        vec3 silverTone = vec3(luma * 1.06, luma * 1.02, luma * 0.93) * flicker + scratch;
        col = mix(col, silverTone, uNitrate);
      }

      // Ultra-fine cinema film grain to eliminate any dark shadow banding
      float grain = (hash12(vUv * 820.0 + fract(uTime * 37.0)) - 0.5) * (0.022 + uNitrate * 0.035);
      col += grain;

      // Soft theatrical vignette
      float vig = smoothstep(1.25, 0.22, r2 * 1.15);
      col *= mix(0.42, 1.0, vig);

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};
