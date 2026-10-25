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
