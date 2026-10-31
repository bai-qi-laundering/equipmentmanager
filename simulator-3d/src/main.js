import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  DEVICES,
  INDICATOR,
  KIND_LABEL,
  MAP_STATE_LABEL,
  TYPE_ORDER,
  addIsoDays,
  indicatorOf,
  taipeiToday,
  worldOf,
} from "./data.js";

const params = new URLSearchParams(location.search);
const shot = params.get("shot");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (params.get("chrome") === "0") document.body.classList.add("bare");

const $ = (id) => document.getElementById(id);
const viewRoot = $("view");
const labelRoot = $("labels");
const panelEl = $("panel");
const hoverEl = $("hover");

const HALL = { minX: -13.4, maxX: 13.2, minZ: -14.8, maxZ: 17.4, height: 7.15 };
const VIEWS = {
  iso: { theta: 0.82, phi: 0.9, radius: 34 },
  side: { theta: 0.82 + 2.15, phi: 1.18, radius: 30 },
  top: { theta: 0.7, phi: 0.16, radius: 40 },
};

const machineViews = [];
const machineById = new Map();
const pickables = [];
let selectedId = null;
let hoveredId = null;
let showAllLabels = false;
let statusFilter = "all";
let tween = null;
let spin = null;
let renderer;
let scene;
let camera;
let controls;
let composer;
let bloomPass;
let selectLight;
let frameTarget = new THREE.Vector3();

const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const tmp = new THREE.Vector3();
const clock = new THREE.Clock();

const MAT = {};

function boot() {
  buildRenderer();
  buildMaterials();
  buildHall();
  buildMachines();
  buildHud();
  bind();
  const focusId = params.get("id") || "VERT-02";
  if (shot === "focus") selectDevice(focusId, true);
  else applyView(shot && VIEWS[shot] ? shot : "iso", true);
  requestAnimationFrame(animate);
}

function buildRenderer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03070d);
  scene.fog = new THREE.Fog(0x071018, 58, 120);
  camera = new THREE.PerspectiveCamera(38, 1, 0.08, 180);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!renderer.getContext()) {
    $("boot").querySelector("span").textContent = "此瀏覽器無法建立 3D 畫面";
    throw new Error("WebGL unavailable");
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewRoot.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
  pmrem.dispose();

  const renderPass = new RenderPass(scene, camera);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.38, 0.86);
  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.07;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minDistance = 2.4;
  controls.maxDistance = 62;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.42;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.75;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.addEventListener("start", () => {
    tween = null;
    spin = null;
  });

  scene.add(new THREE.AmbientLight(0xb7c9d8, 0.55));
  scene.add(new THREE.HemisphereLight(0xd7ecff, 0x102030, 0.62));
  const sun = new THREE.DirectionalLight(0xf7fbff, 2.35);
  sun.position.set(10, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 0, 1);
  const rim = new THREE.DirectionalLight(0x7ad7ff, 0.55);
  rim.position.set(-14, 9, -10);
  scene.add(rim);
  for (const [x, z] of [[-4, -3], [6, 4], [1, 12]]) {
    const fill = new THREE.PointLight(0xd7e8f6, 4.5, 26, 2);
    fill.position.set(x, 5.8, z);
    scene.add(fill);
  }

  selectLight = new THREE.PointLight(0xffffff, 0, 5.5, 2);
  selectLight.castShadow = false;
  scene.add(selectLight);
  resize();
}

function buildMaterials() {
  MAT.chassis = new THREE.MeshStandardMaterial({ color: 0x4d6578, metalness: 0.72, roughness: 0.32, envMapIntensity: 0.55 });
  MAT.panel = new THREE.MeshStandardMaterial({ color: 0x243646, metalness: 0.4, roughness: 0.48, envMapIntensity: 0.3 });
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0xc5d5e2, metalness: 0.9, roughness: 0.2, envMapIntensity: 0.7 });
  MAT.rubber = new THREE.MeshStandardMaterial({ color: 0x10161c, metalness: 0.15, roughness: 0.86 });
  MAT.glass = new THREE.MeshStandardMaterial({
    color: 0x14384c, emissive: 0x0d3040, emissiveIntensity: 0.12, metalness: 0.08, roughness: 0.08,
    transparent: true, opacity: 0.72, envMapIntensity: 0.4,
  });
  MAT.deck = new THREE.MeshStandardMaterial({
    color: 0x10283a, metalness: 0.72, roughness: 0.16, transparent: true, opacity: 0.55, envMapIntensity: 0.4,
  });
}

