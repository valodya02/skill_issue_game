import * as THREE from '/vendor/three.module.js';

export const PRESETS = Object.freeze({
  autumn: { lift: [0.015, 0.008, 0.006], gamma: [1.02, 1.0, 0.98], gain: [1.05, 1.01, 0.97], saturation: 0.94, contrast: 0.16, shadow: [0.14, 0.33, 0.40], highlight: [0.98, 0.65, 0.32], toning: 0.14, vignette: 0.23, grain: 0.03, posterize: 0, scanline: 0, channelShift: 0 },
  night: { lift: [0.003, 0.009, 0.018], gamma: [0.99, 1.02, 1.06], gain: [0.83, 0.91, 1.07], saturation: 0.85, contrast: 0.23, shadow: [0.08, 0.25, 0.39], highlight: [1.0, 0.64, 0.30], toning: 0.22, vignette: 0.40, grain: 0.025, posterize: 0, scanline: 0, channelShift: 0 },
  vhs: { lift: [0.015, 0.01, 0.015], gamma: [1.0, 1.0, 1.0], gain: [1.05, 0.96, 1.02], saturation: 0.82, contrast: 0.20, shadow: [0.19, 0.26, 0.36], highlight: [1.0, 0.62, 0.40], toning: 0.12, vignette: 0.37, grain: 0.03, posterize: 0, scanline: 0.075, channelShift: 1.4 },
  off: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 0, shadow: [0, 0, 0], highlight: [1, 1, 1], toning: 0, vignette: 0, grain: 0, posterize: 0, scanline: 0, channelShift: 0 },
});

