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
