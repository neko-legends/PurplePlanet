import * as THREE from "three";
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import "./styles.css";

const canvas = document.querySelector("#wallpaper");
const music = setupMusic();
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
const cameraBasePosition = new THREE.Vector3();
const cameraBaseTarget = new THREE.Vector3(0, 0.2, 0);
const cameraSwayPosition = new THREE.Vector3();
const cameraSwayTarget = new THREE.Vector3();
const _swayOffset = new THREE.Vector3();
const planetWorldPosition = new THREE.Vector3();
const orbitVisualOffset = new THREE.Vector3();
const pointerUv = new THREE.Vector2(-1, -1);
const lastPointerUv = new THREE.Vector2(-1, -1);
const pointerScreen = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const WHITE = new THREE.Color("#ffffff");
const GUIDE_GREY = new THREE.Color("#79819a");
const THEMES = {
  nebula: ["#245dff", "#5146ff", "#8c35ff", "#f725d6", "#ff2f8a"],
  aurora: ["#2170ff", "#22dcff", "#6d52ff", "#e83cff", "#ff4f8f"],
  ultraviolet: ["#3425ff", "#664dff", "#9d42ff", "#d92fff", "#fff0ff"],
  plasma: ["#184cff", "#4545ff", "#922cff", "#ff1fb8", "#ff3758"],
  candy: ["#45dfff", "#5a7dff", "#ad5cff", "#ff66c7", "#ffd46f"],
};
const NEBULA_PLANE_WIDTH = 140;
const NEBULA_PLANE_HEIGHT = 90;
const NEBULA_PLANE_DISTANCE = 50;
const NEBULA_VIEWPORT_PADDING = 1.36;
const BACKDROP_SPREAD_FOV = 72;
const BACKDROP_SPREAD_ASPECT = 3.45;
const BACKDROP_SPREAD_PADDING = 1.18;
const BACKDROP_NEAR_Z = 36;
const BACKDROP_DEPTH = 54;
const settings = readSettings();
const runtimeStats = {
  targetFps: settings.fps,
  renderedFrames: 0,
  skippedFrames: 0,
  measuredFps: 0,
  lastFrameMs: 0,
  sampleStartedAt: performance.now(),
  sampleFrames: 0,
};
window.PurplePlanet = {
  settings: {
    quality: settings.quality,
    fps: settings.fps,
    pixelRatio: settings.pixelRatio,
  },
  stats: runtimeStats,
};
renderer.toneMapping = THREE.NoToneMapping;

scene.add(camera);
const renderPipeline = createRenderPipeline(settings);

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
nebula.mesh.userData.basePos = nebula.mesh.position.clone();

const backdrop = createBackdrop(settings);
scene.add(backdrop.points);

const meteors = createMeteors(settings);
for (const m of meteors.meshes) scene.add(m);

const system = new THREE.Group();
system.rotation.x = -0.015;
system.rotation.y = -0.035;
scene.add(system);

const orbitSystem = createOrbitSystem(settings);
system.add(orbitSystem.group);

const planet = createPlanet(settings);
system.add(planet.group);

const pointerTrail = createPointerTrail(settings);

let frameId = 0;
let planetBaseScale = 1;
let lastRenderTimestamp = 0;

resize();
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pointermove", handlePointerMove, { passive: true });
window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
window.addEventListener("blur", handlePointerLeave, { passive: true });
document.addEventListener("visibilitychange", handleVisibility, false);
animate();