function addBox(parent, w, h, d, mat, x, y, z, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,.75)");
  grad.addColorStop(0.42, "rgba(255,255,255,.16)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function floorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  g.fillStyle = "#0c1824";
  g.fillRect(0, 0, 512, 512);
  const tile = 64;
  for (let y = 0; y < 512; y += tile) {
    for (let x = 0; x < 512; x += tile) {
      g.fillStyle = (x / tile + y / tile) % 2 === 0 ? "#143044" : "#102838";
      g.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      const major = x % (tile * 4) === 0 || y % (tile * 4) === 0;
      g.strokeStyle = major ? "rgba(120, 170, 200, .22)" : "rgba(80, 130, 160, .12)";
      g.lineWidth = 1;
      g.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function zoneTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 512, 128);
  g.font = '600 62px "PingFang TC", "Noto Sans CJK TC", "WenQuanYi Micro Hei", sans-serif';
  g.fillStyle = "rgba(150, 205, 230, .72)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildHall() {
  const w = HALL.maxX - HALL.minX;
  const d = HALL.maxZ - HALL.minZ;
  const cx = (HALL.minX + HALL.maxX) / 2;
  const cz = (HALL.minZ + HALL.maxZ) / 2;
  const floorGeo = new THREE.PlaneGeometry(w, d);

  const reflector = new Reflector(floorGeo, {
    color: 0x3e5c72,
    textureWidth: 1024,
    textureHeight: 1024,
    clipBias: 0.003,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(cx, 0, cz);
  scene.add(reflector);

  const shadowCatcher = new THREE.Mesh(floorGeo, new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.set(cx, 0.012, cz);
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const tiles = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({
    map: floorTexture(), transparent: true, opacity: 0.58, depthWrite: false,
  }));
  tiles.material.map.repeat.set(w / 8, d / 8);
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.set(cx, 0.02, cz);
  scene.add(tiles);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x163044, metalness: 0.45, roughness: 0.4, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, emissive: 0x0c3148, emissiveIntensity: 0.08,
  });
  const wallH = 1.25;
  addBox(scene, w, wallH, 0.08, wallMat, cx, wallH / 2, HALL.minZ, false);
  addBox(scene, w, wallH, 0.08, wallMat, cx, wallH / 2, HALL.maxZ, false);
  addBox(scene, 0.08, wallH, d, wallMat, HALL.minX, wallH / 2, cz, false);
  addBox(scene, 0.08, wallH, d, wallMat, HALL.maxX, wallH / 2, cz, false);

  const tray = new THREE.MeshStandardMaterial({ color: 0x243846, metalness: 0.8, roughness: 0.35 });
  addBox(scene, 0.18, 0.08, d * 0.72, tray, -2.4, 6.35, cz, false);
  addBox(scene, 0.18, 0.08, d * 0.72, tray, 6.4, 6.35, cz, false);

  addDeck(4.55, 4.55, 2.7, 1.55, 2.2);
  addPosts(4.55, 4.55, 2.7, 1.55, 2.2, "front");
  addLadder(3.35, 3.55, 2.2);
  addDeck(-3.75, 3.8, 1.9, 1.25, 2.2);
  addPosts(-3.75, 3.8, 1.9, 1.25, 2.2, "all");

  const railY = 4.35;
  const railZ = 73 * 0.05;
  addBox(scene, 5.3, 0.08, 0.14, MAT.steel, 4.55, railY, railZ);
  for (const x of [2.05, 7.05]) {
    addBox(scene, 0.1, railY, 0.1, MAT.steel, x, railY / 2, railZ);
  }

  const zones = [
    ["出貨", -8.2, -13.2],
    ["折疊", -11.5, -3.2],
    ["整燙", -1.6, -8.6],
    ["燙床", -8.1, 9.3],
    ["洗衣", 11.6, 0.4],
    ["烘乾", 4.5, 11.4],
    ["水處理", -4.9, 15.8],
    ["辦公", 11.4, -9.4],
  ];
  for (const [text, x, z] of zones) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: zoneTexture(text), transparent: true, depthWrite: false, toneMapped: true }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.035, z);
    scene.add(plane);
  }
}

function addDeck(x, z, w, d, y) {
  const slab = addBox(scene, w, 0.06, d, MAT.deck, x, y - 0.04, z, false);
  slab.castShadow = false;
}

function addPosts(x, z, w, d, y, mode) {
  const corners = [
    [x - w / 2 + 0.08, z - d / 2 + 0.08],
    [x + w / 2 - 0.08, z - d / 2 + 0.08],
    [x - w / 2 + 0.08, z + d / 2 - 0.08],
    [x + w / 2 - 0.08, z + d / 2 - 0.08],
  ];
  const use = mode === "front" ? corners.slice(0, 2) : corners;
  for (const [px, pz] of use) addBox(scene, 0.07, y, 0.07, MAT.steel, px, y / 2, pz);
}

function addLadder(x, z, height) {
  addBox(scene, 0.04, height, 0.04, MAT.steel, x - 0.16, height / 2, z);
  addBox(scene, 0.04, height, 0.04, MAT.steel, x + 0.16, height / 2, z);
  const steps = Math.round(height / 0.28);
  for (let i = 1; i < steps; i++) addBox(scene, 0.32, 0.025, 0.04, MAT.steel, x, (height * i) / steps, z);
}

