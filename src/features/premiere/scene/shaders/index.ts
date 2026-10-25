// Standalone shader programs for the premiere scene (ADDENDUM-025). GLSL lives in .vert/.frag
// files imported with Vite's `?raw`; uniform factories live in ./uniforms.
import cinemaNitrateFrag from './cinemaNitrate.frag?raw';
import cinemaNitrateVert from './cinemaNitrate.vert?raw';
import goldDustFrag from './goldDust.frag?raw';
import goldDustVert from './goldDust.vert?raw';
import greenLightFrag from './greenLight.frag?raw';
import greenLightVert from './greenLight.vert?raw';

export {
  cinemaNitrateFrag,
  cinemaNitrateVert,
  goldDustFrag,
  goldDustVert,
  greenLightFrag,
  greenLightVert,
};
export {
  createCinemaNitrateUniforms,
  createGoldDustUniforms,
  createGreenLightUniforms,
} from './uniforms';
