/**
 * GLSL moved verbatim out of `GatsbySceneManager` (ADDENDUM-022 §2.3).
 * Do not reformat: these strings are the visual contract.
 */

export const QUAD_VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

export const GREEN_LIGHT_FRAGMENT = /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - vec2(0.5, 0.54)) * vec2(1.4, 1.0);
          float d = length(p);

          // Pulsing lighthouse / dock emerald heartbeat
          float pulse = 0.72 + 0.28 * sin(uTime * 2.3) * (0.8 + 0.2 * sin(uTime * 6.7));
          float core = exp(-d * 28.0) * 1.9;
          float halo = exp(-d * 5.8) * 0.55;
          float flareH = exp(-abs(p.y) * 44.0) * exp(-abs(p.x) * 3.8) * 0.75;

          // Subtle shimmering bay water reflection below y = 0.50
          float below = smoothstep(0.52, 0.14, vUv.y);
          float ripple = sin(vUv.y * 140.0 - uTime * 4.5 + sin(vUv.x * 30.0) * 2.0) * 0.5 + 0.5;
          float waterRefl = below * exp(-abs(p.x) * 9.5) * ripple * 0.38;

          vec3 emerald = vec3(0.08, 0.98, 0.52);
          vec3 coreWhite = vec3(0.82, 1.0, 0.9);
          vec3 col = (emerald * (halo + flareH + waterRefl) + coreWhite * core) * pulse * uIntensity;
          gl_FragColor = vec4(col, clamp((core + halo + waterRefl) * uIntensity, 0.0, 1.0));
        }
      `;

export const GOLD_DUST_VERTEX = /* glsl */ `
        attribute float aScale;
        attribute float aPhase;
        uniform float uTime;
        uniform float uCamZ;
        varying float vTwinkle;
        varying float vDepthFade;

        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.45 + aPhase) * 0.35;
          pos.x += cos(uTime * 0.32 + aPhase * 1.7) * 0.28;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          float dist = -mvPosition.z;
          vDepthFade = smoothstep(0.6, 3.2, dist) * (1.0 - smoothstep(26.0, 44.0, dist));
          vTwinkle = 0.45 + 0.55 * sin(uTime * 3.1 + aPhase * 5.0);

          gl_PointSize = clamp((34.0 * aScale) / max(1.0, dist), 1.5, 16.0);
          gl_Position = projectionMatrix * mvPosition + vec4(0.0, 0.0, uCamZ * 0.0, 0.0);
        }
      `;

export const GOLD_DUST_FRAGMENT = /* glsl */ `
        varying float vTwinkle;
        varying float vDepthFade;

        void main() {
          vec2 p = gl_PointCoord - 0.5;
          // Art Deco diamond sparkle + soft bokeh core
          float diamond = abs(p.x) + abs(p.y);
          float dCircle = length(p);
          float shape = smoothstep(0.48, 0.05, mix(dCircle, diamond * 0.82, 0.55));
          if (shape <= 0.01 || vDepthFade <= 0.01) discard;

          vec3 gold = mix(vec3(0.86, 0.65, 0.22), vec3(1.0, 0.94, 0.76), vTwinkle);
          gl_FragColor = vec4(gold * (0.75 + vTwinkle * 0.65), shape * vDepthFade * 0.72);
        }
      `;

/** The 1920s silver-nitrate projector filter, byte-for-byte from the manager. */
export const CinemaNitrateShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNitrate: { value: 0 }, // 0 = full golden 3D color, 1 = 1920s B&W silver-nitrate projection
    uAspect: { value: 1.77 },
  },
  vertexShader: QUAD_VERTEX,
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