function animate(timestamp = 0) {
  frameId = requestAnimationFrame(animate);

  if (!shouldRenderFrame(timestamp)) {
    return;
  }

  const elapsed = clock.getElapsedTime();
  const motionScale = reducedMotion.matches ? 0.18 : 1;
  const time = elapsed * settings.speed * motionScale;
  const cameraTime = elapsed * motionScale;
  const planetPulse = 0.5 + Math.sin(cameraTime * 0.42 + Math.sin(cameraTime * 0.11) * 0.7) * 0.5;
  const planetBreath = Math.sin(cameraTime * settings.planetBreathSpeed + Math.sin(cameraTime * 0.047) * 0.26);
  const planetPulseScale = 1 + (planetPulse - 0.5) * 0.012;
  const planetBreathScale = 1 + planetBreath * settings.planetBreath;

  planet.group.scale.setScalar(planetBaseScale * planetPulseScale * planetBreathScale);
  if (renderPipeline.bloomEffect) {
    renderPipeline.bloomEffect.intensity = settings.bloomStrength * (0.96 + planetPulse * 0.08);
  }
  orbitSystem.occlusion.radius.value =
    (1.58 * planet.group.scale.x) / orbitSystem.group.scale.x;

  orbitSystem.group.rotation.x = -1.14 + Math.sin(cameraTime * 0.09) * 0.018 + Math.sin(cameraTime * 0.037 + 1.2) * 0.008;
  orbitSystem.dust.material.uniforms.uTime.value = time;
  orbitSystem.sparkCloud.material.uniforms.uTime.value = time;
  backdrop.material.uniforms.uTime.value = time * 0.45;
  updateBackdropNovas(backdrop, cameraTime);
  updateMeteors(meteors, cameraTime);
  nebula.material.uniforms.uTime.value = time * 0.06;
  const swayAmt = settings.cameraSway;
  const nebTargetX = Math.sin(cameraTime * 0.19 + 2.1) * 0.055 * swayAmt;
  const nebTargetY = Math.cos(cameraTime * 0.23 + 0.3) * 0.034 * swayAmt;
  nebula.mesh.position.set(
    nebula.mesh.userData.basePos.x + nebTargetX * 7.5,
    nebula.mesh.userData.basePos.y + nebTargetY * 7.5,
    nebula.mesh.userData.basePos.z,
  );
  planet.surface.material.uniforms.uTime.value = time;
  planet.surface.material.uniforms.uPulse.value = planetPulse;
  planet.surface.rotation.y = time * settings.planetSpin;
  planet.glow.material.uniforms.uTime.value = time;
  planet.glow.material.uniforms.uPulse.value = planetPulse;
  if (planet.aura) {
    planet.aura.material.rotation = time * 0.025;
    planet.aura.scale.copy(planet.aura.userData.baseScale).multiplyScalar(1 + planetPulse * 0.045);
    planet.aura.material.opacity = planet.aura.userData.baseOpacity * (0.88 + planetPulse * 0.26);
  }
  if (planet.softHalo) {
    planet.softHalo.scale.setScalar(1 + planetPulse * 0.038);
    planet.softHalo.rotation.z = time * 0.006;
    for (const layer of planet.softHalo.children) {
      layer.material.opacity = layer.userData.baseOpacity * (0.8 + planetPulse * 0.42);
    }
  }
  planet.glow.scale.setScalar(1 + planetPulse * 0.045);
  if (planet.limbBokeh) {
    planet.limbBokeh.scale.setScalar(1 + planetPulse * 0.032);
    planet.limbBokeh.rotation.y = -planet.surface.rotation.y;
    planet.limbBokeh.rotation.z = -time * 0.009;
    planet.limbBokeh.material.uniforms.uTime.value = time;
  }
  if (planet.rayFan) {
    planet.rayFan.material.rotation = -0.035 + Math.sin(time * 0.12) * 0.018;
    planet.rayFan.material.opacity = (0.36 + Math.sin(time * 0.16) * 0.035) * (0.92 + planetPulse * 0.18);
  }
  if (planet.pinLights) {
    planet.pinLights.material.uniforms.uTime.value = time;
    planet.pinLights.rotation.y = planet.surface.rotation.y;
  }
  const leakPulse = Math.pow(planetPulse, 1.8);
  if (planet.lightLeak) {
    planet.lightLeak.material.opacity = planet.lightLeak.userData.baseOpacity * (0.62 + leakPulse * 0.78);
    planet.lightLeak.scale.set(
      planet.lightLeak.userData.baseScaleX * (1 + leakPulse * 0.08),
      planet.lightLeak.userData.baseScaleY * (1 + leakPulse * 0.12),
      1,
    );
    planet.lightLeak.material.rotation = Math.sin(time * 0.07) * 0.025;
  }

  for (const trail of orbitSystem.allTrails) {
    trail.material.uniforms.uTime.value = time;
    const flare = trail.userData.flare;
    if (flare) {
      const surge = Math.max(0, Math.sin(cameraTime * flare.freq + flare.phase));
      const flareIntensity = surge * surge * surge;
      trail.material.uniforms.uOpacity.value = flare.baseOpacity * (1 + flareIntensity * flare.boost);
    }
  }

  const occlusionCenter = orbitSystem.occlusion.center.value;
  const occlusionRadius = orbitSystem.occlusion.radius.value;

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
    const distanceToPlanet = Math.hypot(
      sprite.position.x - occlusionCenter.x,
      sprite.position.y - occlusionCenter.y,
    );
    const planetFade = clamp((distanceToPlanet - occlusionRadius * 0.88) / 0.28, 0, 1);
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
  updatePointerTrail(pointerTrail, cameraTime);
  renderPipeline.render();
  recordRenderedFrame(timestamp);
}

function shouldRenderFrame(timestamp) {
  if (settings.frameInterval <= 0 || timestamp <= 0) {
    lastRenderTimestamp = timestamp;
    return true;
  }

  if (lastRenderTimestamp === 0) {
    lastRenderTimestamp = timestamp;
    return true;
  }

  const elapsed = timestamp - lastRenderTimestamp;
  if (elapsed < settings.frameInterval) {
    runtimeStats.skippedFrames += 1;
    return false;
  }

  lastRenderTimestamp = timestamp - (elapsed % settings.frameInterval);
  return true;
}

function recordRenderedFrame(timestamp) {
  runtimeStats.renderedFrames += 1;
  runtimeStats.sampleFrames += 1;
  runtimeStats.lastFrameMs = timestamp || performance.now();

  const elapsed = runtimeStats.lastFrameMs - runtimeStats.sampleStartedAt;
  if (elapsed >= 1000) {
    runtimeStats.measuredFps = (runtimeStats.sampleFrames * 1000) / elapsed;
    runtimeStats.sampleFrames = 0;
    runtimeStats.sampleStartedAt = runtimeStats.lastFrameMs;
  }
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
  renderPipeline.setSize(width, height);
  fitNebulaToViewport(pixelRatio);
  pointerTrail.camera.left = -width / 2;
  pointerTrail.camera.right = width / 2;
  pointerTrail.camera.top = height / 2;
  pointerTrail.camera.bottom = -height / 2;
  pointerTrail.camera.updateProjectionMatrix();
}

function fitNebulaToViewport(pixelRatio) {
  const distance = Math.max(1, Math.abs(nebula.mesh.position.z));
  const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * distance;
  const visibleWidth = visibleHeight * camera.aspect;

  nebula.mesh.scale.set(
    (visibleWidth * NEBULA_VIEWPORT_PADDING) / NEBULA_PLANE_WIDTH,
    (visibleHeight * NEBULA_VIEWPORT_PADDING) / NEBULA_PLANE_HEIGHT,
    1,
  );
  nebula.material.uniforms.uPixelRatio.value = pixelRatio;
}

function handlePointerMove(event) {
  pointerUv.set(event.clientX / Math.max(1, window.innerWidth), event.clientY / Math.max(1, window.innerHeight));
}

function handlePointerLeave() {
  pointerUv.set(-1, -1);
}

function handleVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastRenderTimestamp = 0;
    return;
  }

  if (!frameId) {
    clock.getDelta();
    lastRenderTimestamp = 0;
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
    .add(_swayOffset.set(x * amount, y * amount, z * amount));
  cameraSwayTarget
    .copy(cameraBaseTarget)
    .add(_swayOffset.set(targetX * amount, targetY * amount, 0));

  camera.position.copy(cameraSwayPosition);
  camera.lookAt(cameraSwayTarget);
  camera.rotation.z += roll;
}

function setupMusic() {
  const params = new URLSearchParams(window.location.search);
  let wantsMusic = readBoolean(params.get("music"), true);
  const button = document.querySelector(".music-toggle");

  if (!button) {
    return null;
  }

  const audio = new Audio(new URL("./music/The%20Purple%20Planet.mp3", window.location.href).href);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = clamp(Number(params.get("musicVolume") ?? 0.42), 0, 1);

  const updateButton = () => {
    const playing = wantsMusic && !audio.paused;
    button.hidden = false;
    button.classList.toggle("is-on", playing);
    button.classList.toggle("is-off", !wantsMusic);
    button.classList.toggle("is-pending", wantsMusic && audio.paused);
    button.textContent = wantsMusic ? "♪" : "×";
    button.setAttribute(
      "aria-label",
      playing ? "Turn music off" : wantsMusic ? "Start music" : "Turn music on",
    );
  };

  const tryPlay = async () => {
    if (!wantsMusic) {
      updateButton();
      return;
    }

    try {
      await audio.play();
    } catch {
      // Autoplay can be blocked; the visible toggle lets the next user click start it.
    }
    updateButton();
  };

  button.addEventListener("click", () => {
    if (wantsMusic && !audio.paused) {
      wantsMusic = false;
      audio.pause();
      updateButton();
      return;
    }

    wantsMusic = true;
    void tryPlay();
  });
  audio.addEventListener("play", updateButton);
  audio.addEventListener("pause", updateButton);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && wantsMusic && audio.paused) {
      void tryPlay();
    }
  });

  updateButton();
  void tryPlay();

  return audio;
}

function createPointerTrail({ palette }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 5;
  const texture = createStarTexture();
  const cursorTexture = createCursorTexture();
  const pool = [];
  const colors = [
    samplePalette(palette, 1).clone().lerp(WHITE, 0.24),
    samplePalette(palette, 0.72).clone().lerp(WHITE, 0.16),
    samplePalette(palette, 0.42).clone().lerp(WHITE, 0.08),
  ];

  for (let i = 0; i < 72; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.frustumCulled = false;
    sprite.userData = {
      age: 1,
      life: 1,
      spin: 0,
      baseSize: 1,
      driftX: 0,
      driftY: 0,
    };
    pool.push(sprite);
    scene.add(sprite);
  }

  const cursor = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: cursorTexture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    }),
  );
  cursor.renderOrder = 10;
  cursor.frustumCulled = false;
  cursor.scale.set(30, 30, 1);
  scene.add(cursor);

  return {
    scene,
    camera,
    pool,
    colors,
    cursor,
    next: 0,
    lastEmit: 0,
  };
}

function updatePointerTrail(trail, time) {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const pointerActive = pointerUv.x >= 0 && pointerUv.y >= 0;

  if (pointerActive) {
    pointerScreen.set(pointerUv.x * width - width / 2, height / 2 - pointerUv.y * height);
    trail.cursor.visible = true;
    trail.cursor.material.opacity += (1 - trail.cursor.material.opacity) * 0.28;
    trail.cursor.position.set(pointerScreen.x + 8, pointerScreen.y - 11, 1);

    if (lastPointerUv.x < 0 || lastPointerUv.y < 0) {
      lastPointerUv.copy(pointerUv);
    }

    const dx = (pointerUv.x - lastPointerUv.x) * width;
    const dy = (pointerUv.y - lastPointerUv.y) * height;
    const distance = Math.hypot(dx, dy);
    const emitCount = Math.min(9, Math.max(1, Math.floor(distance / 12)));

    if (distance > 1.2 || time - trail.lastEmit > 0.045) {
      for (let i = 0; i < emitCount; i += 1) {
        const t = emitCount <= 1 ? 1 : i / (emitCount - 1);
        const x = lerp(lastPointerUv.x, pointerUv.x, t);
        const y = lerp(lastPointerUv.y, pointerUv.y, t);
        emitPointerSpark(trail, x, y, dx, dy, width, height, time);
      }
      trail.lastEmit = time;
    }

    lastPointerUv.copy(pointerUv);
  } else {
    lastPointerUv.set(-1, -1);
    trail.cursor.material.opacity *= 0.78;
    if (trail.cursor.material.opacity < 0.02) {
      trail.cursor.visible = false;
      trail.cursor.material.opacity = 0;
    }
  }

  for (const sprite of trail.pool) {
    if (!sprite.visible) {
      continue;
    }

    const data = sprite.userData;
    data.age += 1 / Math.max(1, settings.fps || 30);
    const fade = 1 - clamp(data.age / data.life, 0, 1);
    if (fade <= 0) {
      sprite.visible = false;
      sprite.material.opacity = 0;
      continue;
    }

    sprite.position.x += data.driftX;
    sprite.position.y += data.driftY;
    sprite.material.opacity = data.opacity * fade * fade;
    sprite.material.rotation += data.spin;
    const scale = data.baseSize * (0.7 + (1 - fade) * 0.82);
    sprite.scale.set(scale, scale * data.aspect, 1);
  }
}

