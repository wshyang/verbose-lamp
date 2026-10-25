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