export const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uColor;
  uniform sampler2D uDepth;
  uniform vec2 uResolution;
  uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain;
  uniform vec3 uShadow; uniform vec3 uHighlight;
  uniform float uSaturation; uniform float uContrast; uniform float uToning;
  uniform float uVignette; uniform float uGrain; uniform float uPosterize;
  uniform float uScanline; uniform float uChannelShift; uniform float uTime; uniform float uOutline;
  uniform float uHit; uniform float uCoffee; uniform float uSmoke;
  uniform float uSlowmo; uniform float uBoom; uniform float uDeath;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float depthAt(vec2 p) { return texture2D(uDepth, clamp(p, 0.001, 0.999)).r; }
  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float radius = length(center) * 1.4142;
    uv += center * sin(uTime * 42.0 + uv.y * 30.0) * uCoffee * 0.006;
    vec2 shift = normalize(center + vec2(0.0001)) * (uHit * 2.0 + uChannelShift) / uResolution;
    vec3 color = texture2D(uColor, uv).rgb;
    if (uHit > 0.001 || uChannelShift > 0.001) {
      color.r = texture2D(uColor, uv + shift).r;
      color.b = texture2D(uColor, uv - shift).b;
    }
    if (uSlowmo > 0.001) {
      color += texture2D(uColor, uv - center * 0.009).rgb * uSlowmo * 0.15;
      color += texture2D(uColor, uv - center * 0.018).rgb * uSlowmo * 0.10;
      color /= 1.0 + uSlowmo * 0.25;
    }
    color = pow(max(color * uGain + uLift, vec3(0.0)), vec3(1.0) / max(uGamma, vec3(0.01)));
    color = mix(vec3(lum(color)), color, uSaturation);
    float l = lum(color);
    color = mix(color, color * mix(uShadow, uHighlight, smoothstep(0.18, 0.82, l)) / max(l, 0.25), uToning);
    color = clamp(color, 0.0, 1.0);
    vec3 sCurve = color * color * (3.0 - 2.0 * color);
    color = mix(color, sCurve, uContrast);
    color *= 1.0 - uVignette * smoothstep(0.3, 1.0, radius);
    color = mix(color, vec3(lum(color)), uSmoke * smoothstep(0.25, 0.9, radius) * 0.8);
    color = mix(color, color * vec3(1.12, 1.04, 0.91), uCoffee * 0.45);
    color = mix(color, color * vec3(0.70, 1.18, 0.76), uSlowmo * 0.3);
    color += vec3(uBoom * 0.75);
    color = mix(color, vec3(lum(color)), uDeath);
    color *= 1.0 - uHit * smoothstep(0.35, 0.95, radius) * 0.42;
    color += vec3(uHit * smoothstep(0.4, 1.0, radius) * 0.22, 0.0, 0.0);
    if (uOutline > 0.5) {
      vec2 px = 1.5 / uResolution;
      float d00 = depthAt(uv + px * vec2(-1.0, -1.0));
      float d10 = depthAt(uv + px * vec2(0.0, -1.0));
      float d20 = depthAt(uv + px * vec2(1.0, -1.0));
      float d01 = depthAt(uv + px * vec2(-1.0, 0.0));
      float d21 = depthAt(uv + px * vec2(1.0, 0.0));
      float d02 = depthAt(uv + px * vec2(-1.0, 1.0));
      float d12 = depthAt(uv + px * vec2(0.0, 1.0));
      float d22 = depthAt(uv + px * vec2(1.0, 1.0));
      float gx = d20 + 2.0*d21 + d22 - d00 - 2.0*d01 - d02;
      float gy = d02 + 2.0*d12 + d22 - d00 - 2.0*d10 - d20;
      float depthEdge = length(vec2(gx, gy)) / max(0.0002, 1.0 - depthAt(uv));
      vec3 normal = normalize(vec3(d21-d01, d12-d10, 0.012));
      float normalEdge = length(normal.xy) * 0.18;
      float edge = smoothstep(0.08, 0.22, max(depthEdge, normalEdge));
      color = mix(color, vec3(0.105, 0.055, 0.16), edge * 0.85);
    }
    color += (noise(gl_FragCoord.xy + uTime * 37.0) - 0.5) * uGrain;
    color *= 1.0 - uScanline * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));
    if (uPosterize > 1.0) color = floor(color * uPosterize + 0.5) / uPosterize;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export function createPost(renderer, scene, camera, opts = {}) {
  const gl = renderer.getContext();
  const canDepth = !!renderer.capabilities?.isWebGL2;
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  if (canDepth) target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const uniforms = {
    uColor: { value: target.texture }, uDepth: { value: target.depthTexture || target.texture },
    uResolution: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uOutline: { value: 0 },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3() },
    uShadow: { value: new THREE.Vector3() }, uHighlight: { value: new THREE.Vector3() },
  };
  for (const key of ['Saturation', 'Contrast', 'Toning', 'Vignette', 'Grain', 'Posterize', 'Scanline', 'ChannelShift', 'Hit', 'Coffee', 'Smoke', 'Slowmo', 'Boom', 'Death']) uniforms[`u${key}`] = { value: 0 };
  const material = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }', fragmentShader: FRAGMENT_SHADER });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 2,0, 0,2], 2));
  const quad = new THREE.Scene();
  quad.add(new THREE.Mesh(geometry, material));
  const quadCamera = new THREE.Camera();
  const effects = Object.fromEntries(['hit','coffee','smoke','slowmo','boom','death'].map(k => [k, { left: 0, strength: 0 }]));
  const duration = { hit: 0.15, coffee: 3, smoke: 2, slowmo: 1.2, boom: 0.08, death: 1 };
  const timer = gl.getExtension?.('EXT_disjoint_timer_query_webgl2');
  let pendingQuery = null;
  let preset = 'autumn';
  let outline = opts.outline !== false && canDepth;
  let disposed = false;
  const api = { gpuMs: null, timerAvailable: !!timer,
    setPreset(name) { if (Object.hasOwn(PRESETS, name)) preset = name; },
    kick(kind, amount = 1) {
      if (!Object.hasOwn(effects, kind)) return;
      effects[kind].left = duration[kind];
      effects[kind].strength = Math.max(0, Math.min(1, Number(amount) || 0));
    },
    resize(w, h) {
      const width = Math.max(1, Math.floor(w)), height = Math.max(1, Math.floor(h));
      target.setSize(width, height);
      uniforms.uResolution.value.set(width, height);
    },
    render(dt = 0) {
      if (disposed) return;
      if (preset === 'off') { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      const p = PRESETS[preset];
      const elapsed = Math.max(0, Number(dt) || 0);
      uniforms.uTime.value += elapsed;
      for (const [key, value] of Object.entries(p)) {
        const u = uniforms[`u${key[0].toUpperCase()}${key.slice(1)}`];
        if (Array.isArray(value)) u.value.set(...value); else u.value = value;
      }
      for (const [kind, effect] of Object.entries(effects)) {
        effect.left = Math.max(0, effect.left - elapsed);
        uniforms[`u${kind[0].toUpperCase()}${kind.slice(1)}`].value = effect.strength * effect.left / duration[kind];
      }
      uniforms.uOutline.value = outline ? 1 : 0;
      try { renderer.setRenderTarget(target); renderer.render(scene, camera); }
      catch (error) {
        if (!outline) throw error;
        outline = false; target.depthTexture?.dispose(); target.depthTexture = null;
        uniforms.uDepth.value = target.texture;
        renderer.setRenderTarget(target); renderer.render(scene, camera);
      }
      renderer.setRenderTarget(null);
      if (timer && pendingQuery && gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) api.gpuMs = gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(pendingQuery); pendingQuery = null;
      }
      const query = timer && !pendingQuery ? gl.createQuery() : null;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      renderer.render(quad, quadCamera);
      if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pendingQuery = query; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pendingQuery) gl.deleteQuery(pendingQuery);
      target.depthTexture?.dispose(); target.dispose(); geometry.dispose(); material.dispose();
    },
  };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  api.resize(size.x, size.y);
  api.setPreset(opts.preset || 'autumn');
  return api;
}