const SPECS = {
  worktable: { w: 1.35, d: 0.78, h: 0.82, build: buildTable },
  packer: { w: 0.9, d: 0.78, h: 1.18, build: buildPacker },
  folding: { w: 2.35, d: 1.05, h: 1.12, build: buildFolding },
  toilet: { w: 1.15, d: 1.05, h: 1.4, build: buildBooth },
  dryclean: { w: 0.98, d: 0.92, h: 1.48, build: buildWasher },
  lineSMF: { w: 2.55, d: 1.15, h: 0.98, build: buildLine },
  lineICC: { w: 2.4, d: 1.15, h: 0.98, build: buildLine },
  shirt: { w: 0.9, d: 0.82, h: 1.5, build: buildPress },
  longPress: { w: 1.08, d: 0.92, h: 1.38, build: buildPress },
  pressZone: { w: 1.7, d: 1.05, h: 1.16, build: buildPressZone },
  fan: { w: 1.15, d: 0.95, h: 0.78, build: buildFan },
  compressor: { w: 1.5, d: 0.72, h: 0.9, build: buildCompressor },
  washer: { w: 0.98, d: 0.9, h: 1.28, build: buildWasher },
  lineN5: { w: 3.05, d: 1.12, h: 1.02, build: buildLine },
  lineIRT: { w: 3.2, d: 1.15, h: 1.02, build: buildLine },
  office: { w: 2.45, d: 1.85, h: 2.28, build: buildOffice },
  vertical: { w: 1.12, d: 0.78, h: 1.46, build: buildWasher },
  dryer: { w: 1.02, d: 1.12, h: 1.26, build: buildDryer },
  manganese: { w: 2.15, d: 1.05, h: 1.12, build: buildFilters },
  crane: { w: 0.72, d: 0.5, h: 1.05, centerY: -0.52, beaconY: -0.95, floating: true, build: buildCrane },
  boiler: { w: 1.35, d: 1.2, h: 1.85, build: buildBoiler },
  water: { w: 1.9, d: 1.3, h: 1.15, build: buildWater },
  tank: { w: 1.2, d: 1.2, h: 2.15, build: buildTank },
};

function addDot(group, em, x, y, z, radius = 0.055) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), em);
  dot.position.set(x, y, z);
  dot.castShadow = false;
  group.add(dot);
}

function buildWasher(group, spec, em) {
  addBox(group, spec.w, spec.h, spec.d, MAT.chassis, 0, spec.h / 2, 0);
  addBox(group, spec.w * 0.72, spec.h * 0.16, 0.02, MAT.panel, 0, spec.h * 0.82, spec.d / 2 + 0.012, false);
  const drum = new THREE.Mesh(new THREE.TorusGeometry(Math.min(spec.w, spec.h) * 0.24, 0.03, 10, 28), MAT.steel);
  drum.position.set(0, spec.h * 0.48, spec.d / 2 + 0.02);
  drum.castShadow = false;
  group.add(drum);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(Math.min(spec.w, spec.h) * 0.2, 24), MAT.glass);
  glass.position.set(0, spec.h * 0.48, spec.d / 2 + 0.028);
  group.add(glass);
  addDot(group, em, spec.w * 0.34, spec.h * 0.86, spec.d / 2 + 0.05);
}

function buildDryer(group, spec, em) {
  buildWasher(group, spec, em);
  addBox(group, spec.w * 0.7, 0.06, spec.d * 0.35, MAT.steel, 0, spec.h + 0.04, 0, false);
}

function buildFolding(group, spec, em) {
  addBox(group, spec.w, spec.h * 0.5, spec.d, MAT.chassis, 0, spec.h * 0.26, 0);
  addBox(group, spec.w * 0.92, 0.07, spec.d * 0.62, MAT.panel, 0, spec.h * 0.55, 0);
  for (const i of [-1, 0, 1]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, spec.d * 0.78, 12), MAT.steel);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(i * spec.w * 0.28, spec.h * 0.68, 0);
    roller.castShadow = true;
    group.add(roller);
  }
  addDot(group, em, spec.w * 0.38, spec.h * 0.42, spec.d / 2 + 0.05);
}

function buildLine(group, spec, em) {
  addBox(group, spec.w, spec.h * 0.42, spec.d, MAT.chassis, 0, spec.h * 0.22, 0);
  addBox(group, spec.w * 0.9, 0.07, spec.d * 0.68, MAT.steel, 0, spec.h * 0.48, 0);
  addBox(group, spec.w * 0.72, 0.025, spec.d * 0.16, MAT.panel, 0, spec.h * 0.54, 0, false);
  addBox(group, spec.w * 0.1, spec.h, spec.d, MAT.panel, -spec.w * 0.44, spec.h / 2, 0);
  addDot(group, em, spec.w * 0.42, spec.h * 0.62, spec.d / 2 + 0.05);
}

function buildPress(group, spec, em) {
  addBox(group, spec.w, spec.h * 0.38, spec.d, MAT.chassis, 0, spec.h * 0.2, 0);
  addBox(group, spec.w * 0.16, spec.h * 0.62, spec.d * 0.16, MAT.steel, 0, spec.h * 0.52, -spec.d * 0.12);
  addBox(group, spec.w * 0.68, 0.07, spec.d * 0.5, MAT.steel, 0, spec.h * 0.84, spec.d * 0.02);
  addDot(group, em, spec.w * 0.28, spec.h * 0.34, spec.d / 2 + 0.05);
}

