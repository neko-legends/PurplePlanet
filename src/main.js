import * as THREE from "three";
import "./styles.css";

const canvas = document.querySelector("#wallpaper");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: false,
  antialias: false,
  powerPreference: "low-power",
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x03010b, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060112, 0.018);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
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

const backdrop = createBackdrop(settings);
scene.add(backdrop.points);

const system = new THREE.Group();
system.rotation.x = -0.04;
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

  orbitSystem.dust.material.uniforms.uTime.value = time;
  for (const trail of orbitSystem.trails) {
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
    sprite.material.rotation = sprite.userData.rotation + time * sprite.userData.rotationSpeed;
    sprite.scale.setScalar(sprite.userData.size);
  }

  renderer.render(scene, camera);
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.fov = camera.aspect < 0.85 ? 60 : 55;
  camera.position.set(0, camera.aspect < 0.85 ? 8.8 : 5.4, camera.aspect < 0.85 ? 17.2 : 11.4);
  camera.lookAt(0, 0.2, 0);
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
  renderer.setSize(width, height, false);
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

function readSettings() {
  const params = new URLSearchParams(window.location.search);
  const quality = params.get("quality") || "balanced";
  const qualityMap = {
    low: { backdrop: 650, dust: 230, segments: 176 },
    balanced: { backdrop: 1100, dust: 420, segments: 232 },
    high: { backdrop: 1800, dust: 720, segments: 320 },
  };
  const selected = qualityMap[quality] || qualityMap.balanced;
  const themeName = params.get("theme") || "nebula";
  const palette = readPalette(params.get("palette"), themeName);

  return {
    ...selected,
    palette,
    themeName,
    speed: clamp(Number(params.get("speed") || 1), 0.2, 2),
    pixelRatio: clamp(Number(params.get("pixelRatio") || 1.25), 0.75, 2),
  };
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

function createOrbitSystem({ dust, segments, palette }) {
  const group = new THREE.Group();
  group.rotation.x = -1.05;
  group.rotation.z = -0.08;

  const orbits = [];
  const trails = [];
  const orbitCount = 10;

  for (let i = 0; i < orbitCount; i += 1) {
    const rx = 2.65 + i * 0.9;
    const ry = rx * (0.37 + i * 0.018);
    const gradientT = 1 - i / Math.max(1, orbitCount - 1);
    const color = samplePalette(palette, gradientT);
    const guideColor = color.clone().lerp(new THREE.Color("#18142f"), 0.48);
    const tube = 0.009 + i * 0.0016;
    const opacity = 0.055 - i * 0.0025;

    const glow = createOrbitTube(rx, ry, segments, tube * 3.4, guideColor, opacity * 0.22);
    const core = createOrbitTube(rx, ry, segments, tube, guideColor, opacity);
    glow.position.z = i * 0.018;
    core.position.z = i * 0.018 + 0.004;
    group.add(glow, core);

    const trailCount = i < 2 ? 2 : i < 6 ? 3 : 4;
    for (let j = 0; j < trailCount; j += 1) {
      const trailOptions = {
        phase: Math.random(),
        speed: 0.012 + Math.random() * 0.034 + i * 0.0015,
        length: 0.11 + Math.random() * 0.24 + (i > 5 ? 0.08 : 0),
        opacity: 0.5 + Math.random() * 0.32,
        direction: Math.random() > 0.18 ? 1 : -1,
      };
      const trail = createOrbitTrail(
        rx,
        ry,
        segments,
        tube * (0.9 + Math.random() * 1.7),
        color,
        trailOptions,
      );
      trail.position.z = i * 0.026 + 0.03 + j * 0.002;
      trail.userData.runner.z = trail.position.z + 0.06;
      group.add(trail);
      trails.push(trail);
    }

    orbits.push({ rx, ry, color, guideColor, gradientT });
  }

  const dustCloud = createOrbitDust(orbits, dust);
  group.add(dustCloud.points);

  const sprites = createOrbitSprites(trails);
  for (const sprite of sprites) {
    group.add(sprite);
  }

  return {
    group,
    dust: dustCloud,
    sprites,
    trails,
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
      varying float vProgress;

      void main() {
        float head = fract(uPhase + uDirection * uTime * uSpeed);
        float behind = uDirection > 0.0
          ? mod(head - vProgress + 1.0, 1.0)
          : mod(vProgress - head + 1.0, 1.0);
        float tail = smoothstep(uLength, 0.0, behind);
        float headGlow = exp(-behind * behind * 18000.0);
        float taper = smoothstep(1.0, 0.18, behind / max(0.001, uLength));
        float alpha = (tail * taper * 0.76 + headGlow * 0.68) * uOpacity;

        if (alpha < 0.006) {
          discard;
        }

        vec3 hot = mix(uColor, vec3(1.0), clamp(headGlow * 0.55, 0.0, 1.0));
        gl_FragColor = vec4(hot * (0.9 + headGlow * 0.9), alpha);
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

    const color = orbit.color.clone().lerp(new THREE.Color("#ffffff"), Math.random() * 0.48);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = 0.9 + Math.random() * 2.6;
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
        gl_PointSize = aSize * (92.0 / max(0.1, -mvPosition.z));
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
        gl_FragColor = vec4(vColor, alpha);
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
    const runner = trails[i].userData.runner;
    const spriteColor = runner.orbit.color.clone().lerp(new THREE.Color("#ffffff"), 0.42);
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
    sprite.userData = {
      runner,
      size: 0.34 + Math.random() * 0.34,
      opacity: 0.72 + Math.random() * 0.28,
      twinkle: 1.2 + Math.random() * 2.8,
      phase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.22,
      z: runner.z + (Math.random() - 0.5) * 0.05,
    };
    sprites.push(sprite);
  }

  return sprites;
}

function createPlanet({ palette }) {
  const group = new THREE.Group();
  group.position.set(0.32, 0.58, 0.02);
  const inner = samplePalette(palette, 1);
  const mid = samplePalette(palette, 0.6);
  const outer = samplePalette(palette, 0);

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(1.88, 56, 36),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRimColor: { value: inner.clone().lerp(new THREE.Color("#ffffff"), 0.05) },
        uShadeColor: { value: mid.clone().multiplyScalar(0.2) },
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
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
          float shade = smoothstep(-0.8, 0.85, vNormal.y * 0.6 + vNormal.x * 0.25);
          float pulse = sin((vPosition.y + vPosition.x) * 4.0 + uTime * 0.35) * 0.025;
          vec3 core = mix(vec3(0.012, 0.004, 0.026), uShadeColor, shade);
          vec3 edge = uRimColor * rim * 1.35;
          gl_FragColor = vec4(core + edge + pulse, 1.0);
        }
      `,
    }),
  );

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 56, 36),
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
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 1.4);
          vec3 color = mix(uInnerColor, uOuterColor, sin(uTime * 0.25) * 0.5 + 0.5);
          gl_FragColor = vec4(color, rim * 0.42);
        }
      `,
    }),
  );

  const pinLights = createPlanetPinLights(palette);
  group.add(glow, surface, pinLights);

  return {
    group,
    glow,
    surface,
    pinLights,
  };
}

function createPlanetPinLights(palette) {
  const count = 72;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 2);
    const radius = 1.91;
    positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i3 + 1] = Math.cos(phi) * radius;
    positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

    const color = samplePalette(palette, Math.random()).lerp(new THREE.Color("#ffffff"), 0.48);
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
      size: 0.055,
      transparent: true,
      opacity: 0.9,
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
  glow.addColorStop(0.28, "rgba(255, 255, 255, 0.62)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 96, 96);

  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 35 : 13;
    const angle = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fill();

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
