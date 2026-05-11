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
  constructor(rx, ry, start, length) {
    super();
    this.rx = rx;
    this.ry = ry;
    this.start = start;
    this.length = length;
  }

  getPoint(t) {
    const angle = this.start + this.length * t;
    return new THREE.Vector3(Math.cos(angle) * this.rx, Math.sin(angle) * this.ry, 0);
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

  orbitSystem.dust.material.uniforms.uTime.value = time;
  orbitSystem.sparkCloud.material.uniforms.uTime.value = time;
  backdrop.material.uniforms.uTime.value = time * 0.45;
  nebula.material.uniforms.uTime.value = time * 0.06;
  planet.surface.material.uniforms.uTime.value = time;
  planet.glow.material.uniforms.uTime.value = time;
  planet.aura.material.rotation = time * 0.025;

  for (const trail of orbitSystem.allTrails) {
    trail.material.uniforms.uTime.value = time;
  }

  for (const sprite of orbitSystem.sprites) {
    const runner = sprite.userData.runner;
    const orbit = runner.orbit;
    const progress = fract(runner.phase + runner.direction * time * runner.speed);
    const angle = progress * Math.PI * 2;
    sprite.position.set(
      Math.cos(angle) * orbit.rx,
      Math.sin(angle) * orbit.ry,
      sprite.userData.z,
    );
    sprite.material.opacity =
      sprite.userData.opacity *
      (0.72 + Math.sin(time * sprite.userData.twinkle + sprite.userData.phase) * 0.28);
    sprite.material.rotation =
      angle - Math.PI / 2 + sprite.userData.rotationJitter + Math.sin(time + sprite.userData.phase) * 0.04;
    sprite.scale.set(sprite.userData.width, sprite.userData.height, 1);
  }

  updateCameraSway(cameraTime);
  composer.render();
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.fov = camera.aspect < 0.85 ? 61 : 58;
  cameraBasePosition.set(
    camera.aspect < 0.85 ? 0 : -0.34,
    camera.aspect < 0.85 ? 8.8 : 3.9,
    camera.aspect < 0.85 ? 17.2 : 12.6,
  );
  cameraBaseTarget.set(camera.aspect < 0.85 ? 0 : 0.42, 0.18, 0);
  camera.position.copy(cameraBasePosition);
  camera.lookAt(cameraBaseTarget);
  camera.updateProjectionMatrix();

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
      dust: 16000,
      sparkDust: 26000,
      segments: 420,
      exposure: 0.82,
      bloomStrength: 0.58,
      bloomRadius: 0.5,
      bloomThreshold: 0.54,
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
        float cloud = smoothstep(0.26, 0.92, broad + detail * 0.46);
        float shadow = smoothstep(0.48, 0.86, darkVeil);
        float voids = smoothstep(0.54, 0.79, blackDust) * smoothstep(0.04, 0.45, uv.y);
        float verticalBand = smoothstep(0.7, -0.1, abs(p.y + 0.06));
        float dustBand = smoothstep(0.58, 0.0, abs(p.y + 0.16 - p.x * 0.055));
        float planetGlow = exp(-length((uv - vec2(0.64, 0.54)) * vec2(2.2, 3.0)) * 3.85);
        float rays = rayFan(vec2(0.62, 0.54), uv, 1.0);
        float vignette = smoothstep(1.05, 0.22, length(p));

        vec3 base = vec3(0.0015, 0.002, 0.009);
        vec3 blueMist = uOuter * (0.012 + cloud * 0.046 + dustBand * 0.014);
        vec3 purpleMist = uMid * (cloud * verticalBand * 0.044 + dustBand * 0.018);
        vec3 hotMist = uInner * (planetGlow * 0.084 + rays * 0.105);
        vec3 color = base + blueMist + purpleMist + hotMist;
        color *= mix(1.0, 0.3, shadow * 0.72 + voids * 0.86);
        color *= 0.08 + vignette * 0.58;

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

  const orbits = [];
  const trails = [];
  const allTrails = [];
  const orbitCount = 18;

  for (let i = 0; i < orbitCount; i += 1) {
    const rx = 2.25 + i * 0.61;
    const ry = rx * (0.33 + i * 0.011);
    const gradientT = 1 - i / Math.max(1, orbitCount - 1);
    const color = samplePalette(palette, gradientT);
    const guideColor = color.clone().lerp(new THREE.Color("#79819a"), 0.86);
    const tube = 0.0048 + i * 0.00072;
    const opacity = Math.max(0.0028, 0.011 - i * 0.00028);

    const glow = createOrbitTube(rx, ry, segments, tube * 6.2, guideColor, opacity * 0.07);
    const core = createOrbitTube(rx, ry, segments, tube, guideColor, opacity);
    glow.position.z = i * 0.018;
    core.position.z = i * 0.018 + 0.004;
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
          halo: 1,
          length: trailOptions.length * 1.2,
          opacity: trailOptions.opacity * 0.12,
        },
      );
      halo.position.z = i * 0.026 + 0.024 + j * 0.002;
      group.add(halo);
      allTrails.push(halo);

      const trail = createOrbitTrail(
        rx,
        ry,
        segments,
        tube * (0.7 + Math.random() * 1.2),
        color,
        { ...trailOptions, halo: 0 },
      );
      trail.position.z = i * 0.026 + 0.03 + j * 0.002;
      trail.userData.runner.z = trail.position.z + 0.06;
      group.add(trail);
      trails.push(trail);
      allTrails.push(trail);
    }

    orbits.push({ rx, ry, color, guideColor, gradientT });
  }

  const dustCloud = createOrbitDust(orbits, dust);
  group.add(dustCloud.points);

  const sparkCloud = createTrailSparks(trails, sparkDust);
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
  };
}