function buildPressZone(group, spec, em) {
  addBox(group, spec.w, spec.h * 0.28, spec.d, MAT.chassis, 0, spec.h * 0.16, 0);
  for (const x of [-0.38, 0.38]) {
    addBox(group, spec.w * 0.22, spec.h * 0.7, spec.d * 0.45, MAT.panel, x, spec.h * 0.55, 0);
    addDot(group, em, x, spec.h * 0.9, spec.d / 2 + 0.05);
  }
}

function buildTable(group, spec, em) {
  addBox(group, spec.w, 0.07, spec.d, MAT.steel, 0, spec.h - 0.04, 0);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      addBox(group, 0.06, spec.h - 0.08, 0.06, MAT.chassis, x * (spec.w / 2 - 0.1), (spec.h - 0.08) / 2, z * (spec.d / 2 - 0.1));
    }
  }
  addDot(group, em, spec.w * 0.28, spec.h + 0.05, 0);
}

function buildPacker(group, spec, em) {
  addBox(group, spec.w, spec.h * 0.72, spec.d, MAT.chassis, 0, spec.h * 0.36, 0);
  addBox(group, spec.w * 0.2, spec.h * 0.55, spec.d * 0.2, MAT.steel, spec.w * 0.28, spec.h * 0.78, 0);
  addBox(group, spec.w * 0.55, 0.05, spec.d * 0.35, MAT.steel, 0, spec.h * 0.98, 0);
  addDot(group, em, -spec.w * 0.22, spec.h * 0.55, spec.d / 2 + 0.05);
}

function buildBooth(group, spec, em) {
  addBox(group, spec.w, spec.h, spec.d, MAT.panel, 0, spec.h / 2, 0);
  addBox(group, spec.w * 0.38, spec.h * 0.62, 0.03, MAT.chassis, 0, spec.h * 0.38, spec.d / 2 + 0.01);
  addDot(group, em, spec.w * 0.28, spec.h * 0.88, spec.d / 2 + 0.05);
}

function buildFan(group, spec, em) {
  addBox(group, spec.w, spec.h * 0.35, spec.d, MAT.chassis, 0, spec.h * 0.18, 0);
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(spec.w * 0.28, spec.w * 0.28, 0.22, 20), MAT.steel);
  fan.position.y = spec.h * 0.62;
  fan.castShadow = true;
  group.add(fan);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.w * 0.28, 0.02, 8, 24), MAT.steel);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = spec.h * 0.74;
  ring.castShadow = false;
  group.add(ring);
  addDot(group, em, spec.w * 0.32, spec.h * 0.28, spec.d / 2 + 0.04);
}

function buildCompressor(group, spec, em) {
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, spec.w * 0.7, 20), MAT.steel);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-0.05, 0.4, 0);
  tank.castShadow = true;
  group.add(tank);
  addBox(group, spec.w, 0.08, spec.d, MAT.chassis, 0, 0.06, 0);
  addBox(group, 0.38, 0.42, 0.38, MAT.panel, spec.w * 0.28, 0.32, 0);
  addDot(group, em, spec.w * 0.28, 0.52, 0.22, 0.045);
}

function buildFilters(group, spec, em) {
  addBox(group, spec.w, 0.1, spec.d, MAT.chassis, 0, 0.08, 0);
  for (const x of [-0.48, 0.48]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, spec.h * 0.78, 20), MAT.steel);
    tank.position.set(x, spec.h * 0.5, 0);
    tank.castShadow = true;
    group.add(tank);
  }
  addDot(group, em, 0, 0.2, spec.d / 2 + 0.05);
}

function buildCrane(group, spec, em) {
  addBox(group, 0.55, 0.1, 0.28, MAT.steel, 0, -0.02, 0, false);
  addBox(group, 0.02, 0.55, 0.02, MAT.steel, -0.12, -0.36, 0);
  addBox(group, 0.02, 0.55, 0.02, MAT.steel, 0.12, -0.36, 0);
  addBox(group, 0.5, 0.32, 0.36, MAT.chassis, 0, -0.72, 0);
  addDot(group, em, 0, -0.55, 0.22, 0.045);
}

function buildBoiler(group, spec, em) {
  const r = spec.w * 0.34;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, spec.h * 0.72, 24), MAT.chassis);
  body.position.y = spec.h * 0.4;
  body.castShadow = true;
  group.add(body);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.55, 12), MAT.steel);
  stack.position.set(r * 0.35, spec.h * 0.86, 0);
  stack.castShadow = true;
  group.add(stack);
  addDot(group, em, 0, spec.h * 0.45, r + 0.06);
}

function buildTank(group, spec, em) {
  const r = spec.w * 0.4;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, spec.h * 0.82, 28), MAT.steel);
  body.position.y = spec.h * 0.44;
  body.castShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.chassis);
  cap.position.y = spec.h * 0.84;
  group.add(cap);
  addDot(group, em, 0, spec.h * 0.35, r + 0.06);
}