function emitPointerSpark(trail, uvX, uvY, dx, dy, width, height, time) {
  const sprite = trail.pool[trail.next];
  trail.next = (trail.next + 1) % trail.pool.length;

  const speed = Math.min(1, Math.hypot(dx, dy) / 90);
  const angle = Math.atan2(-dy, dx || 0.001);
  const scatter = (Math.random() - 0.5) * (18 + speed * 28);
  const size = 9 + Math.random() * 26 + speed * 16;
  const color = trail.colors[Math.floor(Math.random() * trail.colors.length)];
  const data = sprite.userData;

  sprite.visible = true;
  sprite.position.set(
    uvX * width - width / 2 + Math.cos(angle + Math.PI / 2) * scatter,
    height / 2 - uvY * height + Math.sin(angle + Math.PI / 2) * scatter,
    0,
  );
  sprite.material.color.copy(color);
  sprite.material.rotation = Math.random() * Math.PI * 2 + time * 0.2;
  sprite.material.opacity = 0.62 + Math.random() * 0.34;
  data.age = 0;
  data.life = 0.42 + Math.random() * 0.34;
  data.opacity = sprite.material.opacity;
  data.baseSize = size;
  data.aspect = 0.44 + Math.random() * 0.68;
  data.spin = (Math.random() - 0.5) * 0.22;
  data.driftX = -Math.cos(angle) * (0.24 + speed * 1.1) + (Math.random() - 0.5) * 0.42;
  data.driftY = Math.sin(angle) * (0.24 + speed * 1.1) + (Math.random() - 0.5) * 0.42;
  sprite.scale.set(size, size * data.aspect, 1);
}

function createRenderPipeline({ postprocessing, bloomStrength, bloomRadius, bloomThreshold, exposure }) {
  if (!postprocessing) {
    return {
      bloomEffect: null,
      render: () => {
        renderer.render(scene, camera);
        renderPointerTrail();
      },
      setSize: () => {}
    };
  }

  const bloomEffect = new BloomEffect({
    intensity: bloomStrength,
    radius: bloomRadius,
    luminanceThreshold: bloomThreshold,
    luminanceSmoothing: 0.15,
    mipmapBlur: true,
  });
  const toneMappingEffect = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
    resolution: 256,
    whitePoint: 4.0,
  });
  toneMappingEffect.exposure = exposure;
  const chromaticAberrationEffect = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0.0006, 0.0006),
    radialModulation: true,
    modulationOffset: 0.2,
  });
  const noiseEffect = new NoiseEffect({ premultiply: true });
  noiseEffect.blendMode.opacity.value = 0.028;
  const vignetteEffect = new VignetteEffect({
    offset: 0.38,
    darkness: 0.52,
  });
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new EffectPass(
      camera,
      bloomEffect,
      chromaticAberrationEffect,
      noiseEffect,
      vignetteEffect,
      toneMappingEffect,
    ),
  );

  return {
    bloomEffect,
    render: () => {
      composer.render();
      renderPointerTrail();
    },
    setSize: (width, height) => composer.setSize(width, height, false),
  };
}

function renderPointerTrail() {
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(pointerTrail.scene, pointerTrail.camera);
  renderer.autoClear = previousAutoClear;
}

function readSettings() {
  const params = new URLSearchParams(window.location.search);
  const quality = params.get("quality") || "cinematic";
  const qualityMap = {
    low: {
      backdrop: 1200,
      dust: 520,
      sparkDust: 650,
      segments: 104,
      orbits: 11,
      trailDensity: 0.5,
      meteors: 0,
      cinematicGlow: false,
      cameraSway: 0,
      planetSpin: 0.025,
      planetBreath: 0.012,
      planetBreathSpeed: 0.24,
      postprocessing: false,
      exposure: 0.86,
      bloomStrength: 0.28,
      bloomRadius: 0.32,
      bloomThreshold: 0.58,
      fps: 24,
      pixelRatio: 0.9,
    },
    balanced: {
      backdrop: 2800,
      dust: 1800,
      sparkDust: 2400,
      segments: 160,
      orbits: 14,
      trailDensity: 0.75,
      meteors: 1,
      cinematicGlow: true,
      cameraSway: 0.25,
      planetSpin: 0.04,
      planetBreath: 0.026,
      planetBreathSpeed: 0.28,
      postprocessing: false,
      exposure: 0.9,
      bloomStrength: 0.46,
      bloomRadius: 0.42,
      bloomThreshold: 0.52,
      fps: 24,
      pixelRatio: 1,
    },
    high: {
      backdrop: 5200,
      dust: 3600,
      sparkDust: 5000,
      segments: 220,
      orbits: 17,
      trailDensity: 0.9,
      meteors: 2,
      cinematicGlow: true,
      cameraSway: 0.45,
      planetSpin: 0.05,
      planetBreath: 0.032,
      planetBreathSpeed: 0.32,
      postprocessing: true,
      exposure: 0.94,
      bloomStrength: 0.62,
      bloomRadius: 0.52,
      bloomThreshold: 0.46,
      fps: 30,
      pixelRatio: 1.1,
    },
    cinematic: {
      backdrop: 9500,
      dust: 36000,
      sparkDust: 52000,
      segments: 420,
      orbits: 19,
      trailDensity: 1.15,
      meteors: 3,
      cinematicGlow: true,
      cameraSway: 1,
      planetSpin: 0.055,
      planetBreath: 0.04,
      planetBreathSpeed: 0.36,
      postprocessing: true,
      exposure: 0.82,
      bloomStrength: 0.64,
      bloomRadius: 0.58,
      bloomThreshold: 0.5,
      fps: 30,
      pixelRatio: 1.35,
    },
  };
  const selected = qualityMap[quality] || qualityMap.cinematic;
  const qualityName = qualityMap[quality] ? quality : "cinematic";
  const themeName = params.get("theme") || "nebula";
  const palette = readPalette(params.get("palette"), themeName);
  const fps = clamp(Number(params.get("fps") ?? selected.fps), 0, 144);
  const planetSpin = clamp(Number(params.get("planetSpin") ?? selected.planetSpin), 0, 0.25);
  const planetBreath = clamp(Number(params.get("planetBreath") ?? selected.planetBreath), 0, 0.08);
  const planetBreathSpeed = clamp(Number(params.get("planetBreathSpeed") ?? selected.planetBreathSpeed), 0.05, 1);

  return {
    ...selected,
    quality: qualityName,
    palette,
    themeName,
    fps,
    frameInterval: fps > 0 ? 1000 / fps : 0,
    speed: clamp(Number(params.get("speed") || 1), 0.2, 2),
    cameraSway: clamp(Number(params.get("cameraSway") ?? selected.cameraSway), 0, 1.5),
    planetSpin,
    planetBreath,
    planetBreathSpeed,
    postprocessing: readBoolean(params.get("postprocessing"), selected.postprocessing),
    exposure: clamp(Number(params.get("exposure") ?? selected.exposure), 0.6, 1.8),
    bloomStrength: clamp(Number(params.get("bloom") ?? selected.bloomStrength), 0, 2),
    bloomRadius: clamp(Number(params.get("bloomRadius") ?? selected.bloomRadius), 0, 1.2),
    bloomThreshold: clamp(Number(params.get("bloomThreshold") ?? selected.bloomThreshold), 0, 1),
    pixelRatio: clamp(Number(params.get("pixelRatio") ?? selected.pixelRatio), 0.5, 1.5),
  };
}