function createOrbitTube(rx, ry, segments, radius, color, opacity) {
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, 0, Math.PI * 2),
    segments,
    radius,
    5,
    true,
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

function createOrbitArc(rx, ry, segments, radius, color, opacity, start, length) {
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, start, length),
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
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, 0, Math.PI * 2),
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
    },
    vertexShader: `
      varying float vProgress;

      void main() {
        vProgress = uv.x;
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
      varying float vProgress;

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
        float alpha = mix(core * 0.76 + headGlow * 0.68, core * 0.28, uHalo) * uOpacity;

        if (alpha < 0.006) {
          discard;
        }

        vec3 hot = mix(uColor, vec3(1.0, 0.9, 1.0), clamp(headGlow * 0.18 + (1.0 - uHalo) * 0.025, 0.0, 1.0));
        float power = mix(2.35 + headGlow * 3.6, 1.02, uHalo);
        gl_FragColor = vec4(hot * power, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.runner = {
    orbit: { rx, ry, color },
    phase: options.phase,
    speed: options.speed,
    direction: options.direction,
    z: 0,
  };

  return mesh;
}

function createOrbitDust(orbits, count) {
  const orbitData = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);
  const zOffsets = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const orbit = orbits[Math.floor(Math.random() * orbits.length)];
    const i2 = i * 2;
    const i3 = i * 3;

    orbitData[i2] = orbit.rx;
    orbitData[i2 + 1] = orbit.ry;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = (Math.random() > 0.12 ? 1 : -1) * (0.045 + Math.random() * 0.115);
    offsets[i] = (Math.random() - 0.5) * 0.2;
    zOffsets[i] = (Math.random() - 0.5) * 0.18;

    const color = orbit.color
      .clone()
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.38)
      .multiplyScalar(1.18);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = 0.55 + Math.random() * 2.05;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbitData, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
  geometry.setAttribute("aZ", new THREE.BufferAttribute(zOffsets, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute vec2 aOrbit;
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aOffset;
      attribute float aZ;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;

      void main() {
        float angle = aPhase + uTime * aSpeed;
        vec3 p = vec3(
          cos(angle) * (aOrbit.x + aOffset),
          sin(angle) * (aOrbit.y + aOffset * 0.42),
          aZ + sin(angle * 2.0 + aPhase) * 0.018
        );
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * (100.0 / max(0.1, -mvPosition.z));
        vColor = color;
        vAlpha = 0.55 + sin(uTime * 2.0 + aPhase) * 0.24;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        float core = smoothstep(0.5, 0.02, dist);
        float rayX = smoothstep(0.45, 0.0, abs(uv.x)) * smoothstep(0.5, 0.02, abs(uv.y));
        float rayY = smoothstep(0.45, 0.0, abs(uv.y)) * smoothstep(0.5, 0.02, abs(uv.x));
        float alpha = max(core, (rayX + rayY) * 0.18) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor * 2.35, alpha * 1.12);
      }
    `,
  });

  return {
    geometry,
    material,
    points: new THREE.Points(geometry, material),
  };
}