function buildWater(group, spec, em) {
  addBox(group, spec.w, 0.12, spec.d, MAT.chassis, 0, 0.08, 0);
  addBox(group, 0.55, 0.5, 0.45, MAT.panel, -0.45, 0.4, 0);
  for (const x of [0.15, 0.6]) {
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16), MAT.steel);
    pump.position.set(x, 0.4, 0);
    pump.castShadow = true;
    group.add(pump);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, spec.w * 0.7, 10), MAT.steel);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 0.78, 0);
  group.add(pipe);
  addDot(group, em, -0.45, 0.64, 0.26, 0.045);
}

function buildOffice(group, spec, em) {
  addBox(group, spec.w, spec.h, spec.d, MAT.chassis, 0, spec.h / 2, 0);
  addBox(group, spec.w * 1.02, 0.035, spec.d * 1.02, MAT.steel, 0, spec.h * 0.48, 0, false);
  for (const floor of [0.28, 0.74]) {
    addBox(group, spec.w * 0.7, spec.h * 0.18, 0.03, MAT.glass, 0, spec.h * floor, spec.d / 2 + 0.012, false);
    addBox(group, 0.03, spec.h * 0.18, spec.d * 0.55, MAT.glass, spec.w / 2 + 0.012, spec.h * floor, 0, false);
  }
  addDot(group, em, spec.w * 0.22, spec.h * 0.94, spec.d / 2 + 0.06);
}

function buildMachines() {
  const glowMap = glowTexture();
  let sum = new THREE.Vector3();
  for (const device of DEVICES) {
    const spec = SPECS[device.kind];
    const color = new THREE.Color(INDICATOR[indicatorOf(device)].color);
    const em = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.3, roughness: 0.32, metalness: 0.12, toneMapped: false,
    });
    const group = new THREE.Group();
    group.name = device.id;
    const pos = worldOf(device);
    group.position.set(pos.x, pos.y + 0.02, pos.z);
    group.rotation.y = device.rotationY;
    if (!spec.floating) addBox(group, spec.w + 0.08, 0.03, spec.d + 0.08, MAT.rubber, 0, 0.016, 0, false);
    spec.build(group, spec, em);

    const centerY = spec.centerY ?? spec.h / 2;
    const beaconY = spec.beaconY ?? spec.h + 0.07;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), em);
    beacon.position.set(0, beaconY, 0);
    beacon.castShadow = false;
    group.add(beacon);
    const spriteMat = new THREE.SpriteMaterial({
      map: glowMap, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.72,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(beacon.position);
    sprite.scale.setScalar(0.46);
    group.add(sprite);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(spec.w + 0.12, spec.h + 0.12, spec.d + 0.12)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false }),
    );
    edges.position.y = centerY;
    group.add(edges);
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w + 0.16, spec.h + 0.16, spec.d + 0.16),
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    shell.position.y = centerY;
    group.add(shell);
    const footprint = 0.5 * Math.hypot(spec.w, spec.d);
    const ringY = spec.floating ? -0.06 : 0.03;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(footprint + 0.05, footprint + 0.2, 64),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = ringY;
    ring.visible = false;
    group.add(ring);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(footprint + 0.16, 48),
      new THREE.MeshBasicMaterial({
        map: glowMap, color, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = ringY - 0.004;
    halo.visible = false;
    group.add(halo);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(spec.w, 0.7), Math.max(spec.h, 0.7), Math.max(spec.d, 0.7)),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.y = centerY;
    hit.userData.deviceId = device.id;
    group.add(hit);
    pickables.push(hit);

    const label = document.createElement("button");
    label.type = "button";
    label.className = "label";
    label.style.setProperty("--c", `#${color.getHexString()}`);
    label.innerHTML = `<i></i><b></b>`;
    label.querySelector("b").textContent = device.name;
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      selectDevice(device.id);
    });
    labelRoot.appendChild(label);

    const record = { device, spec, group, em, sprite, spriteMat, edges, shell, ring, halo, beacon, label, centerY };
    machineViews.push(record);
    machineById.set(device.id, record);
    scene.add(group);
    sum.add(pos);
  }
  frameTarget = sum.multiplyScalar(1 / DEVICES.length);
  frameTarget.y = 0.9;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function sphericalPosition(target, theta, phi, radius) {
  const s = new THREE.Spherical(radius, phi, theta);
  return new THREE.Vector3().setFromSpherical(s).add(target);
}

function applyView(name, immediate) {
  const view = VIEWS[name];
  const pos = sphericalPosition(frameTarget, view.theta, view.phi, view.radius);
  moveCamera(pos, frameTarget.clone(), immediate);
}

function moveCamera(pos, target, immediate, duration = 0.9) {
  spin = null;
  if (immediate || reduceMotion) {
    tween = null;
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
    return;
  }
  tween = {
    t: 0,
    dur: duration,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: pos,
    toTarget: target,
  };
}

