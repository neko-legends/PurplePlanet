import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import "./styles.css";

const canvas = document.querySelector("#wallpaper");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: false,
  antialias: true,
  powerPreference: "low-power",
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x03010b, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060112, 0.018);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
const cameraBasePosition = new THREE.Vector3();
const cameraBaseTarget = new THREE.Vector3(0, 0.2, 0);
const cameraSwayPosition = new THREE.Vector3();
const cameraSwayTarget = new THREE.Vector3();
const planetWorldPosition = new THREE.Vector3();
const orbitVisualOffset = new THREE.Vector3();
const clock = new THREE.Clock();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const THEMES = {
  nebula: ["#245dff", "#5146ff", "#8c35ff", "#f725d6", "#ff2f8a"],
  aurora: ["#2170ff", "#22dcff", "#6d52ff", "#e83cff", "#ff4f8f"],
  ultraviolet: ["#3425ff", "#664dff", "#9d42ff", "#d92fff", "#fff0ff"],
  plasma: ["#184cff", "#4545ff", "#922cff", "#ff1fb8", "#ff3758"],
  candy: ["#45dfff", "#5a7dff", "#ad5cff", "#ff66c7", "#ffd46f"],
};
const settings = readSettings();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = settings.exposure;

scene.add(camera);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(1, 1),
  settings.bloomStrength,
  settings.bloomRadius,
  settings.bloomThreshold,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

class OrbitCurve extends THREE.Curve {
  constructor(rx, ry, start, length, depth = flatOrbitDepth()) {
    super();
    this.rx = rx;
    this.ry = ry;
    this.start = start;
    this.length = length;
    this.depth = depth;
  }

  getPoint(t) {
    const angle = this.start + this.length * t;
    const radial = orbitRadialAt(angle, this.depth);
    return new THREE.Vector3(
      Math.cos(angle) * (this.rx + radial),
      Math.sin(angle) * (this.ry + radial * 0.42),
      orbitDepthAt(angle, this.depth),
    );
  }
}

const nebula = createNebula(settings);
camera.add(nebula.mesh);

const backdrop = createBackdrop(settings);
scene.add(backdrop.points);

const system = new THREE.Group();
system.rotation.x = -0.015;
system.rotation.y = -0.035;
scene.add(system);

const orbitSystem = createOrbitSystem(settings);
system.add(orbitSystem.group);

const planet = createPlanet(settings);
system.add(planet.group);

let frameId = 0;
let planetBaseScale = 1;

resize();
window.addEventListener("resize", resize, { passive: true });
document.addEventListener("visibilitychange", handleVisibility, false);
animate();

function animate() {
  frameId = requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();
  const motionScale = reducedMotion.matches ? 0.18 : 1;
  const time = elapsed * settings.speed * motionScale;
  const cameraTime = elapsed * motionScale;
  const planetPulse = 0.5 + Math.sin(cameraTime * 0.42 + Math.sin(cameraTime * 0.11) * 0.7) * 0.5;
  const planetPulseScale = 1 + (planetPulse - 0.5) * 0.026;

  planet.group.scale.setScalar(planetBaseScale * planetPulseScale);
  orbitSystem.occlusion.radius.value =
    (1.58 * planet.group.scale.x) / orbitSystem.group.scale.x;

  orbitSystem.dust.material.uniforms.uTime.value = time;
  orbitSystem.sparkCloud.material.uniforms.uTime.value = time;
  backdrop.material.uniforms.uTime.value = time * 0.45;
  nebula.material.uniforms.uTime.value = time * 0.06;
  planet.surface.material.uniforms.uTime.value = time;
  planet.surface.material.uniforms.uPulse.value = planetPulse;
  planet.glow.material.uniforms.uTime.value = time;
  planet.glow.material.uniforms.uPulse.value = planetPulse;
  planet.aura.material.rotation = time * 0.025;
  planet.aura.scale.copy(planet.aura.userData.baseScale).multiplyScalar(1 + planetPulse * 0.045);
  planet.aura.material.opacity = planet.aura.userData.baseOpacity * (0.88 + planetPulse * 0.26);
  planet.softHalo.scale.setScalar(1 + planetPulse * 0.038);
  planet.softHalo.rotation.z = time * 0.006;
  for (const layer of planet.softHalo.children) {
    layer.material.opacity = layer.userData.baseOpacity * (0.8 + planetPulse * 0.42);
  }
  planet.glow.scale.setScalar(1 + planetPulse * 0.045);
  planet.limbBokeh.scale.setScalar(1 + planetPulse * 0.032);
  planet.limbBokeh.rotation.z = -time * 0.009;
  planet.limbBokeh.material.uniforms.uTime.value = time;
  planet.rayFan.material.rotation = -0.035 + Math.sin(time * 0.12) * 0.018;
  planet.rayFan.material.opacity = (0.36 + Math.sin(time * 0.16) * 0.035) * (0.92 + planetPulse * 0.18);

  for (const trail of orbitSystem.allTrails) {
    trail.material.uniforms.uTime.value = time;
  }

  for (const sprite of orbitSystem.sprites) {
    const runner = sprite.userData.runner;
    const orbit = runner.orbit;
    const progress = fract(runner.phase + runner.direction * time * runner.speed);
    const angle = progress * Math.PI * 2;
    const radial = orbitRadialAt(angle, orbit.depth);
    sprite.position.set(
      Math.cos(angle) * (orbit.rx + radial),
      Math.sin(angle) * (orbit.ry + radial * 0.42),
      orbitDepthAt(angle, orbit.depth) + sprite.userData.layerZ,
    );
    const occlusionCenter = orbitSystem.occlusion.center.value;
    const distanceToPlanet = Math.hypot(
      sprite.position.x - occlusionCenter.x,
      sprite.position.y - occlusionCenter.y,
    );
    const planetFade = clamp((distanceToPlanet - orbitSystem.occlusion.radius.value * 0.88) / 0.28, 0, 1);
    const foreground = clamp(-Math.sin(angle), 0, 1);
    const lensBlur = sprite.userData.focusBlur * (0.42 + foreground * 0.78);
    sprite.material.opacity =
      sprite.userData.opacity *
      (0.72 + Math.sin(time * sprite.userData.twinkle + sprite.userData.phase) * 0.28) *
      (0.78 + foreground * 0.42) *
      (1 - lensBlur * 0.34) *
      planetFade;
    sprite.material.rotation =
      angle - Math.PI / 2 + sprite.userData.rotationJitter + Math.sin(time + sprite.userData.phase) * 0.04;
    sprite.scale.set(
      sprite.userData.width * (0.82 + foreground * 0.4) * (1 + lensBlur * 1.15),
      sprite.userData.height * (0.82 + foreground * 0.4) * (1 + lensBlur * 2.15),
      1,
    );
  }

  updateCameraSway(cameraTime);
  composer.render();
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.fov = camera.aspect < 0.85 ? 61 : 66;
  cameraBasePosition.set(
    camera.aspect < 0.85 ? 0 : -0.62,
    camera.aspect < 0.85 ? 8.8 : 3.05,
    camera.aspect < 0.85 ? 17.2 : 10.85,
  );
  cameraBaseTarget.set(camera.aspect < 0.85 ? 0 : 0.24, camera.aspect < 0.85 ? 0.18 : 0.04, 0);
  camera.position.copy(cameraBasePosition);
  camera.lookAt(cameraBaseTarget);
  camera.updateProjectionMatrix();

  const portraitLayout = camera.aspect < 0.85;
  planet.group.position.set(
    portraitLayout ? 1.25 : 3.35,
    portraitLayout ? 0.78 : 0.92,
    0.02,
  );
  planetBaseScale = portraitLayout ? (camera.aspect < 0.58 ? 0.82 : 0.92) : 1;
  planet.group.scale.setScalar(planetBaseScale);
  orbitSystem.group.scale.setScalar(portraitLayout ? 0.94 : 1.23);
  orbitVisualOffset.set(
    portraitLayout ? 0.24 : 1.05,
    portraitLayout ? -0.04 : -0.08,
    0,
  );
  orbitSystem.group.position.copy(planet.group.position).add(orbitVisualOffset);
  system.updateMatrixWorld(true);
  planet.group.getWorldPosition(planetWorldPosition);
  orbitSystem.occlusion.center.value.copy(orbitSystem.group.worldToLocal(planetWorldPosition));
  orbitSystem.occlusion.radius.value =
    (1.58 * planet.group.scale.x) / orbitSystem.group.scale.x;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, settings.pixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
}

function handleVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(frameId);
    frameId = 0;
    return;
  }

  if (!frameId) {
    clock.getDelta();
    animate();
  }
}

function updateCameraSway(time) {
  const amount = settings.cameraSway;
  if (amount <= 0) {
    camera.position.copy(cameraBasePosition);
    camera.lookAt(cameraBaseTarget);
    camera.rotation.z = 0;
    return;
  }

  const x =
    Math.sin(time * 0.21) * 0.105 +
    Math.sin(time * 0.47 + 1.7) * 0.032 +
    Math.sin(time * 0.93 + 0.4) * 0.012;
  const y =
    Math.cos(time * 0.18 + 0.6) * 0.075 +
    Math.sin(time * 0.39 + 2.4) * 0.028;
  const z = Math.sin(time * 0.16 + 1.1) * 0.085;
  const targetX = Math.sin(time * 0.19 + 2.1) * 0.055;
  const targetY = Math.cos(time * 0.23 + 0.3) * 0.034;
  const roll =
    (Math.sin(time * 0.17 + 1.5) * 0.0048 + Math.sin(time * 0.41) * 0.0018) * amount;

  cameraSwayPosition
    .copy(cameraBasePosition)
    .add(new THREE.Vector3(x * amount, y * amount, z * amount));
  cameraSwayTarget
    .copy(cameraBaseTarget)
    .add(new THREE.Vector3(targetX * amount, targetY * amount, 0));

  camera.position.copy(cameraSwayPosition);
  camera.lookAt(cameraSwayTarget);
  camera.rotation.z += roll;
}

function readSettings() {
  const params = new URLSearchParams(window.location.search);
  const quality = params.get("quality") || "cinematic";
  const qualityMap = {
    low: {
      backdrop: 750,
      dust: 900,
      sparkDust: 900,
      segments: 176,
      exposure: 0.86,
      bloomStrength: 0.28,
      bloomRadius: 0.32,
      bloomThreshold: 0.58,
      pixelRatio: 1,
    },
    balanced: {
      backdrop: 1500,
      dust: 2600,
      sparkDust: 3200,
      segments: 260,
      exposure: 0.9,
      bloomStrength: 0.46,
      bloomRadius: 0.42,
      bloomThreshold: 0.52,
      pixelRatio: 1.15,
    },
    high: {
      backdrop: 2600,
      dust: 5200,
      sparkDust: 6800,
      segments: 340,
      exposure: 0.94,
      bloomStrength: 0.62,
      bloomRadius: 0.52,
      bloomThreshold: 0.46,
      pixelRatio: 1.25,
    },
    cinematic: {
      backdrop: 3600,
      dust: 36000,
      sparkDust: 52000,
      segments: 420,
      exposure: 0.82,
      bloomStrength: 0.64,
      bloomRadius: 0.58,
      bloomThreshold: 0.5,
      pixelRatio: 1.35,
    },
  };
  const selected = qualityMap[quality] || qualityMap.balanced;
  const themeName = params.get("theme") || "nebula";
  const palette = readPalette(params.get("palette"), themeName);

  return {
    ...selected,
    palette,
    themeName,
    speed: clamp(Number(params.get("speed") || 1), 0.2, 2),
    cameraSway: clamp(Number(params.get("cameraSway") || 1), 0, 3),
    exposure: clamp(Number(params.get("exposure") || selected.exposure), 0.6, 1.8),
    bloomStrength: clamp(Number(params.get("bloom") || selected.bloomStrength), 0, 2),
    bloomRadius: clamp(Number(params.get("bloomRadius") || selected.bloomRadius), 0, 1.2),
    bloomThreshold: clamp(
      Number(params.get("bloomThreshold") || selected.bloomThreshold),
      0,
      1,
    ),
    pixelRatio: clamp(Number(params.get("pixelRatio") || selected.pixelRatio), 0.75, 2),
  };
}

