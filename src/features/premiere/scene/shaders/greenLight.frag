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