function focusDevice(record, immediate) {
  const center = record.group.position.clone();
  center.y += Math.max(0.4, (record.spec.beaconY ?? record.spec.h) * 0.45);
  const offset = camera.position.clone().sub(controls.target);
  if (offset.lengthSq() < 0.01) offset.set(1, 0.7, 1);
  const radius = Math.max(6.2, Math.max(record.spec.w, record.spec.d, record.spec.h) * 3.1);
  offset.setLength(radius);
  offset.y = Math.max(offset.y, radius * 0.32);
  moveCamera(center.clone().add(offset), center, immediate, 0.85);
}

function selectDevice(id, immediate = false) {
  const record = machineById.get(id);
  if (!record || !record.group.visible) return;
  selectedId = id;
  panelEl.classList.add("open");
  panelEl.setAttribute("aria-hidden", "false");
  panelEl.style.setProperty("--accent", INDICATOR[indicatorOf(record.device)].color);
  renderPanel(record);
  renderList();
  focusDevice(record, immediate || shot === "focus");
}

function deselect() {
  selectedId = null;
  panelEl.classList.remove("open");
  panelEl.setAttribute("aria-hidden", "true");
  renderList();
}

function renderPanel(record) {
  const device = record.device;
  const today = taipeiToday();
  const nextClean = addIsoDays(device.cleaningLastDate, device.cleaningCycleDays);
  const nextMaint = addIsoDays(device.maintenanceLastDate, device.maintenanceCycleDays);
  const indicator = INDICATOR[indicatorOf(device)];
  panelEl.replaceChildren();
  const header = document.createElement("header");
  const titles = document.createElement("div");
  const kind = document.createElement("div");
  kind.className = "sub";
  kind.textContent = `${device.type} · ${KIND_LABEL[device.kind] || device.kind}`;
  const title = document.createElement("h2");
  title.textContent = device.name;
  const id = document.createElement("div");
  id.className = "sub";
  id.textContent = device.id;
  titles.append(kind, title, id);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute("aria-label", "關閉設備資料");
  close.textContent = "×";
  close.onclick = deselect;
  header.append(titles, close);

  const pills = document.createElement("div");
  pills.className = "pills";
  for (const [text, color] of [
    [device.status, indicator.color],
    [MAP_STATE_LABEL[device.mapState], INDICATOR[device.mapState === "issue" ? "alarm" : device.mapState === "overdue" ? "warn" : device.mapState === "due" ? "due" : device.mapState === "stopped" ? "stopped" : "ok"].color],
    [device.level, "#9fd4ea"],
  ]) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.style.setProperty("--c", color);
    pill.textContent = text;
    pills.append(pill);
  }

  const locTitle = document.createElement("h3");
  locTitle.textContent = "位置";
  const loc = document.createElement("div");
  const degrees = (device.rotationY * 180) / Math.PI;
  const rows = [
    ["配置座標 x / y / z", `${device.x} / ${device.y} / ${device.z}`],
    ["旋轉", `${degrees.toFixed(1)}°`],
    ["樓層欄位", device.level],
    ["平面圖熱區", `${device.mapRect[0]}, ${device.mapRect[1]} · ${device.mapRect[2]}×${device.mapRect[3]} px`],
    ["模型 kind", device.kind],
  ];
  for (const [label, value] of rows) loc.append(kv(label, value));

  const careTitle = document.createElement("h3");
  careTitle.textContent = "運轉與保養";
  const care = document.createElement("div");
  const careRows = [
    ["啟用日期", device.commissionedDate || "未填"],
    ["廠商", device.vendor || "未填"],
    ["上次清潔", device.cleaningLastDate || "未填"],
    ["清潔週期", `${device.cleaningCycleDays} 天`],
    ["下次清潔", nextClean ? `${nextClean}${nextClean < today ? "（已逾期）" : ""}` : "未排程"],
    ["上次保養", device.maintenanceLastDate || "未填"],
    ["保養週期", `${device.maintenanceCycleDays} 天`],
    ["下次保養", nextMaint ? `${nextMaint}${nextMaint < today ? "（已逾期）" : ""}` : "未排程"],
  ];
  for (const [label, value] of careRows) care.append(kv(label, value));

  panelEl.append(header, pills, locTitle, loc, careTitle, care);
  if (device.notes) {
    const noteTitle = document.createElement("h3");
    noteTitle.textContent = "備註";
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = device.notes;
    panelEl.append(noteTitle, note);
  }
  if (device.repairs?.length) {
    const repairTitle = document.createElement("h3");
    repairTitle.textContent = "維修紀錄（示範）";
    panelEl.append(repairTitle);
    for (const repair of device.repairs) {
      const item = document.createElement("div");
      item.className = "repair";
      item.textContent = `${repair.date} · ${repair.issue}${repair.parts ? " · " + repair.parts : ""}`;
      panelEl.append(item);
    }
  }
  const fine = document.createElement("p");
  fine.className = "fine";
  fine.textContent = "座標、名稱、分類、旋轉與樓層取自正式設備配置。狀態、查檢標記與日期是模擬示範，此畫面唯讀，不會寫回正式系統。平面座標在場景中乘上 0.05；y=36 畫在架高平台，y=76 畫在天車軌。";
  panelEl.append(fine);
}