function createNebula({ palette }) {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOuter: { value: samplePalette(palette, 0).clone() },
      uMid: { value: samplePalette(palette, 0.55).clone() },
      uInner: { value: samplePalette(palette, 1).clone() },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uOuter;
      uniform vec3 uMid;
      uniform vec3 uInner;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.52;
        for (int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p = p * 2.08 + vec2(17.3, -9.2);
          amplitude *= 0.5;
        }
        return value;
      }

      float rayFan(vec2 origin, vec2 uv, float direction) {
        vec2 d = uv - origin;
        float distanceFade = exp(-length(d * vec2(1.0, 1.45)) * 2.45);
        float forward = smoothstep(-0.05, 0.65, d.x * direction);
        float fan = smoothstep(0.72, 0.02, abs(d.y - d.x * 0.22 * direction));
        float striation = 0.48 + fbm(uv * 18.0 + vec2(14.2, -6.7)) * 0.72;
        return forward * fan * distanceFade * striation;
      }

      void main() {
        vec2 uv = vUv;
        vec2 p = uv - 0.5;
        p.x *= 1.78;

        float slow = uTime * 0.18;
        float broad = fbm(uv * 2.2 + vec2(slow, -slow * 0.5));
        float detail = fbm(uv * 7.5 + vec2(-slow * 1.3, slow));
        float darkVeil = fbm(uv * 4.4 + vec2(8.0, -2.0));
        float blackDust = fbm(uv * 5.8 + vec2(-3.0, 7.2));
        float deepRift = fbm(uv * 3.1 + vec2(11.0, 4.6));
        float fineVeil = fbm(uv * 13.0 + vec2(-slow * 2.0, slow * 1.2));
        float cloud = smoothstep(0.26, 0.92, broad + detail * 0.46);
        float shadow = smoothstep(0.48, 0.86, darkVeil);
        float voids =
          smoothstep(0.54, 0.79, blackDust) * smoothstep(0.04, 0.45, uv.y) +
          smoothstep(0.52, 0.76, deepRift) * smoothstep(0.18, 0.88, uv.y) * 0.75;
        float verticalBand = smoothstep(0.7, -0.1, abs(p.y + 0.06));
        float dustBand = smoothstep(0.58, 0.0, abs(p.y + 0.16 - p.x * 0.055));
        float planetGlow = exp(-length((uv - vec2(0.68, 0.54)) * vec2(2.2, 3.0)) * 3.7);
        float rays = rayFan(vec2(0.66, 0.54), uv, 1.0);
        float sideNebula = exp(-length((uv - vec2(0.1, 0.18)) * vec2(2.1, 4.1)) * 3.0);
        float vignette = smoothstep(1.05, 0.22, length(p));

        vec3 base = vec3(0.0015, 0.002, 0.009);
        vec3 blueMist = uOuter * (0.012 + cloud * 0.052 + dustBand * 0.017 + sideNebula * 0.034);
        vec3 purpleMist = uMid * (cloud * verticalBand * 0.052 + dustBand * 0.024 + fineVeil * 0.012);
        vec3 hotMist = uInner * (planetGlow * 0.105 + rays * 0.19);
        vec3 color = base + blueMist + purpleMist + hotMist;
        color *= mix(1.0, 0.24, shadow * 0.66 + voids * 0.82);
        color += uOuter * fineVeil * cloud * 0.012;
        color *= 0.07 + vignette * 0.62;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(140, 90), material);
  mesh.position.set(0, 0, -50);
  mesh.renderOrder = -1000;
  return { mesh, material };
}

