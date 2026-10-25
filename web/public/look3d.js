import * as THREE from '/vendor/three.module.js';

const ramps = new Map();
function ramp() {
  if (ramps.has('three')) return ramps.get('three');
  const texture = new THREE.DataTexture(new Uint8Array([69,69,69, 159,159,159, 255,255,255]), 3, 1, THREE.RGBFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  ramps.set('three', texture);
  return texture;
}

export function toonMaterial(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp(), flatShading: true, ...opts });
}

export function applyLook(scene) {
  const converted = new Map();
  scene.traverse(object => {
    if (!object.isMesh || object.userData.noToon) return;
    const convert = source => {
      if (!source || source.isShaderMaterial || source.isMeshToonMaterial || source.isDepthMaterial) return source;
      if (converted.has(source)) return converted.get(source);
      const material = toonMaterial(source.color || '#ffffff', {
        map: source.map || null, transparent: source.transparent,
        opacity: source.opacity, side: source.side, alphaTest: source.alphaTest,
        vertexColors: source.vertexColors, skinning: source.skinning,
      });
      converted.set(source, material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
  });
  return converted;
}

export function sky(scene) {
  const geometry = new THREE.SphereGeometry(400, 16, 8);
  const material = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vDir; void main(){ float t=smoothstep(-0.2,0.85,normalize(vDir).y); gl_FragColor=vec4(mix(vec3(0.62,0.39,0.27),vec3(0.34,0.43,0.52),t),1.0); }',
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'autumn-sky';
  mesh.userData.noToon = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function fog(scene, preset = 'autumn') {
  const colors = { autumn: '#a18c79', night: '#374a60', vhs: '#716876', off: '#a18c79' };
  scene.fog = new THREE.FogExp2(colors[preset] || colors.autumn, preset === 'night' ? 0.022 : 0.013);
  return scene.fog;
}

export function lights(scene, preset = 'autumn') {
  const group = new THREE.Group();
  group.name = 'look3d-lights';
  const hemi = new THREE.HemisphereLight(preset === 'night' ? '#8094b0' : '#c6d1d4', '#594942', preset === 'night' ? 1.25 : 1.8);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(preset === 'night' ? '#b5c4d4' : '#ffcf9b', preset === 'night' ? 1.0 : 2.0);
  sun.position.set(-9, 18, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 55;
  sun.shadow.bias = -0.0005;
  group.add(sun);
  const scale = 40;
  const map = scene.userData.map;
  const lamps = (map?.decor || []).filter(item => item.kind === 'lamp').slice(0, 4);
  for (const lamp of lamps) {
    const light = new THREE.PointLight('#ffc675', preset === 'night' ? 9 : 5, 9, 2);
    light.position.set(lamp.x / scale - 20, 4.15, lamp.y / scale - 11.25);
    group.add(light);
  }
  scene.add(group);
  return group;
}