function kv(label, value) {
  const row = document.createElement("div");
  row.className = "kv";
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("b");
  strong.textContent = value;
  row.append(span, strong);
  return row;
}

function deviceVisible(device) {
  const type = $("typeFilter").value;
  const query = $("search").value.trim().toLowerCase();
  const typeOk = !type || type === "全部設備" || device.type === type;
  const statusOk = statusFilter === "all" || (statusFilter === "alert" ? indicatorOf(device) !== "ok" : device.status === statusFilter);
  const queryOk = !query || `${device.name} ${device.id}`.toLowerCase().includes(query);
  return typeOk && statusOk && queryOk;
}

function applyFilter() {
  for (const record of machineViews) record.group.visible = deviceVisible(record.device);
  if (selectedId && !machineById.get(selectedId).group.visible) deselect();
  renderList();
}

function renderStats() {
  const counts = { 正常: 0, 待保養: 0, 維修中: 0, 停用: 0 };
  for (const device of DEVICES) counts[device.status] += 1;
  const root = $("stats");
  root.replaceChildren();
  for (const [key, cls] of [["正常", "ok"], ["待保養", "warn"], ["維修中", "alarm"], ["停用", "off"]]) {
    const item = document.createElement("div");
    item.className = `stat ${cls}`;
    const value = document.createElement("b");
    value.textContent = String(counts[key]);
    const label = document.createElement("span");
    label.textContent = key;
    item.append(value, label);
    root.append(item);
  }
}

function renderList() {
  const query = $("search").value.trim();
  const rows = machineViews
    .map((record) => record.device)
    .filter((device) => deviceVisible(device) && (query || indicatorOf(device) !== "ok"));
  $("listTitle").textContent = query ? `搜尋結果 · ${rows.length}` : `需關注 · ${rows.length}`;
  const list = $("alertList");
  list.replaceChildren();
  for (const device of rows) {
    const key = indicatorOf(device);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "alert-row";
    button.style.setProperty("--c", INDICATOR[key].color);
    button.setAttribute("aria-current", device.id === selectedId ? "true" : "false");
    const dot = document.createElement("i");
    const text = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = device.name;
    const meta = document.createElement("small");
    meta.textContent = `${device.status} · ${MAP_STATE_LABEL[device.mapState]} · ${device.id}`;
    text.append(name, meta);
    button.append(dot, text);
    button.onclick = () => selectDevice(device.id);
    list.append(button);
  }
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = query ? "沒有符合的設備" : "目前沒有需關注的設備";
    list.append(empty);
  }
}

function buildHud() {
  renderStats();
  const type = $("typeFilter");
  for (const name of TYPE_ORDER) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    type.append(option);
  }
  const filters = $("statusFilters");
  for (const [value, label] of [["all", "全部"], ["正常", "正常"], ["待保養", "待保養"], ["維修中", "維修中"], ["停用", "停用"], ["alert", "需關注"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", value === "all" ? "true" : "false");
    button.onclick = () => {
      statusFilter = value;
      for (const peer of filters.children) peer.setAttribute("aria-pressed", peer === button ? "true" : "false");
      applyFilter();
    };
    filters.append(button);
  }
  type.onchange = applyFilter;
  $("search").oninput = applyFilter;
  $("search").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const first = machineViews.find((record) => record.group.visible);
    if (first) selectDevice(first.device.id);
  });
  renderList();
  tickClock();
  setInterval(tickClock, 1000);
}

function tickClock() {
  const now = new Date();
  $("clockTime").textContent = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(now);
  $("clockDate").textContent = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short",
  }).format(now);
}

function bind() {
  $("viewIso").onclick = () => applyView("iso", false);
  $("viewSide").onclick = () => applyView("side", false);
  $("viewTop").onclick = () => applyView("top", false);
  $("viewSpin").onclick = () => {
    tween = null;
    const offset = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    spin = { sph, start: sph.theta, elapsed: 0, dur: reduceMotion ? 0.01 : 8.5 };
  };
  $("zoomIn").onclick = () => zoomBy(0.78);
  $("zoomOut").onclick = () => zoomBy(1.28);
  $("toggleLabels").onclick = (event) => {
    showAllLabels = !showAllLabels;
    event.currentTarget.setAttribute("aria-pressed", String(showAllLabels));
    event.currentTarget.textContent = showAllLabels ? "隱藏名稱" : "全部名稱";
  };
  const canvas = renderer.domElement;
  let down = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!down || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved < 6) pick(event.clientX, event.clientY, true);
  });
  canvas.addEventListener("pointermove", (event) => {
    hoverEl.style.left = `${event.clientX + 14}px`;
    hoverEl.style.top = `${event.clientY + 16}px`;
    if (event.buttons) return;
    pick(event.clientX, event.clientY, false);
  });
  canvas.addEventListener("pointerleave", () => {
    hoveredId = null;
    hoverEl.hidden = true;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") deselect();
  });
  addEventListener("resize", resize);
}