function createBackdrop({ backdrop, palette }) {
  const positions = new Float32Array(backdrop * 3);
  const colors = new Float32Array(backdrop * 3);
  const sizes = new Float32Array(backdrop);
  const phases = new Float32Array(backdrop);

  for (let i = 0; i < backdrop; i += 1) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 54;
    positions[i3 + 1] = (Math.random() - 0.5) * 30;
    positions[i3 + 2] = -34 - Math.random() * 24;

    const color = samplePalette(palette, Math.random())
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.28)
      .multiplyScalar(0.55 + Math.random() * 0.62);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = 0.45 + Math.random() * 1.25;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * (70.0 / max(1.0, -mvPosition.z));
        vColor = color;
        vAlpha = 0.5 + sin(uTime * 0.7 + aPhase) * 0.28;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float core = smoothstep(0.48, 0.0, length(uv));
        if (core < 0.01) discard;
        gl_FragColor = vec4(vColor, core * vAlpha);
      }
    `,
    vertexColors: true,
  });

  return {
    geometry,
    material,
    points: new THREE.Points(geometry, material),
  };
}

function createOrbitSystem({ dust, sparkDust, segments, palette }) {
  const group = new THREE.Group();
  group.rotation.x = -1.14;
  group.rotation.z = -0.035;
  const occlusion = createPlanetOcclusionUniforms();

  const orbits = [];
  const trails = [];
  const allTrails = [];
  const orbitCount = 19;

  for (let i = 0; i < orbitCount; i += 1) {
    const rx = 2.35 + i * 0.69;
    const ry = rx * (0.31 + i * 0.0115);
    const depth = createOrbitDepth(i, orbitCount);
    const gradientT = 1 - i / Math.max(1, orbitCount - 1);
    const color = samplePalette(palette, gradientT);
    const guideColor = color.clone().lerp(new THREE.Color("#79819a"), 0.86);
    const tube = 0.0048 + i * 0.00072;
    const opacity = Math.max(0.0028, 0.011 - i * 0.00028);
    const focusBlur = orbitFocusBlur(i, orbitCount);

    if (focusBlur > 0.02) {
      const defocusWash = createOrbitTube(
        rx,
        ry,
        segments,
        tube * (19 + focusBlur * 24),
        guideColor.clone().lerp(color, 0.2),
        opacity * focusBlur * 0.13,
        offsetDepth(depth, -0.012),
        occlusion,
        focusBlur,
        1,
      );
      group.add(defocusWash);
    }

    const glow = createOrbitTube(
      rx,
      ry,
      segments,
      tube * (6.2 + focusBlur * 9),
      guideColor,
      opacity * (0.07 + focusBlur * 0.045),
      depth,
      occlusion,
      focusBlur,
      0,
    );
    const core = createOrbitTube(
      rx,
      ry,
      segments,
      tube * (1 + focusBlur * 0.18),
      guideColor,
      opacity * (1 - focusBlur * 0.32),
      offsetDepth(depth, 0.006),
      occlusion,
      focusBlur,
      0,
    );
    group.add(glow, core);

    const trailCount = i < 3 ? 2 : i < 9 ? 3 : 4;
    for (let j = 0; j < trailCount; j += 1) {
      const featureTrail = j === 0 && (i === 3 || i === 6 || i === 10 || i > 13);
      const trailOptions = {
        phase: Math.random(),
        speed: 0.012 + Math.random() * 0.032 + i * 0.0011,
        length: 0.2 + Math.random() * 0.34 + (i > 8 ? 0.16 : 0) + (featureTrail ? 0.18 : 0),
        opacity: 0.54 + Math.random() * 0.32 + (featureTrail ? 0.08 : 0),
        direction: Math.random() > 0.18 ? 1 : -1,
      };
      const halo = createOrbitTrail(
        rx,
        ry,
        segments,
        tube * (7.5 + Math.random() * 4.5),
        color,
        {
          ...trailOptions,
          depth: offsetDepth(depth, 0.036 + j * 0.018),
          occlusion,
          halo: 1,
          focusBlur,
          length: trailOptions.length * 1.2,
          opacity: trailOptions.opacity * (0.12 + focusBlur * 0.12),
        },
      );
      group.add(halo);
      allTrails.push(halo);

      const trail = createOrbitTrail(
        rx,
        ry,
        segments,
        tube * (0.7 + Math.random() * 1.2) * (1 + focusBlur * 0.42),
        color,
        {
          ...trailOptions,
          depth: offsetDepth(depth, 0.052 + j * 0.018),
          occlusion,
          halo: 0,
          focusBlur,
          opacity: trailOptions.opacity * (1 - focusBlur * 0.24),
        },
      );
      trail.userData.runner.layerZ = 0.08 + j * 0.018;
      group.add(trail);
      trails.push(trail);
      allTrails.push(trail);
    }

    orbits.push({ rx, ry, color, guideColor, gradientT, depth, focusBlur });
  }

  const dustCloud = createOrbitDust(orbits, dust, occlusion);
  group.add(dustCloud.points);

  const sparkCloud = createTrailSparks(trails, sparkDust, occlusion);
  group.add(sparkCloud.points);

  const sprites = createOrbitSprites(trails);
  for (const sprite of sprites) {
    group.add(sprite);
  }

  return {
    group,
    dust: dustCloud,
    sparkCloud,
    sprites,
    trails,
    allTrails,
    occlusion,
  };
}

function createOrbitTube(
  rx,
  ry,
  segments,
  radius,
  color,
  opacity,
  depth = flatOrbitDepth(),
  occlusion = createPlanetOcclusionUniforms(),
  focusBlur = 0,
  blurLayer = 0,
) {
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, 0, Math.PI * 2, depth),
    segments,
    radius,
    5,
    true,
  );
  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uSeed: { value: Math.random() * 1000 },
      uPlanetCenter: occlusion.center,
      uPlanetRadius: occlusion.radius,
      uFocusBlur: { value: focusBlur },
      uBlurLayer: { value: blurLayer },
    },
    vertexShader: `
      varying float vProgress;
      varying vec3 vLocalPosition;

      void main() {
        vProgress = uv.x;
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSeed;
      uniform vec3 uPlanetCenter;
      uniform float uPlanetRadius;
      uniform float uFocusBlur;
      uniform float uBlurLayer;
      varying float vProgress;
      varying vec3 vLocalPosition;

      float hash(float p) {
        return fract(sin(p * 437.31 + uSeed) * 43758.5453);
      }

      float planetOcclusion(vec3 p) {
        float disk = 1.0 - smoothstep(uPlanetRadius * 0.88, uPlanetRadius * 1.06, length(p.xy - uPlanetCenter.xy));
        return clamp(disk, 0.0, 1.0);
      }

      void main() {
        float angle = vProgress * 6.28318530718;
        float coarse = hash(floor(vProgress * 110.0));
        float fine = hash(floor(vProgress * 420.0));
        float lane = 0.34 + smoothstep(0.16, 0.92, coarse) * 0.58 + fine * 0.16;
        float breath = 0.72 + sin((vProgress + uSeed * 0.001) * 6.2831853 * 3.0) * 0.18;
        float foreground = smoothstep(0.08, 0.95, -sin(angle));
        float background = smoothstep(0.15, 0.95, sin(angle));
        float lensBlur = uFocusBlur * max(foreground, background * 0.72);
        float alpha = uOpacity * lane * breath * mix(0.62, 1.22, foreground);
        alpha *= mix(1.0, 0.58, lensBlur * (1.0 - uBlurLayer));
        alpha *= mix(1.0, 1.38, lensBlur * uBlurLayer);
        alpha *= 1.0 - planetOcclusion(vLocalPosition) * 0.98;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor * mix(0.82 + lane * 0.68, 0.68 + lane * 0.42, uBlurLayer), alpha);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function createOrbitArc(rx, ry, segments, radius, color, opacity, start, length) {
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, start, length, flatOrbitDepth()),
    Math.max(24, Math.floor(segments * (length / (Math.PI * 2)))),
    radius,
    5,
    false,
  );
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