function createNebula({ palette }) {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
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
      uniform float uPixelRatio;
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
        for (int i = 0; i < 4; i++) {
          value += noise(p) * amplitude;
          p = p * 2.08 + vec2(17.3, -9.2);
          amplitude *= 0.5;
        }
        return value;
      }

      float screenStar(vec2 pixel, float cellSize, float density, float radius, float twinkleRate) {
        vec2 cell = floor(pixel / cellSize);
        vec2 local = fract(pixel / cellSize) * cellSize;
        float seed = hash(cell);
        float present = step(seed, density);
        vec2 star = vec2(
          hash(cell + vec2(7.1, 19.7)),
          hash(cell + vec2(31.4, 5.8))
        ) * cellSize;
        vec2 delta = local - star;
        float d = length(delta);
        float core = exp(-(d * d) / max(0.001, radius * radius));
        float rayX = exp(-abs(delta.y) * 1.75) * exp(-abs(delta.x) * 0.13);
        float rayY = exp(-abs(delta.x) * 1.75) * exp(-abs(delta.y) * 0.13);
        float twinkle = 0.72 + sin(uTime * twinkleRate + seed * 31.416) * 0.28;
        return present * (core + (rayX + rayY) * 0.035) * twinkle * (0.58 + seed * 0.72);
      }

      vec3 screenStars(vec2 fragCoord) {
        vec2 pixel = fragCoord / max(0.25, uPixelRatio);
        float tiny = screenStar(pixel + vec2(11.0, 23.0), 28.0, 0.09, 0.56, 0.74);
        float fine = screenStar(pixel + vec2(47.0, 13.0), 44.0, 0.22, 0.78, 0.52);
        float bright = screenStar(pixel + vec2(103.0, 71.0), 82.0, 0.34, 1.08, 0.34);
        float colorSeed = hash(floor(pixel / 88.0) + vec2(4.0, 9.0));
        vec3 coolTint = mix(uOuter, uMid, colorSeed);
        vec3 hotTint = mix(vec3(1.0, 0.82, 1.0), uInner, colorSeed * 0.45);
        return coolTint * (tiny * 0.34 + fine * 0.58) + hotTint * bright * 0.72;
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
        color += screenStars(gl_FragCoord.xy) * (0.16 + vignette * 0.22);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(NEBULA_PLANE_WIDTH, NEBULA_PLANE_HEIGHT), material);
  mesh.position.set(0, 0, -NEBULA_PLANE_DISTANCE);
  mesh.renderOrder = -1000;
  return { mesh, material };
}

function createBackdrop({ backdrop, palette }) {
  const positions = new Float32Array(backdrop * 3);
  const colors = new Float32Array(backdrop * 3);
  const sizes = new Float32Array(backdrop);
  const phases = new Float32Array(backdrop);
  const novas = new Float32Array(backdrop);

  for (let i = 0; i < backdrop; i += 1) {
    const i3 = i * 3;
    const depth = Math.pow(Math.random(), 0.74);
    const z = -BACKDROP_NEAR_Z - depth * BACKDROP_DEPTH;
    const distance = Math.abs(z) + 12;
    const halfHeight =
      Math.tan(THREE.MathUtils.degToRad(BACKDROP_SPREAD_FOV) * 0.5) *
      distance *
      BACKDROP_SPREAD_PADDING;
    const halfWidth = halfHeight * BACKDROP_SPREAD_ASPECT;

    positions[i3] = (Math.random() - 0.5) * halfWidth * 2;
    positions[i3 + 1] = (Math.random() - 0.5) * halfHeight * 2;
    positions[i3 + 2] = z;

    const color = samplePalette(palette, Math.random())
      .lerp(WHITE, Math.random() * 0.28)
      .multiplyScalar(0.55 + Math.random() * 0.62);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = 0.45 + Math.random() * 1.25;
    phases[i] = Math.random() * Math.PI * 2;
    novas[i] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  const novaAttr = new THREE.BufferAttribute(novas, 1);
  novaAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aNova", novaAttr);

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
      attribute float aNova;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vNova;
      uniform float uTime;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * (70.0 / max(1.0, -mvPosition.z)) * sqrt(aNova);
        vColor = color * aNova;
        vAlpha = 0.5 + sin(uTime * 0.7 + aPhase) * 0.28;
        vNova = aNova;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vNova;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.48, 0.0, d);
        float spikeBoost = clamp(vNova - 1.0, 0.0, 6.0);
        float spikeStrength = 0.22 + spikeBoost * 0.45;
        float spikeReach = mix(0.5, 0.62, smoothstep(0.0, 4.0, spikeBoost));
        float spikeX = smoothstep(0.42, 0.0, abs(uv.y)) * smoothstep(spikeReach, 0.06, abs(uv.x));
        float spikeY = smoothstep(0.42, 0.0, abs(uv.x)) * smoothstep(spikeReach, 0.06, abs(uv.y));
        float spikes = (spikeX + spikeY) * spikeStrength * smoothstep(0.5, 0.12, d);
        float alpha = max(core, spikes) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    geometry,
    material,
    points,
    novaAttr: geometry.getAttribute("aNova"),
    novaSlots: [null, null],
    nextNova: 8 + Math.random() * 10,
  };
}