function pick(clientX, clientY, commit) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  const hit = hits.find((item) => {
    const record = machineById.get(item.object.userData.deviceId);
    return record && record.group.visible;
  });
  if (!commit) {
    hoveredId = hit ? hit.object.userData.deviceId : null;
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    if (!hoveredId) {
      hoverEl.hidden = true;
      return;
    }
    const device = machineById.get(hoveredId).device;
    hoverEl.hidden = false;
    hoverEl.replaceChildren();
    const name = document.createElement("b");
    name.textContent = device.name;
    const meta = document.createElement("span");
    meta.textContent = `${device.id} · ${device.status} · ${MAP_STATE_LABEL[device.mapState]} · ${device.level}`;
    hoverEl.append(name, meta);
    return;
  }
  if (!hit) deselect();
  else selectDevice(hit.object.userData.deviceId);
}

function zoomBy(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const dist = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  offset.setLength(dist);
  moveCamera(controls.target.clone().add(offset), controls.target.clone(), false, 0.35);
}

function resize() {
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}

function updateMotion(dt) {
  if (tween) {
    tween.t += dt;
    const k = smooth(Math.min(1, tween.t / tween.dur));
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    if (tween.t >= tween.dur) tween = null;
  }
  if (spin) {
    spin.elapsed += dt;
    const k = Math.min(1, spin.elapsed / spin.dur);
    const eased = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
    spin.sph.theta = spin.start - eased * Math.PI * 2;
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spin.sph));
    if (k >= 1) spin = null;
  }
  controls.update();
}

function updateGlow(time) {
  for (const record of machineViews) {
    const selected = record.device.id === selectedId;
    const key = indicatorOf(record.device);
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.5);
    let intensity = key === "stopped" ? 0.35 : key === "ok" ? 0.8 : 1.05;
    if (selected) intensity = 2.1 + 1.1 * pulse;
    else if (key === "alarm") intensity = 0.55 + 1.15 * (0.5 + 0.5 * Math.sin(time * 6.4));
    else if (key === "warn") intensity = 0.9 + 0.35 * Math.sin(time * 2.3);
    else if (key === "due") intensity = 0.85 + 0.25 * Math.sin(time * 2);
    record.em.emissiveIntensity = intensity;
    const dotGlow = selected ? 1.05 + 0.28 * Math.sin(time * 3.5) : key === "alarm" ? 0.62 + 0.18 * Math.sin(time * 6.4) : 0.42;
    record.sprite.scale.setScalar(dotGlow);
    record.spriteMat.opacity = selected ? 0.95 : key === "stopped" ? 0.28 : 0.62;
    record.edges.visible = selected;
    record.shell.visible = selected;
    record.ring.visible = selected;
    record.halo.visible = selected;
    if (selected) {
      record.edges.material.opacity = 0.5 + 0.4 * pulse;
      record.shell.material.opacity = 0.16 + 0.18 * pulse;
      record.ring.material.opacity = 0.55 + 0.4 * pulse;
      record.halo.material.opacity = 0.22 + 0.16 * pulse;
    }
    record.label.classList.toggle("on", selected || record.device.id === hoveredId);
  }
  if (selectedId && machineById.get(selectedId)) {
    const record = machineById.get(selectedId);
    record.beacon.getWorldPosition(tmp);
    selectLight.position.copy(tmp);
    selectLight.color.copy(record.em.color);
    selectLight.intensity = 3.2 + 1.6 * (0.5 + 0.5 * Math.sin(time * 3.5));
  } else selectLight.intensity = 0;
}

function updateLabels() {
  const dist = camera.position.distanceTo(controls.target);
  for (const record of machineViews) {
    const key = indicatorOf(record.device);
    const interesting = key !== "ok";
    const show = record.group.visible && (showAllLabels || interesting || record.device.id === selectedId || record.device.id === hoveredId) && (showAllLabels || dist < 24 || interesting || record.device.id === selectedId || record.device.id === hoveredId);
    if (!show) {
      record.label.style.display = "none";
      continue;
    }
    record.beacon.getWorldPosition(tmp);
    tmp.project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.15 || Math.abs(tmp.y) > 1.15) {
      record.label.style.display = "none";
      continue;
    }
    record.label.style.display = "flex";
    record.label.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
    record.label.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
  }
}

function updateBearing() {
  tmp.copy(camera.position).sub(controls.target);
  const sph = new THREE.Spherical().setFromVector3(tmp);
  const deg = (THREE.MathUtils.radToDeg(sph.theta) % 360 + 360) % 360;
  $("bearing").textContent = `方位 ${Math.round(deg)}°`;
}

let frames = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  updateMotion(dt);
  updateGlow(time);
  updateLabels();
  updateBearing();
  composer.render();
  frames += 1;
  if (frames === 3) {
    $("boot").classList.add("hide");
    window.__simulatorReady = true;
  }
}

addEventListener("error", () => {
  const bootEl = $("boot");
  if (bootEl && !window.__simulatorReady) bootEl.querySelector("span").textContent = "場景建立失敗";
});

boot();