function createOrbitTrail(rx, ry, segments, radius, color, options) {
  const occlusion = options.occlusion || createPlanetOcclusionUniforms();
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, 0, Math.PI * 2, options.depth || flatOrbitDepth()),
    segments,
    radius,
    5,
    true,
  );
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uPhase: { value: options.phase },
      uSpeed: { value: options.speed },
      uLength: { value: options.length },
      uOpacity: { value: options.opacity },
      uDirection: { value: options.direction },
      uHalo: { value: options.halo || 0 },
      uFocusBlur: { value: options.focusBlur || 0 },
      uPlanetCenter: occlusion.center,
      uPlanetRadius: occlusion.radius,
    },
    vertexShader: `
      varying float vProgress;
      varying vec3 vLocalPosition;

      void main() {
        vProgress = uv.x;
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uPhase;
      uniform float uSpeed;
      uniform float uLength;
      uniform float uOpacity;
      uniform float uDirection;
      uniform float uHalo;
      uniform float uFocusBlur;
      uniform vec3 uPlanetCenter;
      uniform float uPlanetRadius;
      varying float vProgress;
      varying vec3 vLocalPosition;

      float planetOcclusion(vec3 p) {
        float disk = 1.0 - smoothstep(uPlanetRadius * 0.88, uPlanetRadius * 1.06, length(p.xy - uPlanetCenter.xy));
        return clamp(disk, 0.0, 1.0);
      }

      void main() {
        float head = fract(uPhase + uDirection * uTime * uSpeed);
        float behind = uDirection > 0.0
          ? mod(head - vProgress + 1.0, 1.0)
          : mod(vProgress - head + 1.0, 1.0);
        float tail = smoothstep(uLength, 0.0, behind);
        float headGlow = exp(-behind * behind * 9000.0);
        float taper = smoothstep(1.0, 0.18, behind / max(0.001, uLength));
        float shard = fract(sin((vProgress + uPhase * 3.71) * 957.31) * 43758.5453);
        float breakup = mix(0.82, 1.34, shard);
        float core = tail * taper * breakup;
        float angle = vProgress * 6.28318530718;
        float foreground = smoothstep(0.08, 0.95, -sin(angle));
        float background = smoothstep(0.15, 0.95, sin(angle));
        float lensBlur = uFocusBlur * max(foreground, background * 0.78);
        float alpha = mix(core * 0.76 + headGlow * 0.68, core * 0.28, uHalo) * uOpacity;
        alpha *= mix(0.72, 1.34, foreground);
        alpha *= mix(1.0, 0.68, lensBlur * (1.0 - uHalo));
        alpha *= mix(1.0, 1.28, lensBlur * uHalo);
        alpha *= 1.0 - planetOcclusion(vLocalPosition) * 0.99;

        if (alpha < 0.006) {
          discard;
        }

        vec3 hot = mix(uColor, vec3(1.0, 0.9, 1.0), clamp(headGlow * 0.18 + (1.0 - uHalo) * 0.025, 0.0, 1.0));
        float power = mix(2.35 + headGlow * 3.6, 1.02, uHalo) * mix(0.82, 1.2, foreground);
        power *= mix(1.0, 0.76, lensBlur * (1.0 - uHalo * 0.5));
        gl_FragColor = vec4(hot * power, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.runner = {
    orbit: { rx, ry, color, depth: options.depth || flatOrbitDepth(), focusBlur: options.focusBlur || 0 },
    phase: options.phase,
    speed: options.speed,
    direction: options.direction,
    layerZ: 0,
  };

  return mesh;
}

function createOrbitDust(orbits, count, occlusion = createPlanetOcclusionUniforms()) {
  const orbitData = new Float32Array(count * 2);
  const depthData = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);
  const zOffsets = new Float32Array(count);
  const focusData = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const orbit = orbits[Math.floor(Math.random() * orbits.length)];
    const i2 = i * 2;
    const i3 = i * 3;
    const i4 = i * 4;

    orbitData[i2] = orbit.rx;
    orbitData[i2 + 1] = orbit.ry;
    depthData[i4] = orbit.depth.z;
    depthData[i4 + 1] = orbit.depth.warp;
    depthData[i4 + 2] = orbit.depth.phase;
    depthData[i4 + 3] = orbit.depth.radial;
    focusData[i] = orbit.focusBlur || 0;
    const clustered = Math.random() < 0.64;
    const clusterCenter =
      (Math.floor(Math.random() * 14) / 14 + orbit.gradientT * 0.11) * Math.PI * 2;
    phases[i] = clustered
      ? clusterCenter + (Math.random() - 0.5) * (0.16 + Math.random() * 0.22)
      : Math.random() * Math.PI * 2;
    speeds[i] =
      (Math.random() > 0.12 ? 1 : -1) *
      (clustered ? 0.035 + Math.random() * 0.07 : 0.05 + Math.random() * 0.12);
    offsets[i] = (Math.random() - 0.5) * (clustered ? 0.26 : 0.18);
    zOffsets[i] = (Math.random() - 0.5) * (clustered ? 0.34 : 0.22);

    const color = orbit.color
      .clone()
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.38)
      .multiplyScalar(1.18);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = clustered ? 0.42 + Math.random() * 1.7 : 0.5 + Math.random() * 1.85;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbitData, 2));
  geometry.setAttribute("aDepth", new THREE.BufferAttribute(depthData, 4));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
  geometry.setAttribute("aZ", new THREE.BufferAttribute(zOffsets, 1));
  geometry.setAttribute("aFocusBlur", new THREE.BufferAttribute(focusData, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uPlanetCenter: occlusion.center,
      uPlanetRadius: occlusion.radius,
    },
    vertexShader: `
      attribute vec2 aOrbit;
      attribute vec4 aDepth;
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aOffset;
      attribute float aZ;
      attribute float aFocusBlur;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPlanetFade;
      uniform float uTime;
      uniform vec3 uPlanetCenter;
      uniform float uPlanetRadius;

      void main() {
        float angle = aPhase + uTime * aSpeed;
        float radial =
          sin(angle * 5.0 + aDepth.z) * aDepth.w +
          sin(angle * 9.0 - aDepth.z * 0.7) * aDepth.w * 0.45;
        vec3 p = vec3(
          cos(angle) * (aOrbit.x + aOffset + radial),
          sin(angle) * (aOrbit.y + aOffset * 0.42 + radial * 0.42),
          aDepth.x +
            sin(angle * 2.0 + aDepth.z) * aDepth.y +
            sin(angle * 3.2 - aDepth.z * 0.6) * aDepth.y * 0.35 +
            aZ +
            sin(angle * 2.0 + aPhase) * 0.022
        );
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float foreground = smoothstep(0.08, 0.95, -sin(angle));
        float background = smoothstep(0.15, 0.95, sin(angle));
        float lensBlur = aFocusBlur * max(foreground, background * 0.76);
        gl_PointSize = aSize * (100.0 / max(0.1, -mvPosition.z)) * (1.0 + lensBlur * 1.85);
        vColor = color;
        float disk = 1.0 - smoothstep(uPlanetRadius * 0.9, uPlanetRadius * 1.06, length(p.xy - uPlanetCenter.xy));
        vPlanetFade = 1.0 - clamp(disk, 0.0, 1.0);
        vAlpha =
          (0.55 + sin(uTime * 2.0 + aPhase) * 0.24) *
          mix(0.78, 1.24, foreground) *
          mix(1.0, 0.62, lensBlur);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPlanetFade;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        float core = smoothstep(0.5, 0.02, dist);
        float rayX = smoothstep(0.45, 0.0, abs(uv.x)) * smoothstep(0.5, 0.02, abs(uv.y));
        float rayY = smoothstep(0.45, 0.0, abs(uv.y)) * smoothstep(0.5, 0.02, abs(uv.x));
        float alpha = max(core, (rayX + rayY) * 0.18) * vAlpha * vPlanetFade;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor * 3.05, alpha * 1.28);
      }
    `,
  });

  return {
    geometry,
    material,
    points: new THREE.Points(geometry, material),
  };
}

function createTrailSparks(trails, count, occlusion = createPlanetOcclusionUniforms()) {
  const orbitData = new Float32Array(count * 2);
  const depthData = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const directions = new Float32Array(count);
  const lags = new Float32Array(count);
  const spreads = new Float32Array(count);
  const sizes = new Float32Array(count);
  const zOffsets = new Float32Array(count);
  const seeds = new Float32Array(count);
  const focusData = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const runner = trails[Math.floor(Math.random() * trails.length)].userData.runner;
    const i2 = i * 2;
    const i3 = i * 3;
    const i4 = i * 4;
    const color = runner.orbit.color
      .clone()
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.34)
      .multiplyScalar(1.22);

    orbitData[i2] = runner.orbit.rx;
    orbitData[i2 + 1] = runner.orbit.ry;
    depthData[i4] = runner.orbit.depth.z + runner.layerZ;
    depthData[i4 + 1] = runner.orbit.depth.warp;
    depthData[i4 + 2] = runner.orbit.depth.phase;
    depthData[i4 + 3] = runner.orbit.depth.radial;
    focusData[i] = runner.orbit.focusBlur || 0;
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    phases[i] = runner.phase;
    speeds[i] = runner.speed * (0.88 + Math.random() * 0.22);
    directions[i] = runner.direction;
    lags[i] = Math.pow(Math.random(), 2.45) * 0.72;
    spreads[i] = (Math.random() - 0.5) * (0.14 + Math.random() * 0.42);
    sizes[i] = 0.55 + Math.random() * 3.05;
    zOffsets[i] = (Math.random() - 0.5) * 0.3;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbitData, 2));
  geometry.setAttribute("aDepth", new THREE.BufferAttribute(depthData, 4));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aDirection", new THREE.BufferAttribute(directions, 1));
  geometry.setAttribute("aLag", new THREE.BufferAttribute(lags, 1));
  geometry.setAttribute("aSpread", new THREE.BufferAttribute(spreads, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aZ", new THREE.BufferAttribute(zOffsets, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aFocusBlur", new THREE.BufferAttribute(focusData, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uPlanetCenter: occlusion.center,
      uPlanetRadius: occlusion.radius,
    },
    vertexShader: `
      attribute vec2 aOrbit;
      attribute vec4 aDepth;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aDirection;
      attribute float aLag;
      attribute float aSpread;
      attribute float aSize;
      attribute float aZ;
      attribute float aSeed;
      attribute float aFocusBlur;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPlanetFade;
      uniform float uTime;
      uniform vec3 uPlanetCenter;
      uniform float uPlanetRadius;

      void main() {
        float head = (aPhase + uTime * aSpeed * aDirection) * 6.28318530718;
        float lag = aLag * 6.28318530718;
        float angle = head - lag * aDirection + sin(aSeed + uTime * 0.9) * 0.018;
        float flutter = sin(aSeed * 2.7 + uTime * 1.6) * aSpread;
        float radial =
          sin(angle * 5.0 + aDepth.z) * aDepth.w +
          sin(angle * 9.0 - aDepth.z * 0.7) * aDepth.w * 0.45;
        vec3 p = vec3(
          cos(angle) * (aOrbit.x + flutter + radial),
          sin(angle) * (aOrbit.y + flutter * 0.55 + radial * 0.42),
          aDepth.x +
            sin(angle * 2.0 + aDepth.z) * aDepth.y +
            sin(angle * 3.2 - aDepth.z * 0.6) * aDepth.y * 0.35 +
            aZ +
            sin(angle * 2.0 + aSeed) * 0.04
        );
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float foreground = smoothstep(0.08, 0.95, -sin(angle));
        float background = smoothstep(0.15, 0.95, sin(angle));
        float lensBlur = aFocusBlur * max(foreground, background * 0.78);
        gl_PointSize = aSize * (122.0 / max(0.1, -mvPosition.z)) * (1.0 + lensBlur * 1.65);
        vColor = color;
        float disk = 1.0 - smoothstep(uPlanetRadius * 0.9, uPlanetRadius * 1.06, length(p.xy - uPlanetCenter.xy));
        vPlanetFade = 1.0 - clamp(disk, 0.0, 1.0);
        vAlpha =
          pow(1.0 - clamp(aLag / 0.78, 0.0, 1.0), 1.35) *
          (0.86 + sin(uTime * 4.0 + aSeed) * 0.24) *
          mix(0.78, 1.36, foreground) *
          mix(1.0, 0.7, lensBlur);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPlanetFade;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float core = smoothstep(0.5, 0.02, length(uv));
        if (core < 0.01) discard;
        gl_FragColor = vec4(vColor * 4.35, core * vAlpha * vPlanetFade * 1.12);
      }
    `,
  });

  return {
    geometry,
    material,
    points: new THREE.Points(geometry, material),
  };
}

function createOrbitSprites(trails) {
  const texture = createStarTexture();
  const sprites = [];

  for (let i = 0; i < trails.length; i += 1) {
    if (i % 4 !== 0 && Math.random() > 0.34) {
      continue;
    }

    const runner = trails[i].userData.runner;
    const spriteColor = runner.orbit.color.clone().lerp(new THREE.Color("#ffffff"), 0.12);
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: spriteColor,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    const width = 0.32 + Math.random() * 0.54;
    sprite.userData = {
      runner,
      width,
      height: width * (0.16 + Math.random() * 0.1),
      opacity: 0.18 + Math.random() * 0.2,
      twinkle: 1.2 + Math.random() * 2.8,
      phase: Math.random() * Math.PI * 2,
      rotationJitter: (Math.random() - 0.5) * 0.18,
      layerZ: runner.layerZ + (Math.random() - 0.5) * 0.08,
      focusBlur: runner.orbit.focusBlur || 0,
    };
    sprites.push(sprite);
  }

  return sprites;
}

function createPlanet({ palette }) {
  const group = new THREE.Group();
  group.position.set(3.35, 0.92, 0.02);
  const inner = samplePalette(palette, 1);
  const mid = samplePalette(palette, 0.6);
  const outer = samplePalette(palette, 0);
  const planetRadius = 1.56;
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createAuraTexture(),
      color: inner.clone().lerp(outer, 0.16),
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    }),
  );
  aura.position.set(0.35, 0.18, -0.9);
  aura.scale.set(7, 7, 1);
  aura.userData.baseScale = aura.scale.clone();
  aura.userData.baseOpacity = aura.material.opacity;

  const rayFan = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createRayFanTexture(),
      color: inner.clone().lerp(new THREE.Color("#ffffff"), 0.05),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    }),
  );
  rayFan.position.set(0.48, 0.2, -1.15);
  rayFan.scale.set(7.8, 5.2, 1);

  const softHalo = createPlanetSoftHalo(inner, mid, outer);
  const limbBokeh = createPlanetLimbBokeh(palette, planetRadius);

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius, 56, 36),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.5 },
        uRimColor: { value: inner.clone().lerp(new THREE.Color("#ffffff"), 0.05) },
        uShadeColor: { value: mid.clone().multiplyScalar(0.012) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPosition;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mvPosition.xyz);
          vPosition = position;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uRimColor;
        uniform vec3 uShadeColor;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPosition;

        void main() {
          float facing = max(dot(vNormal, vView), 0.0);
          float rimBase = 1.0 - facing;
          float rim = smoothstep(0.79, 1.0, rimBase);
          float litArc = smoothstep(-0.18, 0.62, vNormal.y * 0.52 + vNormal.x * 0.34);
          float shade = smoothstep(-0.8, 0.85, vNormal.y * 0.6 + vNormal.x * 0.25);
          float pulse = sin((vPosition.y + vPosition.x) * 4.0 + uTime * 0.35) * 0.0025;
          vec3 core = mix(vec3(0.00004, 0.00002, 0.00012), uShadeColor * 0.018, shade);
          vec3 edge = uRimColor * rim * litArc * 2.15 * (0.86 + uPulse * 0.3);
          gl_FragColor = vec4(core + edge + pulse, 1.0);
        }
      `,
    }),
  );

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius * 1.07, 56, 36),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.5 },
        uOuterColor: { value: outer.clone().lerp(mid, 0.2) },
        uInnerColor: { value: inner.clone() },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uOuterColor;
        uniform vec3 uInnerColor;
        varying vec3 vNormal;
        varying vec3 vView;

        void main() {
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.7);
          vec3 color = mix(uInnerColor, uOuterColor, sin(uTime * 0.25) * 0.5 + 0.5);
          gl_FragColor = vec4(color * (1.72 + uPulse * 0.42), rim * (0.045 + uPulse * 0.045));
        }
      `,
    }),
  );

  const pinLights = createPlanetPinLights(palette);
  group.add(rayFan, aura, softHalo, glow, limbBokeh, surface, pinLights);

  return {
    group,
    rayFan,
    aura,
    softHalo,
    haloRing: softHalo,
    limbBokeh,
    glow,
    surface,
    pinLights,
  };
}

function createPlanetSoftHalo(inner, mid, outer) {
  const group = new THREE.Group();

  const backVeil = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createPlanetHaloTexture(),
      color: outer.clone().lerp(mid, 0.45).lerp(new THREE.Color("#ffffff"), 0.08),
      transparent: true,
      opacity: 0.018,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    }),
  );
  backVeil.position.set(0.06, 0.04, -0.38);
  backVeil.scale.set(4.75, 4.18, 1);
  backVeil.userData.baseOpacity = backVeil.material.opacity;

  const hotEdge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createPlanetHaloTexture(),
      color: inner.clone().lerp(new THREE.Color("#ffffff"), 0.18),
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    }),
  );
  hotEdge.position.set(0.03, 0.02, -0.24);
  hotEdge.scale.set(4.18, 3.72, 1);
  hotEdge.material.rotation = -0.08;
  hotEdge.userData.baseOpacity = hotEdge.material.opacity;

  group.add(backVeil, hotEdge);
  return group;
}

function createPlanetLimbBokeh(palette, planetRadius) {
  const count = 96;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const cluster = Math.random();
    const angle =
      cluster < 0.58
        ? -0.28 + Math.random() * 2.42
        : Math.random() * Math.PI * 2;
    const radius = planetRadius * (1.02 + Math.pow(Math.random(), 0.72) * 0.36);
    const vertical = 0.92 + Math.random() * 0.14;
    const haze = Math.random() < 0.36 ? 0.22 + Math.random() * 0.28 : 0;

    positions[i3] = Math.cos(angle) * (radius + haze);
    positions[i3 + 1] = Math.sin(angle) * radius * vertical + (Math.random() - 0.5) * 0.08;
    positions[i3 + 2] = -0.34 - Math.random() * 0.72;

    const color = samplePalette(palette, 0.54 + Math.random() * 0.46)
      .lerp(new THREE.Color("#ffffff"), 0.12 + Math.random() * 0.28)
      .multiplyScalar(1.45);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() < 0.18 ? 0.74 + Math.random() * 0.72 : 0.26 + Math.random() * 0.48;
    phases[i] = Math.random() * Math.PI * 2;
    alphas[i] = 0.08 + Math.random() * 0.28;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute vec3 color;
      attribute float aSize;
      attribute float aPhase;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;

      uniform float uTime;

      void main() {
        float shimmer = 0.78 + sin(uTime * 0.65 + aPhase) * 0.22;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (270.0 / max(5.0, -mvPosition.z)) * shimmer;
        gl_Position = projectionMatrix * mvPosition;
        vColor = color;
        vAlpha = aAlpha * shimmer;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float d = length(p);
        float disc = smoothstep(0.5, 0.04, d);
        float inner = smoothstep(0.18, 0.0, d);
        float edge = smoothstep(0.5, 0.33, d) * smoothstep(0.18, 0.38, d);
        float alpha = (disc * 0.34 + edge * 0.3 + inner * 0.1) * vAlpha;
        gl_FragColor = vec4(vColor * (1.18 + inner * 0.85), alpha);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

function createPlanetPinLights(palette) {
  const count = 440;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 2);
    const radius = 1.575;
    positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i3 + 1] = Math.cos(phi) * radius;
    positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

    const color = samplePalette(palette, Math.random() * 0.55 + 0.45)
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.32)
      .multiplyScalar(1.55);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.012,
      transparent: true,
      opacity: 0.34,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function createStarTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 96;
  canvasTexture.height = 96;
  const ctx = canvasTexture.getContext("2d");
  const center = 48;

  const glow = ctx.createRadialGradient(center, center, 0, center, center, 45);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  glow.addColorStop(0.18, "rgba(255, 255, 255, 0.54)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 96, 96);

  const streak = ctx.createLinearGradient(4, 48, 92, 48);
  streak.addColorStop(0, "rgba(255, 255, 255, 0)");
  streak.addColorStop(0.42, "rgba(255, 255, 255, 0.56)");
  streak.addColorStop(0.5, "rgba(255, 255, 255, 0.98)");
  streak.addColorStop(0.58, "rgba(255, 255, 255, 0.56)");
  streak.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = streak;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(4, 48);
  ctx.lineTo(92, 48);
  ctx.stroke();

  const vertical = ctx.createLinearGradient(48, 20, 48, 76);
  vertical.addColorStop(0, "rgba(255, 255, 255, 0)");
  vertical.addColorStop(0.5, "rgba(255, 255, 255, 0.34)");
  vertical.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = vertical;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 20);
  ctx.lineTo(48, 76);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(48, 48, 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlanetHaloTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 512;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  const center = 256;

  ctx.translate(center, center);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let i = 0; i < 46; i += 1) {
    const radius = 172 + Math.random() * 27;
    const start = -0.32 + Math.random() * Math.PI * 1.48;
    const arc = 0.035 + Math.random() * 0.28;
    const alpha = 0.01 + Math.random() * 0.03;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 1.2 + Math.random() * 8.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * (0.88 + Math.random() * 0.06), -0.03, start, start + arc);
    ctx.stroke();
  }

  for (let i = 0; i < 34; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 160 + Math.random() * 58;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.9;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14 + Math.random() * 28);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 36, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "destination-out";
  const hollow = ctx.createRadialGradient(0, 0, 128, 0, 0, 170);
  hollow.addColorStop(0, "rgba(0, 0, 0, 1)");
  hollow.addColorStop(0.62, "rgba(0, 0, 0, 0.88)");
  hollow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = hollow;
  ctx.beginPath();
  ctx.arc(0, 0, 185, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createAuraTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 512;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  const center = 256;

  const glow = ctx.createRadialGradient(center, center, 30, center, center, 252);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.34)");
  glow.addColorStop(0.28, "rgba(255, 128, 210, 0.28)");
  glow.addColorStop(0.62, "rgba(120, 80, 255, 0.11)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);

  ctx.translate(center, center);
  for (let i = 0; i < 72; i += 1) {
    const angle = -0.82 + (i / 71) * 1.55;
    const length = 185 + Math.random() * 180;
    const alpha = 0.032 + Math.random() * 0.052;
    const gradient = ctx.createLinearGradient(0, 0, Math.cos(angle) * length, Math.sin(angle) * length);
    gradient.addColorStop(0, `rgba(255, 170, 230, ${alpha})`);
    gradient.addColorStop(1, "rgba(255, 170, 230, 0)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5 + Math.random() * 9;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRayFanTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 512;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  const originX = 170;
  const originY = 260;

  ctx.translate(originX, originY);
  for (let i = 0; i < 96; i += 1) {
    const t = i / 95;
    const angle = -0.62 + t * 0.88 + (Math.random() - 0.5) * 0.035;
    const start = 48 + Math.random() * 22;
    const length = 230 + Math.random() * 270;
    const width = 1 + Math.random() * 8;
    const alpha = (0.018 + Math.random() * 0.038) * (1 - Math.abs(t - 0.42) * 0.55);
    const x1 = Math.cos(angle) * start;
    const y1 = Math.sin(angle) * start;
    const x2 = Math.cos(angle) * length;
    const y2 = Math.sin(angle) * length;
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, `rgba(255, 110, 205, ${alpha})`);
    gradient.addColorStop(0.55, `rgba(255, 110, 205, ${alpha * 0.55})`);
    gradient.addColorStop(1, "rgba(255, 110, 205, 0)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const softFan = ctx.createRadialGradient(0, 0, 42, 0, 0, 250);
  softFan.addColorStop(0, "rgba(255, 80, 180, 0)");
  softFan.addColorStop(0.22, "rgba(255, 80, 180, 0.035)");
  softFan.addColorStop(0.75, "rgba(80, 50, 255, 0.018)");
  softFan.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = softFan;
  ctx.fillRect(-originX, -originY, 512, 512);

  ctx.globalCompositeOperation = "destination-out";
  const hollow = ctx.createRadialGradient(0, 0, 0, 0, 0, 74);
  hollow.addColorStop(0, "rgba(0, 0, 0, 1)");
  hollow.addColorStop(0.72, "rgba(0, 0, 0, 0.85)");
  hollow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = hollow;
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createOrbitDepth(index, count) {
  const centered = index - (count - 1) * 0.5;
  const outer = index / Math.max(1, count - 1);

  return {
    z: centered * 0.082 + Math.sin(index * 1.37) * 0.13,
    warp: 0.028 + outer * 0.095 + Math.sin(index * 0.83) * 0.01,
    radial: 0.012 + outer * 0.046,
    phase: Math.random() * Math.PI * 2,
  };
}

function orbitFocusBlur(index, count) {
  const outer = index / Math.max(1, count - 1);
  const outerBlur = smoothStep01((outer - 0.34) / 0.66);
  const innermostBlur = smoothStep01((0.08 - outer) / 0.08) * 0.18;

  return clamp(outerBlur + innermostBlur, 0, 1);
}

function flatOrbitDepth() {
  return { z: 0, warp: 0, radial: 0, phase: 0 };
}

function offsetDepth(depth, zOffset) {
  return {
    z: depth.z + zOffset,
    warp: depth.warp,
    radial: depth.radial,
    phase: depth.phase,
  };
}

function orbitDepthAt(angle, depth) {
  return (
    depth.z +
    Math.sin(angle * 2.0 + depth.phase) * depth.warp +
    Math.sin(angle * 3.2 - depth.phase * 0.6) * depth.warp * 0.35
  );
}

function orbitRadialAt(angle, depth) {
  return (
    Math.sin(angle * 5 + depth.phase) * depth.radial +
    Math.sin(angle * 9 - depth.phase * 0.7) * depth.radial * 0.45
  );
}

function createPlanetOcclusionUniforms() {
  return {
    center: { value: new THREE.Vector3(0, 0, 0) },
    radius: { value: 1.58 },
  };
}

function readPalette(rawPalette, themeName) {
  const theme = THEMES[themeName] || THEMES.nebula;
  const parsed = parsePalette(rawPalette);
  const colors = parsed.length >= 2 ? parsed : theme;
  return colors.map((color) => new THREE.Color(color));
}

function parsePalette(rawPalette) {
  if (!rawPalette) {
    return [];
  }

  return rawPalette
    .split(/[|,;]/)
    .map((part) => part.trim())
    .map((part) => (part.startsWith("#") ? part : `#${part.replace(/^0x/i, "")}`))
    .filter((part) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(part));
}

function samplePalette(palette, t) {
  if (palette.length === 1) {
    return palette[0].clone();
  }

  const position = clamp(t, 0, 1) * (palette.length - 1);
  const index = Math.min(palette.length - 2, Math.floor(position));
  const localT = position - index;
  return palette[index].clone().lerp(palette[index + 1], localT);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function smoothStep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(value) {
  return value - Math.floor(value);
}