function updateBackdropNovas(backdrop, time) {
  const attr = backdrop.novaAttr;
  let dirty = false;
  for (let i = 0; i < backdrop.novaSlots.length; i += 1) {
    const slot = backdrop.novaSlots[i];
    if (!slot) continue;
    const elapsed = time - slot.startTime;
    const totalDuration = slot.riseDuration + slot.fallDuration;
    if (elapsed >= totalDuration) {
      attr.array[slot.index] = 1;
      backdrop.novaSlots[i] = null;
      dirty = true;
      continue;
    }
    let intensity;
    if (elapsed < slot.riseDuration) {
      const t = elapsed / slot.riseDuration;
      intensity = 1 + slot.peak * (t * t * (3 - 2 * t));
    } else {
      const t = (elapsed - slot.riseDuration) / slot.fallDuration;
      const eased = 1 - t;
      intensity = 1 + slot.peak * eased * eased;
    }
    attr.array[slot.index] = intensity;
    dirty = true;
  }
  if (time >= backdrop.nextNova) {
    const freeSlot = backdrop.novaSlots.findIndex((s) => s === null);
    if (freeSlot >= 0) {
      backdrop.novaSlots[freeSlot] = {
        index: Math.floor(Math.random() * attr.count),
        startTime: time,
        riseDuration: 1.4 + Math.random() * 0.9,
        fallDuration: 3.5 + Math.random() * 2.2,
        peak: 4.5 + Math.random() * 3.5,
      };
    }
    backdrop.nextNova = time + 28 + Math.random() * 22;
  }
  if (dirty) attr.needsUpdate = true;
}