function createTrailSparks(trails, count) {
  const orbitData = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const directions = new Float32Array(count);
  const lags = new Float32Array(count);
  const spreads = new Float32Array(count);
  const sizes = new Float32Array(count);
  const zOffsets = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const runner = trails[Math.floor(Math.random() * trails.length)].userData.runner;
    const i2 = i * 2;
    const i3 = i * 3;
    const color = runner.orbit.color
      .clone()
      .lerp(new THREE.Color("#ffffff"), Math.random() * 0.34)
      .multiplyScalar(1.22);

    orbitData[i2] = runner.orbit.rx;
    orbitData[i2 + 1] = runner.orbit.ry;
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    phases[i] = runner.phase;
    speeds[i] = runner.speed * (0.88 + Math.random() * 0.22);
    directions[i] = runner.direction;
    lags[i] = Math.pow(Math.random(), 3.1) * 0.58;
    spreads[i] = (Math.random() - 0.5) * (0.1 + Math.random() * 0.32);
    sizes[i] = 0.45 + Math.random() * 2.35;
    zOffsets[i] = runner.z + (Math.random() - 0.5) * 0.22;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbitData, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aDirection", new THREE.BufferAttribute(directions, 1));
  geometry.setAttribute("aLag", new THREE.BufferAttribute(lags, 1));
  geometry.setAttribute("aSpread", new THREE.BufferAttribute(spreads, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aZ", new THREE.BufferAttribute(zOffsets, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute vec2 aOrbit;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aDirection;
      attribute float aLag;
      attribute float aSpread;
      attribute float aSize;
      attribute float aZ;
      attribute float aSeed;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;

      void main() {
        float head = (aPhase + uTime * aSpeed * aDirection) * 6.28318530718;
        float lag = aLag * 6.28318530718;
        float angle = head - lag * aDirection + sin(aSeed + uTime * 0.9) * 0.018;
        float flutter = sin(aSeed * 2.7 + uTime * 1.6) * aSpread;
        vec3 p = vec3(
          cos(angle) * (aOrbit.x + flutter),
          sin(angle) * (aOrbit.y + flutter * 0.55),
          aZ + sin(angle * 2.0 + aSeed) * 0.035
        );
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * (122.0 / max(0.1, -mvPosition.z));
        vColor = color;
        vAlpha = pow(1.0 - clamp(aLag / 0.62, 0.0, 1.0), 1.7) * (0.7 + sin(uTime * 4.0 + aSeed) * 0.24);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float core = smoothstep(0.5, 0.02, length(uv));
        if (core < 0.01) discard;
        gl_FragColor = vec4(vColor * 3.55, core * vAlpha);
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
      depthTest: false,
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
      z: runner.z + (Math.random() - 0.5) * 0.05,
    };
    sprites.push(sprite);
  }

  return sprites;
}

function createPlanet({ palette }) {
  const group = new THREE.Group();
  group.position.set(1.7, 0.92, 0.02);
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

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.88, 0.01, 8, 192),
    new THREE.MeshBasicMaterial({
      color: inner.clone().lerp(new THREE.Color("#ffffff"), 0.16),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  haloRing.position.z = -0.16;

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius, 56, 36),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
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
        uniform vec3 uRimColor;
        uniform vec3 uShadeColor;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPosition;

        void main() {
          float facing = max(dot(vNormal, vView), 0.0);
          float rimBase = 1.0 - facing;
          float rim = smoothstep(0.68, 0.97, rimBase);
          float litArc = smoothstep(-0.18, 0.62, vNormal.y * 0.52 + vNormal.x * 0.34);
          float shade = smoothstep(-0.8, 0.85, vNormal.y * 0.6 + vNormal.x * 0.25);
          float pulse = sin((vPosition.y + vPosition.x) * 4.0 + uTime * 0.35) * 0.0025;
          vec3 core = mix(vec3(0.00004, 0.00002, 0.00012), uShadeColor * 0.018, shade);
          vec3 edge = uRimColor * rim * litArc * 3.65;
          gl_FragColor = vec4(core + edge + pulse, 1.0);
        }
      `,
    }),
  );

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius * 1.12, 56, 36),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
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
        uniform vec3 uOuterColor;
        uniform vec3 uInnerColor;
        varying vec3 vNormal;
        varying vec3 vView;

        void main() {
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.35);
          vec3 color = mix(uInnerColor, uOuterColor, sin(uTime * 0.25) * 0.5 + 0.5);
          gl_FragColor = vec4(color * 2.35, rim * 0.18);
        }
      `,
    }),
  );

  const pinLights = createPlanetPinLights(palette);
  group.add(aura, haloRing, glow, surface, pinLights);

  return {
    group,
    aura,
    haloRing,
    glow,
    surface,
    pinLights,
  };
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

function fract(value) {
  return value - Math.floor(value);
}