function createMeteors({ palette, meteors = 0 }) {
  const poolSize = Math.max(0, Math.floor(meteors));
  const meshes = [];
  const slots = [];

  for (let i = 0; i < poolSize; i += 1) {
    const color = samplePalette(palette, Math.random());
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: color.clone().lerp(WHITE, 0.4) },
        uProgress: { value: -1 },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying float vT;
        void main() {
          vT = position.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uProgress;
        uniform float uOpacity;
        varying float vT;
        void main() {
          float head = uProgress;
          float behind = head - vT;
          if (behind < 0.0 || behind > 0.35) discard;
          float fade = smoothstep(0.35, 0.0, behind) * smoothstep(0.0, 0.04, behind);
          float alpha = fade * uOpacity;
          if (alpha < 0.005) discard;
          vec3 hot = mix(uColor, vec3(1.0), smoothstep(0.04, 0.0, behind) * 0.6);
          gl_FragColor = vec4(hot * 2.2, alpha);
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    meshes.push(mesh);
    slots.push({ active: false, startTime: 0, duration: 0 });
  }

  return {
    meshes,
    slots,
    nextSpawn: poolSize > 0 ? 12 + Math.random() * 18 : Number.POSITIVE_INFINITY,
  };
}

function updateMeteors(meteors, time) {
  for (let i = 0; i < meteors.slots.length; i += 1) {
    const slot = meteors.slots[i];
    const mesh = meteors.meshes[i];
    if (slot.active) {
      const elapsed = time - slot.startTime;
      const progress = elapsed / slot.duration;
      if (progress > 1.35) {
        slot.active = false;
        mesh.visible = false;
        mesh.material.uniforms.uOpacity.value = 0;
      } else {
        mesh.material.uniforms.uProgress.value = progress;
        mesh.material.uniforms.uOpacity.value = smoothStep01(1 - Math.max(0, progress - 0.8) / 0.55);
      }
    }
  }

  if (time >= meteors.nextSpawn) {
    const freeSlot = meteors.slots.findIndex((s) => !s.active);
    if (freeSlot >= 0) {
      const mesh = meteors.meshes[freeSlot];
      const slot = meteors.slots[freeSlot];
      const x = (Math.random() - 0.5) * 38;
      const y = (Math.random() - 0.3) * 18;
      const z = -36 - Math.random() * 14;
      const angle = -0.6 + Math.random() * 0.35;
      const length = 4.5 + Math.random() * 7;
      const dx = Math.cos(angle) * length;
      const dy = Math.sin(angle) * length;
      const posAttr = mesh.geometry.attributes.position;
      posAttr.setXYZ(0, x, y, z);
      posAttr.setXYZ(1, x + dx, y + dy, z);
      posAttr.needsUpdate = true;
      slot.active = true;
      slot.startTime = time;
      slot.duration = 0.3 + Math.random() * 0.25;
      mesh.visible = true;
      mesh.material.uniforms.uProgress.value = 0;
      mesh.material.uniforms.uOpacity.value = 0.6 + Math.random() * 0.4;
    }
    meteors.nextSpawn = time + 18 + Math.random() * 28;
  }
}

function createOrbitSystem({
  dust,
  sparkDust,
  segments,
  palette,
  orbits: orbitCount = 12,
  trailDensity = 0.58,
  cinematicGlow = false,
}) {
  const group = new THREE.Group();
  group.rotation.x = -1.14;
  group.rotation.z = -0.035;
  const occlusion = createPlanetOcclusionUniforms();

  const orbits = [];
  const trails = [];
  const allTrails = [];

  for (let i = 0; i < orbitCount; i += 1) {
    const rx = 2.35 + i * 0.69;
    const ry = rx * (0.31 + i * 0.0115);
    const depth = createOrbitDepth(i, orbitCount);
    const gradientT = 1 - i / Math.max(1, orbitCount - 1);
    const color = samplePalette(palette, gradientT);
    const guideColor = color.clone().lerp(GUIDE_GREY, 0.86);
    const tube = 0.0048 + i * 0.00072;
    const opacity = Math.max(0.0028, 0.011 - i * 0.00028);
    const focusBlur = orbitFocusBlur(i, orbitCount);

    if (cinematicGlow && focusBlur > 0.02) {
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

    const baseTrailCount = i < 3 ? 1 : i < 8 ? 2 : 3;
    const trailCount = Math.max(1, Math.round(baseTrailCount * trailDensity));
    for (let j = 0; j < trailCount; j += 1) {
      const featureTrail = cinematicGlow && j === 0 && (i === 3 || i === 6 || i === 10 || i > 13);
      const trailOptions = {
        phase: Math.random(),
        speed: 0.012 + Math.random() * 0.032 + i * 0.0011,
        length: 0.2 + Math.random() * 0.34 + (i > 8 ? 0.16 : 0) + (featureTrail ? 0.18 : 0),
        opacity: 0.54 + Math.random() * 0.32 + (featureTrail ? 0.08 : 0),
        direction: Math.random() > 0.18 ? 1 : -1,
      };
      const flare = featureTrail
        ? { freq: 0.07 + Math.random() * 0.04, phase: Math.random() * Math.PI * 2, boost: 0.55 + Math.random() * 0.25 }
        : null;
      if (cinematicGlow) {
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
        if (flare) halo.userData.flare = { ...flare, baseOpacity: trailOptions.opacity * (0.12 + focusBlur * 0.12) };
        group.add(halo);
        allTrails.push(halo);
      }

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
      if (flare) trail.userData.flare = { ...flare, baseOpacity: trailOptions.opacity * (1 - focusBlur * 0.24) };
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

  const sprites = cinematicGlow ? createOrbitSprites(trails) : [];
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
    3,
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


function createOrbitTrail(rx, ry, segments, radius, color, options) {
  const occlusion = options.occlusion || createPlanetOcclusionUniforms();
  const geometry = new THREE.TubeGeometry(
    new OrbitCurve(rx, ry, 0, Math.PI * 2, options.depth || flatOrbitDepth()),
    segments,
    radius,
    3,
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
      .lerp(WHITE, Math.random() * 0.38)
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
        float armPhase = atan(p.y, p.x) * 3.0 + uTime * 0.18;
        float densityWave = 0.62 + smoothstep(-0.55, 0.85, sin(armPhase)) * 0.78;
        vAlpha =
          (0.55 + sin(uTime * 2.0 + aPhase) * 0.24) *
          densityWave *
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

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    geometry,
    material,
    points,
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
      .lerp(WHITE, Math.random() * 0.34)
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

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    geometry,
    material,
    points,
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
    const spriteColor = runner.orbit.color.clone().lerp(WHITE, 0.12);
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

function createPlanet({ palette, cinematicGlow = false }) {
  const group = new THREE.Group();
  group.position.set(3.35, 0.92, 0.02);
  const inner = samplePalette(palette, 1);
  const mid = samplePalette(palette, 0.6);
  const outer = samplePalette(palette, 0);
  const planetRadius = 1.56;
  let aura = null;
  let rayFan = null;
  let lightLeak = null;
  let softHalo = null;
  let limbBokeh = null;

  if (cinematicGlow) {
    aura = new THREE.Sprite(
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

    rayFan = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createRayFanTexture(),
        color: inner.clone().lerp(WHITE, 0.05),
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      }),
    );
    rayFan.position.set(0.48, 0.2, -1.15);
    rayFan.scale.set(7.8, 5.2, 1);

    lightLeak = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createLightLeakTexture(),
        color: inner.clone().lerp(WHITE, 0.32),
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      }),
    );
    lightLeak.position.set(0.18, 0.12, -0.55);
    lightLeak.scale.set(9.2, 1.4, 1);
    lightLeak.userData.baseOpacity = lightLeak.material.opacity;
    lightLeak.userData.baseScaleX = lightLeak.scale.x;
    lightLeak.userData.baseScaleY = lightLeak.scale.y;

    softHalo = createPlanetSoftHalo(inner, mid, outer);
    limbBokeh = createPlanetLimbBokeh(palette, planetRadius);
  }

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius, 56, 36),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.5 },
        uRimColor: { value: inner.clone().lerp(WHITE, 0.05) },
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

        float hash3(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        float surfaceNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
                mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        void main() {
          float facing = max(dot(vNormal, vView), 0.0);
          float rimBase = 1.0 - facing;
          float rim = smoothstep(0.79, 1.0, rimBase);
          float litArc = smoothstep(-0.18, 0.62, vNormal.y * 0.52 + vNormal.x * 0.34);
          float shade = smoothstep(-0.8, 0.85, vNormal.y * 0.6 + vNormal.x * 0.25);
          float pulse = sin((vPosition.y + vPosition.x) * 4.0 + uTime * 0.35) * 0.0025;
          float n1 = surfaceNoise(vPosition * 2.4 + vec3(0.0, uTime * 0.008, 0.0));
          float n2 = surfaceNoise(vPosition * 5.8 + vec3(7.3, -3.1, uTime * 0.012));
          float continent = smoothstep(0.38, 0.62, n1 * 0.7 + n2 * 0.3);
          vec3 core = mix(vec3(0.00004, 0.00002, 0.00012), uShadeColor * 0.018, shade);
          core += uShadeColor * continent * shade * 0.014;
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

  const pinLights = cinematicGlow ? createPlanetPinLights(palette) : null;
  group.add(glow, surface);
  for (const extra of [rayFan, lightLeak, aura, softHalo, limbBokeh, pinLights]) {
    if (extra) group.add(extra);
  }

  return {
    group,
    rayFan,
    lightLeak,
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
  const haloTexture = createPlanetHaloTexture();

  const backVeil = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture,
      color: outer.clone().lerp(mid, 0.45).lerp(WHITE, 0.08),
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
      map: haloTexture,
      color: inner.clone().lerp(WHITE, 0.18),
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
  const count = 132;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const bandY = 1 - ((i + 0.5) / count) * 2;
    const latitude = Math.asin(bandY) * 0.78 + (Math.random() - 0.5) * 0.22;
    const longitude = i * goldenAngle + (Math.random() - 0.5) * 0.38;
    const shellRadius = planetRadius * (1.09 + Math.pow(Math.random(), 0.68) * 0.48);
    const horizontal = Math.cos(latitude);

    positions[i3] = Math.cos(longitude) * horizontal * shellRadius;
    positions[i3 + 1] = Math.sin(latitude) * shellRadius * (0.94 + Math.random() * 0.1);
    positions[i3 + 2] = Math.sin(longitude) * horizontal * shellRadius;

    const color = samplePalette(palette, 0.54 + Math.random() * 0.46)
      .lerp(WHITE, 0.12 + Math.random() * 0.28)
      .multiplyScalar(1.45);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() < 0.18 ? 0.62 + Math.random() * 0.62 : 0.22 + Math.random() * 0.42;
    phases[i] = Math.random() * Math.PI * 2;
    alphas[i] = 0.075 + Math.random() * 0.24;
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
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 2);
    const radius = 1.575;
    positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i3 + 1] = Math.cos(phi) * radius;
    positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

    const color = samplePalette(palette, Math.random() * 0.55 + 0.45)
      .lerp(WHITE, Math.random() * 0.32)
      .multiplyScalar(1.55);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.8 + Math.random() * 2.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 0.012 },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aSpeed;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uSize;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * (300.0 / max(1.0, -mvPosition.z));
        vColor = color;
        float flicker = sin(uTime * aSpeed + aPhase);
        float blink = smoothstep(-0.15, 0.35, flicker);
        vAlpha = 0.34 * (0.22 + blink * 0.78);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.0, d);
        if (core < 0.01) discard;
        gl_FragColor = vec4(vColor, core * vAlpha);
      }
    `,
  });

  return new THREE.Points(geometry, material);
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

function createCursorTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 96;
  canvasTexture.height = 96;
  const ctx = canvasTexture.getContext("2d");

  ctx.clearRect(0, 0, 96, 96);
  ctx.save();
  ctx.translate(24, 14);
  ctx.rotate(-0.18);

  ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
  ctx.shadowBlur = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 54);
  ctx.lineTo(14, 42);
  ctx.lineTo(24, 65);
  ctx.lineTo(34, 61);
  ctx.lineTo(24, 38);
  ctx.lineTo(42, 38);
  ctx.closePath();

  ctx.fillStyle = "rgba(7, 7, 12, 0.96)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(130, 82, 255, 0.45)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

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

function createLightLeakTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 1024;
  canvasTexture.height = 256;
  const ctx = canvasTexture.getContext("2d");

  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, 1024, 256);

  const hotCore = ctx.createRadialGradient(512, 128, 0, 512, 128, 90);
  hotCore.addColorStop(0, "rgba(255, 240, 255, 0.92)");
  hotCore.addColorStop(0.4, "rgba(255, 180, 240, 0.42)");
  hotCore.addColorStop(1, "rgba(255, 120, 220, 0)");
  ctx.fillStyle = hotCore;
  ctx.fillRect(0, 0, 1024, 256);

  const streak = ctx.createLinearGradient(0, 128, 1024, 128);
  streak.addColorStop(0, "rgba(255, 150, 240, 0)");
  streak.addColorStop(0.36, "rgba(255, 170, 230, 0.18)");
  streak.addColorStop(0.5, "rgba(255, 220, 255, 0.62)");
  streak.addColorStop(0.64, "rgba(255, 170, 230, 0.18)");
  streak.addColorStop(1, "rgba(255, 150, 240, 0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = streak;
  ctx.beginPath();
  ctx.ellipse(512, 128, 510, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  const thinLine = ctx.createLinearGradient(0, 128, 1024, 128);
  thinLine.addColorStop(0, "rgba(255, 210, 255, 0)");
  thinLine.addColorStop(0.5, "rgba(255, 240, 255, 0.95)");
  thinLine.addColorStop(1, "rgba(255, 210, 255, 0)");
  ctx.fillStyle = thinLine;
  ctx.beginPath();
  ctx.ellipse(512, 128, 480, 3.5, 0, 0, Math.PI * 2);
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

function readBoolean(rawValue, fallback) {
  if (rawValue === null) {
    return fallback;
  }

  return !["0", "false", "off", "no"].includes(rawValue.toLowerCase());
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothStep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(value) {
  return value - Math.floor(value);
}
