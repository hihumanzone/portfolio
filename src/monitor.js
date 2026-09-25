import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import content from './content.json';

/**
 * High-Resolution Procedural Wood Texture Generator (Color, Bump, Roughness)
 * Creates authentic dark American walnut with organic grain, cathedral arches, and satin lacquer.
 */
function createDetailedWoodTextures() {
  const width = 2048;
  const height = 1024;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const cctx = colorCanvas.getContext('2d', { alpha: false });

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bctx = bumpCanvas.getContext('2d', { alpha: false });

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rctx = roughCanvas.getContext('2d', { alpha: false });

  // Fill base coats - Deep rich American Walnut
  cctx.fillStyle = '#3a2416';
  cctx.fillRect(0, 0, width, height);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, width, height);

  // Soft satin furniture lacquer finish (roughness ~0.55)
  rctx.fillStyle = '#8c8c8c';
  rctx.fillRect(0, 0, width, height);

  const plankCount = 5;
  const plankHeight = height / plankCount;

  // Render each plank horizontally with authentic wood grain
  for (let p = 0; p < plankCount; p++) {
    const yStart = p * plankHeight;
    const yEnd = yStart + plankHeight;

    // Organic warmth variation per plank
    const rBase = 54 + (p % 2 === 0 ? 4 : -3) + Math.sin(p * 1.7) * 3;
    const gBase = 35 + (p % 2 === 0 ? 3 : -2) + Math.sin(p * 1.7) * 2;
    const bBase = 22 + (p % 2 === 0 ? 2 : -1) + Math.sin(p * 1.7) * 1;

    const plankGrad = cctx.createLinearGradient(0, yStart, 0, yEnd);
    plankGrad.addColorStop(0, `rgb(${rBase - 6}, ${gBase - 4}, ${bBase - 3})`);
    plankGrad.addColorStop(0.25, `rgb(${rBase + 3}, ${gBase + 2}, ${bBase + 1})`);
    plankGrad.addColorStop(0.55, `rgb(${rBase + 6}, ${gBase + 4}, ${bBase + 3})`);
    plankGrad.addColorStop(0.85, `rgb(${rBase}, ${gBase}, ${bBase})`);
    plankGrad.addColorStop(1, `rgb(${rBase - 8}, ${gBase - 6}, ${bBase - 4})`);

    cctx.fillStyle = plankGrad;
    cctx.fillRect(0, yStart, width, plankHeight);

    // Subtle cathedral wood grain arches & flowing fibers
    const archCenterX = width * (0.28 + (p * 0.23) % 0.5);
    const waveFreq1 = 0.0018 + (p % 3) * 0.0006;
    const waveFreq2 = 0.0055 + (p % 2) * 0.0012;
    const amp1 = 7 + (p % 3) * 3;
    const amp2 = 2.2;

    // Continuous fine wood fibers (smooth continuous curves, no step artifacts)
    // One shared Path2D per fiber is stroked onto all three contexts: byte-
    // identical pixels at ~1/3 of the path-construction cost (the per-point
    // exp/sin math runs once instead of three times).
    const fiberCount = 420;
    const halfPlank = plankHeight * 0.5;
    for (let i = 0; i < fiberCount; i++) {
      const baseY = yStart + Math.random() * plankHeight;
      const distFromPlankCenter = Math.abs(baseY - (yStart + halfPlank)) / halfPlank;

      // Cathedral grain curvature
      const archInfluence = (1 - distFromPlankCenter) * 10;
      const alpha = 0.022 + Math.random() * 0.05;
      const isPore = Math.random() > 0.85;

      const fiberPath = new Path2D();
      fiberPath.moveTo(0, baseY);

      // Stepping x += 4 for perfectly smooth, continuous wood grain curves
      for (let x = 4; x <= width; x += 4) {
        const dx = (x - archCenterX) / width;
        const arch = Math.exp(-dx * dx * 7) * archInfluence;
        const wave = Math.sin(x * waveFreq1 + p) * amp1 + Math.sin(x * waveFreq2 + p * 2) * amp2;
        fiberPath.lineTo(x, baseY + wave + arch);
      }

      const lineWidth = isPore ? 0.7 : 1.1 + Math.random() * 1.3;
      cctx.lineWidth = lineWidth;
      bctx.lineWidth = lineWidth;
      rctx.lineWidth = lineWidth;

      // Soft natural dark wood tones — completely eliminating bright white speckles and harsh ridges
      cctx.strokeStyle = `rgba(18, 10, 5, ${alpha})`;
      bctx.strokeStyle = `rgba(112, 112, 112, ${alpha * 0.7})`; // very subtle pore indentation
      rctx.strokeStyle = `rgba(146, 146, 146, ${alpha * 0.5})`; // gentle diffuse pore texture

      cctx.stroke(fiberPath);
      bctx.stroke(fiberPath);
      rctx.stroke(fiberPath);
    }

    // Micro-pores (natural hardwood pore texture, 20-50px fine hairlines)
    for (let j = 0; j < 500; j++) {
      const px = Math.random() * (width - 50);
      const py = yStart + Math.random() * plankHeight;
      const pLen = 14 + Math.random() * 32;
      const pAlpha = 0.025 + Math.random() * 0.035;

      cctx.fillStyle = `rgba(14, 8, 4, ${pAlpha})`;
      cctx.fillRect(px, py, pLen, 0.8);

      bctx.fillStyle = `rgba(105, 105, 105, ${pAlpha * 0.5})`;
      bctx.fillRect(px, py, pLen, 0.8);
    }

    // Clean, micro-beveled plank joint (dark groove line + subtle edge highlight)
    cctx.fillStyle = 'rgba(10, 5, 2, 0.72)';
    cctx.fillRect(0, yEnd - 2, width, 2);
    bctx.fillStyle = '#222222';
    bctx.fillRect(0, yEnd - 2, width, 2);

    // Subtle edge highlight on adjacent plank edge
    if (p > 0) {
      cctx.fillStyle = 'rgba(215, 175, 135, 0.08)';
      cctx.fillRect(0, yStart, width, 1.2);
      bctx.fillStyle = '#9c9c9c';
      bctx.fillRect(0, yStart, width, 1.2);
    }
  }

  // Clamped texture mapping: ZERO repeating seam across the tabletop
  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.wrapS = THREE.ClampToEdgeWrapping;
  colorTex.wrapT = THREE.ClampToEdgeWrapping;
  colorTex.repeat.set(1, 1);
  colorTex.anisotropy = 4;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.ClampToEdgeWrapping;
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;
  bumpTex.repeat.set(1, 1);
  bumpTex.anisotropy = 4;

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = THREE.ClampToEdgeWrapping;
  roughTex.wrapT = THREE.ClampToEdgeWrapping;
  roughTex.repeat.set(1, 1);
  roughTex.anisotropy = 4;

  return { colorTex, bumpTex, roughTex };
}

/**
 * Procedural Wood Edge Texture Generator for the front edge of the table
 */
function createWoodEdgeTextures() {
  const width = 2048;
  const height = 256;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const cctx = colorCanvas.getContext('2d', { alpha: false });

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bctx = bumpCanvas.getContext('2d', { alpha: false });

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rctx = roughCanvas.getContext('2d', { alpha: false });

  // Deep rich walnut base matching tabletop
  cctx.fillStyle = '#342013';
  cctx.fillRect(0, 0, width, height);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, width, height);

  rctx.fillStyle = '#8c8c8c';
  rctx.fillRect(0, 0, width, height);

  // Subtle horizontal gradient across edge
  const grad = cctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#462c1b');
  grad.addColorStop(0.25, '#3b2517');
  grad.addColorStop(0.75, '#2e1c11');
  grad.addColorStop(1, '#22140d');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, width, height);

  // Horizontal wood grain edge lines (one shared Path2D stroked 3x: identical pixels)
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * height;
    const alpha = 0.025 + Math.random() * 0.045;
    const edgePath = new Path2D();
    edgePath.moveTo(0, y);

    for (let x = 8; x <= width; x += 8) {
      const wave = Math.sin(x * 0.003) * 2;
      edgePath.lineTo(x, y + wave);
    }

    cctx.strokeStyle = `rgba(14, 8, 4, ${alpha})`;
    bctx.strokeStyle = `rgba(115, 115, 115, ${alpha * 0.6})`;
    rctx.strokeStyle = `rgba(150, 150, 150, ${alpha * 0.5})`;
    cctx.lineWidth = 1 + Math.random();
    bctx.lineWidth = 1 + Math.random();
    rctx.lineWidth = 1 + Math.random();
    cctx.stroke(edgePath);
    bctx.stroke(edgePath);
    rctx.stroke(edgePath);
  }

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.wrapS = THREE.ClampToEdgeWrapping;
  colorTex.wrapT = THREE.ClampToEdgeWrapping;
  colorTex.anisotropy = 4;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.ClampToEdgeWrapping;
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;
  bumpTex.anisotropy = 4;

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = THREE.ClampToEdgeWrapping;
  roughTex.wrapT = THREE.ClampToEdgeWrapping;
  roughTex.anisotropy = 4;

  return { colorTex, bumpTex, roughTex };
}

/**
 * Procedural Badge Texture Generator: "RIDDHIMAN KUNDAL PORTFOLIO"
 */
function createBadgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 92;
  const ctx = canvas.getContext('2d', { alpha: false });

  // Badge metallic dark slate background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 92);
  bgGrad.addColorStop(0, '#1c1f26');
  bgGrad.addColorStop(0.5, '#12141a');
  bgGrad.addColorStop(1, '#0b0d11');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 640, 92);

  // Metallic border
  ctx.strokeStyle = '#484f5e';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 636, 88);

  // Inner metallic highlight bevel
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, 632, 84);

  // Retro 4-color spectrum stripe (Red, Amber, Green, Blue)
  const stripeX = 18;
  const stripeW = 8;
  const colors = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(stripeX, 16 + i * 15, stripeW, 14);
  }

  // Text: RIDDHIMAN KUNDAL PORTFOLIO
  const badgeTitle = `${content.personal?.name || 'RIDDHIMAN KUNDAL'} PORTFOLIO`;
  ctx.font = 'bold 26px "Fira Code", monospace';
  ctx.fillStyle = '#f0ece2';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fillText(badgeTitle, 42, 44);

  // Subtitle: HIGH RESOLUTION COLOR DISPLAY • MODEL RK-2026
  ctx.font = '500 15px "Fira Code", monospace';
  ctx.fillStyle = '#9e9686';
  ctx.shadowBlur = 0;
  ctx.fillText('HIGH RESOLUTION COLOR DISPLAY • MODEL RK-2026', 44, 70);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Procedural Plastic Stipple Texture for Vintage Beige Chassis
 */
function createPlasticTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: false });

  ctx.fillStyle = '#cfc6b5';
  ctx.fillRect(0, 0, 256, 256);

  // Stippled plastic micro-dots, batched into 2 fills (identical pixels, no
  // 4000 fillStyle state changes)
  const darkDots = new Path2D();
  const lightDots = new Path2D();
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    if (Math.random() > 0.5) {
      darkDots.rect(x, y, 1.5, 1.5);
    } else {
      lightDots.rect(x, y, 1.5, 1.5);
    }
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
  ctx.fill(darkDots);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fill(lightDots);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

/**
 * Fullscreen Button Icon Textures (expand / compress glyphs on dark slate).
 * Rendered once; the face material swaps maps when fullscreen state changes.
 */
const FS_EXPAND_PATH = 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3';
const FS_COMPRESS_PATH = 'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3';

function createFullscreenIconTexture(pathData) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { alpha: false });

  const bgGrad = ctx.createLinearGradient(0, 0, 0, 128);
  bgGrad.addColorStop(0, '#1c1f26');
  bgGrad.addColorStop(0.5, '#12141a');
  bgGrad.addColorStop(1, '#0b0d11');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#484f5e';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 122, 122);

  // Center the 24-unit glyph grid (scale 4 => 96px, 16px margins)
  ctx.translate(16, 16);
  ctx.scale(4, 4);
  ctx.strokeStyle = '#f0ece2';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(pathData));

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * True 3D Retro Monitor & Desk Application
 */

// Content-independent procedural textures are generated once per page load and
// shared (identical pixels; skips ~7M canvas ops on any re-instantiation).
let _cachedWoodTextures = null;
let _cachedWoodEdgeTextures = null;
let _cachedPlasticTexture = null;

function getWoodTextures() {
  if (!_cachedWoodTextures) _cachedWoodTextures = createDetailedWoodTextures();
  return _cachedWoodTextures;
}

function getWoodEdgeTextures() {
  if (!_cachedWoodEdgeTextures) _cachedWoodEdgeTextures = createWoodEdgeTextures();
  return _cachedWoodEdgeTextures;
}

function getPlasticTexture() {
  if (!_cachedPlasticTexture) _cachedPlasticTexture = createPlasticTexture();
  return _cachedPlasticTexture;
}

class RetroWorkspaceApp {
  constructor() {
    this.webglContainer = document.getElementById('webgl-container');
    this.css3dContainer = document.getElementById('css3d-container');
    this.portraitAlert = document.getElementById('portrait-alert');
    this.dismissBtn = document.getElementById('dismiss-portrait-alert');
    this.alertDismissed = false;

    if (content.meta?.siteTitle) {
      document.title = content.meta.siteTitle;
    }
    if (content.meta?.landscapeAlert) {
      const heading = document.querySelector('.alert-heading');
      const body = document.querySelector('.alert-body');
      if (heading && content.meta.landscapeAlert.heading) heading.textContent = content.meta.landscapeAlert.heading;
      if (body && content.meta.landscapeAlert.body) body.textContent = content.meta.landscapeAlert.body;
      if (this.dismissBtn && content.meta.landscapeAlert.dismissText) this.dismissBtn.textContent = content.meta.landscapeAlert.dismissText;
    }

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-999, -999);
    this.badgeHovered = false;
    this.badgePressing = false;
    this.badgeTargetZ = 0;
    // Fullscreen 3D push-button state (mirrors the badge button pattern)
    this.fsHovered = false;
    this.fsPressing = false;
    this.fsTargetZ = 0;
    this._fsSupported = true;
    // Coalesce pointermove raycasts to one check per frame
    this._hoverCheckQueued = false;
    this._animateBound = null;
    this._resizeQueued = false;
    this._isVisible = true;
    // Static-scene fast path: shadows + WebGL re-render only when dirty
    this._sceneDirty = true;
    this._warmupFrames = 4;
    this._badgeTargets = null;

    this.initScene();
    this.initLights();
    this.createTableMesh();
    this.createMonitorMesh();
    this.freezeStaticMatrices();
    this.createCSS3DScreen();
    this.initEvents();
    this.initFullscreen();
    this.onResize();
    this.animate();

    window.__retroApp = this;
  }

  initScene() {
    // 1. WebGL Scene & Renderer
    this.scene = new THREE.Scene();
    // Solid black background
    this.scene.background = new THREE.Color(0x000000);

    // 2. CSS3D Scene & Renderer
    this.cssScene = new THREE.Scene();

    // 3. Camera (viewed from a subtle bottom-left angle, zoomed in)
    this.camera = new THREE.PerspectiveCamera(
      32.5,
      window.innerWidth / window.innerHeight,
      1,
      8000
    );
    this.camera.position.set(-115, 390, 1680);
    this.cameraTarget = new THREE.Vector3(-15, 460, 0);
    this.camera.lookAt(this.cameraTarget);

    // 4. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Fully static scene (only the badge button ever moves): never re-render
    // the shadow map unless a WebGL frame is explicitly requested below.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.webglContainer.appendChild(this.renderer.domElement);

    // 5. CSS3D Renderer
    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    this.css3dContainer.appendChild(this.cssRenderer.domElement);
  }

  initLights() {
    // 1. Key Directional Light (Warm studio desk lamp from top-left, casts real-time soft shadows)
    this.keyLight = new THREE.DirectionalLight(0xffeedd, 2.2);
    this.keyLight.position.set(-600, 1100, 900);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 200;
    this.keyLight.shadow.camera.far = 3200;
    this.keyLight.shadow.camera.left = -1100;
    this.keyLight.shadow.camera.right = 1100;
    this.keyLight.shadow.camera.top = 1300;
    this.keyLight.shadow.camera.bottom = -900;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.05;
    this.scene.add(this.keyLight);

    // 2. Soft Fill Light (Brings out right chamfers and bevels)
    const fillLight = new THREE.DirectionalLight(0x557799, 0.85);
    fillLight.position.set(700, 600, 600);
    this.scene.add(fillLight);

    // 3. Rim / Top Light (Highlights top cowl and edges against black void)
    const rimLight = new THREE.DirectionalLight(0x7799bb, 0.95);
    rimLight.position.set(0, 900, -700);
    this.scene.add(rimLight);

    // 4. Soft Ambient Studio Light
    const ambientLight = new THREE.AmbientLight(0x1a1a24, 0.7);
    this.scene.add(ambientLight);
  }

  /**
   * Builds the enhanced pure 3D Desk/Table geometry
   */
  createTableMesh() {
    this.woodTextures = getWoodTextures();
    this.woodEdgeTextures = getWoodEdgeTextures();

    // High-end satin furniture lacquer walnut material for top surface
    const topMat = new THREE.MeshStandardMaterial({
      map: this.woodTextures.colorTex,
      bumpMap: this.woodTextures.bumpTex,
      bumpScale: 0.16,
      roughnessMap: this.woodTextures.roughTex,
      roughness: 0.5,
      metalness: 0.0
    });

    // Matching edge-grain walnut material for front, sides, and legs
    const edgeMat = new THREE.MeshStandardMaterial({
      map: this.woodEdgeTextures.colorTex,
      bumpMap: this.woodEdgeTextures.bumpTex,
      bumpScale: 0.14,
      roughnessMap: this.woodEdgeTextures.roughTex,
      roughness: 0.48,
      metalness: 0.0
    });

    this.tableGroup = new THREE.Group();

    // BoxGeometry materials: [+X, -X, +Y, -Y, +Z, -Z]
    // Top surface (+Y) has topMat; Front face (+Z) and sides have edgeMat
    const slabMaterials = [
      edgeMat, // +X right
      edgeMat, // -X left
      topMat,  // +Y top surface (seamless horizontal planks)
      edgeMat, // -Y bottom
      edgeMat, // +Z front edge
      edgeMat  // -Z back edge
    ];

    // 1. Single Solid Seamless Tabletop Slab (Top surface at y = -95, front edge at z = 650)
    const slabGeo = new THREE.BoxGeometry(2800, 56, 1700);
    const slabMesh = new THREE.Mesh(slabGeo, slabMaterials);
    slabMesh.position.set(0, -123, -200);
    slabMesh.receiveShadow = true;
    this.tableGroup.add(slabMesh);

    // 2. Heavy Solid Timber Table Legs with Dark Brass Leveler Feet
    const legGeo = new THREE.BoxGeometry(100, 650, 100);
    const brassFootGeo = new THREE.BoxGeometry(106, 25, 106);
    const brassFootMat = new THREE.MeshStandardMaterial({
      color: 0x221a12,
      roughness: 0.35,
      metalness: 0.6
    });

    const legPositions = [
      [-1200, -450, 500],
      [1200, -450, 500],
      [-1200, -450, -900],
      [1200, -450, -900]
    ];
    // Legs + feet as single-draw instanced meshes (identical transforms/shadows)
    const _legDummy = new THREE.Object3D();
    const instancedLegs = new THREE.InstancedMesh(legGeo, edgeMat, legPositions.length);
    instancedLegs.castShadow = true;
    instancedLegs.receiveShadow = true;
    const instancedFeet = new THREE.InstancedMesh(brassFootGeo, brassFootMat, legPositions.length);
    legPositions.forEach(([x, y, z], idx) => {
      _legDummy.position.set(x, y, z);
      _legDummy.rotation.set(0, 0, 0);
      _legDummy.scale.set(1, 1, 1);
      _legDummy.updateMatrix();
      instancedLegs.setMatrixAt(idx, _legDummy.matrix);

      _legDummy.position.set(x, -760, z);
      _legDummy.updateMatrix();
      instancedFeet.setMatrixAt(idx, _legDummy.matrix);
    });
    instancedLegs.instanceMatrix.needsUpdate = true;
    instancedFeet.instanceMatrix.needsUpdate = true;
    this.tableGroup.add(instancedLegs, instancedFeet);

    // 3. Table Support Apron/Skirt
    const apronGeo = new THREE.BoxGeometry(2450, 75, 24);
    const apronFront = new THREE.Mesh(apronGeo, edgeMat);
    apronFront.position.set(0, -188, 520);
    apronFront.receiveShadow = true;
    this.tableGroup.add(apronFront);

    // 4. Subtle CRT Screen Glow Reflection onto Wood Table
    const screenBounce = new THREE.PointLight(0x78bceb, 0.3, 450);
    screenBounce.position.set(0, 30, 240);
    this.tableGroup.add(screenBounce);

    this.scene.add(this.tableGroup);
  }

  /**
   * Builds the pure 3D Vintage CRT Monitor geometry & materials
   */
  createMonitorMesh() {
    this.monitorGroup = new THREE.Group();
    // Subtle 2.5-degree upward tilt typical of desktop CRT workstations
    this.monitorGroup.rotation.x = -0.04;

    this.plasticTexture = getPlasticTexture();

    // Main Vintage Beige Material
    this.chassisMat = new THREE.MeshStandardMaterial({
      color: 0xcfc6b5,
      bumpMap: this.plasticTexture,
      bumpScale: 0.6,
      roughness: 0.58,
      metalness: 0.04
    });

    // Darker Bezel & Recess Material
    this.darkBezelMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.65,
      metalness: 0.05
    });

    // Outer Bezel Rim Material (Intermediate warm tone)
    this.bezelRimMat = new THREE.MeshStandardMaterial({
      color: 0xb5ab9a,
      roughness: 0.52,
      metalness: 0.05
    });

    // -------------------------------------------------------------------------
    // 1. Main Tapered CRT Housing Body
    // -------------------------------------------------------------------------
    // Top Cowl / Hood
    const topPanelGeo = new THREE.BoxGeometry(1180, 40, 680);
    const topPanel = new THREE.Mesh(topPanelGeo, this.chassisMat);
    topPanel.position.set(0, 940, -320);
    topPanel.castShadow = true;
    topPanel.receiveShadow = true;
    this.monitorGroup.add(topPanel);

    // Bottom Base Panel of Cabinet
    const bottomPanelGeo = new THREE.BoxGeometry(1160, 40, 640);
    const bottomPanel = new THREE.Mesh(bottomPanelGeo, this.chassisMat);
    bottomPanel.position.set(0, 60, -300);
    bottomPanel.castShadow = true;
    bottomPanel.receiveShadow = true;
    this.monitorGroup.add(bottomPanel);

    // Left Side Cheek
    const leftCheekGeo = new THREE.BoxGeometry(40, 880, 660);
    const leftCheek = new THREE.Mesh(leftCheekGeo, this.chassisMat);
    leftCheek.position.set(-570, 500, -310);
    leftCheek.castShadow = true;
    leftCheek.receiveShadow = true;
    this.monitorGroup.add(leftCheek);

    // Right Side Cheek
    const rightCheekGeo = new THREE.BoxGeometry(40, 880, 660);
    const rightCheek = new THREE.Mesh(rightCheekGeo, this.chassisMat);
    rightCheek.position.set(570, 500, -310);
    rightCheek.castShadow = true;
    rightCheek.receiveShadow = true;
    this.monitorGroup.add(rightCheek);

    // Tapered Rear Enclosure
    const rearCapGeo = new THREE.BoxGeometry(780, 640, 60);
    const rearCap = new THREE.Mesh(rearCapGeo, this.chassisMat);
    rearCap.position.set(0, 500, -660);
    rearCap.castShadow = true;
    this.monitorGroup.add(rearCap);

    // -------------------------------------------------------------------------
    // 2. Front Bezel Frame (Frames the 1024x768 screen cavity at z = 0)
    // -------------------------------------------------------------------------
    // Top Front Bezel
    const fTopGeo = new THREE.BoxGeometry(1180, 76, 50);
    const fTop = new THREE.Mesh(fTopGeo, this.chassisMat);
    fTop.position.set(0, 922, 12);
    fTop.castShadow = true;
    fTop.receiveShadow = true;
    this.monitorGroup.add(fTop);

    // Left Front Bezel
    const fLeftGeo = new THREE.BoxGeometry(78, 768, 50);
    const fLeft = new THREE.Mesh(fLeftGeo, this.chassisMat);
    fLeft.position.set(-551, 500, 12);
    fLeft.castShadow = true;
    fLeft.receiveShadow = true;
    this.monitorGroup.add(fLeft);

    // Right Front Bezel
    const fRightGeo = new THREE.BoxGeometry(78, 768, 50);
    const fRight = new THREE.Mesh(fRightGeo, this.chassisMat);
    fRight.position.set(551, 500, 12);
    fRight.castShadow = true;
    fRight.receiveShadow = true;
    this.monitorGroup.add(fRight);

    // Bottom Chin Bezel (Houses Badge, Dials, LED)
    const fBottomGeo = new THREE.BoxGeometry(1180, 116, 50);
    const fBottom = new THREE.Mesh(fBottomGeo, this.chassisMat);
    fBottom.position.set(0, 58, 12);
    fBottom.castShadow = true;
    fBottom.receiveShadow = true;
    this.monitorGroup.add(fBottom);

    // Recessed Rubber CRT Tube Gasket (Inner frame around screen)
    const gasketTop = new THREE.Mesh(new THREE.BoxGeometry(1030, 8, 16), this.darkBezelMat);
    gasketTop.position.set(0, 886, 6);
    this.monitorGroup.add(gasketTop);

    const gasketBottom = new THREE.Mesh(new THREE.BoxGeometry(1030, 8, 16), this.darkBezelMat);
    gasketBottom.position.set(0, 114, 6);
    this.monitorGroup.add(gasketBottom);

    const gasketLeft = new THREE.Mesh(new THREE.BoxGeometry(8, 768, 16), this.darkBezelMat);
    gasketLeft.position.set(-514, 500, 6);
    this.monitorGroup.add(gasketLeft);

    const gasketRight = new THREE.Mesh(new THREE.BoxGeometry(8, 768, 16), this.darkBezelMat);
    gasketRight.position.set(514, 500, 6);
    this.monitorGroup.add(gasketRight);

    // -------------------------------------------------------------------------
    // 3. Top Ventilation Louvers / Cooling Grille
    // -------------------------------------------------------------------------
    const ventGroup = new THREE.Group();
    const ventSlotGeo = new THREE.BoxGeometry(38, 5, 8);
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.8 });
    // 13 slots, one draw call (identical placement, no per-slot meshes)
    const instancedVents = new THREE.InstancedMesh(ventSlotGeo, ventMat, 13);
    {
      const dummy = new THREE.Object3D();
      for (let i = -6; i <= 6; i++) {
        dummy.position.set(i * 50, 962, -20);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        instancedVents.setMatrixAt(i + 6, dummy.matrix);
      }
    }
    instancedVents.instanceMatrix.needsUpdate = true;
    ventGroup.add(instancedVents);
    this.monitorGroup.add(ventGroup);

    // -------------------------------------------------------------------------
    // 4. Bottom Chin Details: Nameplate Badge, Dials, LED
    // -------------------------------------------------------------------------
    // Nameplate Badge Push-Button: "RIDDHIMAN KUNDAL PORTFOLIO"
    // Recessed socket housing so the button reads as a real 3D push-button
    const socketGeo = new THREE.BoxGeometry(336, 60, 8);
    const socketMesh = new THREE.Mesh(socketGeo, this.darkBezelMat);
    socketMesh.position.set(-330, 58, 34);
    socketMesh.receiveShadow = true;
    this.monitorGroup.add(socketMesh);

    const badgeTexture = createBadgeTexture();
    const badgeGeo = new THREE.BoxGeometry(320, 46, 16);
    const badgeMat = new THREE.MeshStandardMaterial({
      map: badgeTexture,
      roughness: 0.35,
      metalness: 0.15
    });
    // Dark plastic sides so only the front face shows the label texture
    const badgeSideMat = new THREE.MeshStandardMaterial({
      color: 0x0d0f14,
      roughness: 0.5,
      metalness: 0.2
    });
    const badgeMesh = new THREE.Mesh(badgeGeo, [
      badgeSideMat, // +X
      badgeSideMat, // -X
      badgeSideMat, // +Y
      badgeSideMat, // -Y
      badgeMat,     // +Z front face
      badgeSideMat  // -Z
    ]);
    // Rest position pops out of the chin; pressed position sits near-flush
    this.badgeRestZ = 46;
    this.badgePressedZ = 38;
    this.badgeTargetZ = this.badgeRestZ;
    badgeMesh.position.set(-330, 58, this.badgeRestZ);
    badgeMesh.castShadow = true;
    badgeMesh.userData.isPortfolioBadge = true;
    badgeMesh.userData.portfolioUrl = 'portfolio.html';
    this.monitorGroup.add(badgeMesh);
    this.badgeMesh = badgeMesh;
    this.badgeMat = badgeMat;

    // Click target is the badge mesh itself (same size as the button)
    this.badgeHitbox = null;

    // Decorative Center Mini-Vents (one shared geo, one draw call)
    const miniVentGeo = new THREE.BoxGeometry(4, 22, 4);
    const instancedMiniVents = new THREE.InstancedMesh(miniVentGeo, ventMat, 5);
    {
      const dummy = new THREE.Object3D();
      for (let i = -2; i <= 2; i++) {
        dummy.position.set(i * 9, 58, 36);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        instancedMiniVents.setMatrixAt(i + 2, dummy.matrix);
      }
    }
    instancedMiniVents.instanceMatrix.needsUpdate = true;
    this.monitorGroup.add(instancedMiniVents);

    // Rotary Knobs: Brightness & Contrast
    const knobGeo = new THREE.CylinderGeometry(13, 13, 12, 24);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0xb5ab9a,
      roughness: 0.45,
      metalness: 0.1
    });

    // Brightness Knob
    const brightKnob = new THREE.Mesh(knobGeo, knobMat);
    brightKnob.rotation.x = Math.PI / 2;
    brightKnob.position.set(240, 58, 40);
    this.monitorGroup.add(brightKnob);

    // Contrast Knob
    const contrastKnob = new THREE.Mesh(knobGeo, knobMat);
    contrastKnob.rotation.x = Math.PI / 2;
    contrastKnob.position.set(310, 58, 40);
    this.monitorGroup.add(contrastKnob);

    // Degauss Push Button
    const degaussGeo = new THREE.CylinderGeometry(9, 9, 8, 20);
    const degaussMat = new THREE.MeshStandardMaterial({ color: 0x9c9282, roughness: 0.5 });
    const degaussBtn = new THREE.Mesh(degaussGeo, degaussMat);
    degaussBtn.rotation.x = Math.PI / 2;
    degaussBtn.position.set(380, 58, 38);
    this.monitorGroup.add(degaussBtn);

    // Power Rocker Switch
    const switchBase = new THREE.Mesh(new THREE.BoxGeometry(26, 20, 10), this.darkBezelMat);
    switchBase.position.set(445, 58, 38);
    this.monitorGroup.add(switchBase);

    // Glowing Power LED (Phosphor Emerald Green)
    const ledGeo = new THREE.SphereGeometry(5.5, 16, 16);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x66ff99,
      emissive: 0x38ef7d,
      emissiveIntensity: 1.6,
      roughness: 0.2
    });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(505, 58, 39);
    this.monitorGroup.add(ledMesh);

    // LED Glow Light (soft real-time bounce onto bezel)
    const ledLight = new THREE.PointLight(0x38ef7d, 1.2, 140);
    ledLight.position.set(505, 58, 48);
    this.monitorGroup.add(ledLight);

    // Fullscreen Push-Button: badge-style 3D control on the chin, in the open
    // bay between the portfolio badge (right edge -162) and the mini-vents.
    // Recessed socket housing + 8-unit travel mirror the RIDDHIMAN PORTFOLIO
    // button so the inward press reads clearly. Icon face swaps between
    // expand/compress glyphs with fullscreen state.
    const fsSocketGeo = new THREE.BoxGeometry(54, 54, 8);
    const fsSocketMesh = new THREE.Mesh(fsSocketGeo, this.darkBezelMat);
    fsSocketMesh.position.set(-110, 58, 34);
    fsSocketMesh.receiveShadow = true;
    this.monitorGroup.add(fsSocketMesh);

    this.fsExpandTex = createFullscreenIconTexture(FS_EXPAND_PATH);
    this.fsCompressTex = createFullscreenIconTexture(FS_COMPRESS_PATH);
    const fsFaceGeo = new THREE.BoxGeometry(40, 40, 16);
    this.fsIconMat = new THREE.MeshStandardMaterial({
      map: this.fsExpandTex,
      roughness: 0.4,
      metalness: 0.1
    });
    const fsButtonMesh = new THREE.Mesh(fsFaceGeo, [
      this.darkBezelMat, // +X
      this.darkBezelMat, // -X
      this.darkBezelMat, // +Y
      this.darkBezelMat, // -Y
      this.fsIconMat,    // +Z front face
      this.darkBezelMat  // -Z
    ]);
    // Rest position pops out of the socket; pressed position sits near-flush
    // (same 8-unit travel as the portfolio badge)
    this.fsRestZ = 46;
    this.fsPressedZ = 38;
    this.fsTargetZ = this.fsRestZ;
    fsButtonMesh.position.set(-110, 58, this.fsRestZ);
    fsButtonMesh.castShadow = true;
    fsButtonMesh.userData.isFullscreenButton = true;
    this.monitorGroup.add(fsButtonMesh);
    this.fsButtonMesh = fsButtonMesh;

    // -------------------------------------------------------------------------
    // 5. Pedestal Swivel Stand (Rests firmly on Tabletop at y = -95)
    // -------------------------------------------------------------------------
    const pedestalGroup = new THREE.Group();

    // Swivel Neck
    const neckGeo = new THREE.BoxGeometry(220, 100, 180);
    const neckMat = new THREE.MeshStandardMaterial({
      color: 0xb5ab9a,
      roughness: 0.55,
      metalness: 0.05
    });
    const neckMesh = new THREE.Mesh(neckGeo, neckMat);
    neckMesh.position.set(0, -12, -220);
    neckMesh.castShadow = true;
    neckMesh.receiveShadow = true;
    pedestalGroup.add(neckMesh);

    // Broad Beveled Pedestal Foot (bottom touches table at y = -95)
    const footGeo = new THREE.BoxGeometry(540, 32, 420);
    const footMat = new THREE.MeshStandardMaterial({
      color: 0xc8bfae,
      roughness: 0.52,
      metalness: 0.05
    });
    const footMesh = new THREE.Mesh(footGeo, footMat);
    footMesh.position.set(0, -79, -200);
    footMesh.castShadow = true;
    footMesh.receiveShadow = true;
    pedestalGroup.add(footMesh);

    this.monitorGroup.add(pedestalGroup);

    this.scene.add(this.monitorGroup);
  }

  /**
   * Freezes every static local matrix (nothing in the scene moves except the
   * badge button). Skips per-frame matrix recomposition at zero visual cost.
   */
  freezeStaticMatrices() {
    for (const group of [this.tableGroup, this.monitorGroup]) {
      if (!group) continue;
      group.traverse((obj) => {
        // Both push-buttons animate, so their matrices stay live
        if (obj === this.badgeMesh || obj === this.fsButtonMesh) return;
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
      });
    }
    this.scene.updateMatrixWorld(true);
    this._sceneDirty = true;
  }

  /**
   * Embeds the 1024x768 website iframe inside the 3D Monitor Screen via CSS3DObject
   */
  createCSS3DScreen() {
    // 1. Create Screen Container DOM Element
    const screenEl = document.createElement('div');
    screenEl.className = 'screen-3d-viewport';

    // 2. Iframe loading portfolio.html (embedded mode)
    const iframe = document.createElement('iframe');
    iframe.id = 'portfolio-frame';
    iframe.src = 'portfolio.html?embedded=true';
    iframe.title = 'Riddhiman Kundal Portfolio';
    iframe.allow = 'autoplay';
    iframe.loading = 'eager';
    screenEl.appendChild(iframe);

    // 3. Subtle Vintage CRT Filter Overlays (pointer-events: none)
    const overlay = document.createElement('div');
    overlay.className = 'crt-glass-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="crt-reflection"></div>
      <div class="crt-scanlines"></div>
      <div class="crt-aperture-mask"></div>
      <div class="crt-vignette"></div>
      <div class="crt-phosphor-glow"></div>
    `;
    screenEl.appendChild(overlay);

    // 4. Wrap in CSS3DObject
    this.screenObject = new CSS3DObject(screenEl);
    // 1:1 scale for exact 1024x768 3D bezel dimensions
    this.screenObject.scale.set(1, 1, 1);
    // Align screen with monitor tilt and position in 3D space
    const screenLocalPos = new THREE.Vector3(0, 500, 14);
    screenLocalPos.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.monitorGroup.rotation.x);
    this.screenObject.position.copy(screenLocalPos);
    this.screenObject.rotation.x = this.monitorGroup.rotation.x;

    this.cssScene.add(this.screenObject);
  }

  updatePointerFromEvent(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  getBadgeTargets() {
    // Built once: badgeMesh/hitbox are assigned once during construction
    if (!this._badgeTargets) {
      this._badgeTargets = [];
      if (this.badgeMesh) this._badgeTargets.push(this.badgeMesh);
      if (this.badgeHitbox) this._badgeTargets.push(this.badgeHitbox);
    }
    return this._badgeTargets;
  }

  isBadgeHovered() {
    const targets = this.getBadgeTargets();
    if (!targets.length || !this.camera) return false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(targets, false);
    return intersects.length > 0;
  }

  setBadgeHovered(hovered) {
    if (this.badgeHovered === hovered) return;
    this.badgeHovered = hovered;
    document.body.style.cursor = hovered ? 'pointer' : '';
    // Subtle hover glow feedback on the badge
    if (this.badgeMat && this.badgeMat.emissive) {
      this.badgeMat.emissive.setHex(hovered ? 0x2a2416 : 0x000000);
      this.badgeMat.emissiveIntensity = hovered ? 0.6 : 0;
      // Emissive change needs one fresh WebGL frame to become visible
      this._sceneDirty = true;
    }
  }

  openPortfolioSite() {
    const url = this.badgeMesh?.userData?.portfolioUrl || 'portfolio.html';
    // Anchor click opens exactly once in a new tab (window.open with
    // 'noopener' returns null even on success, which caused a double-open
    // when combined with a location.href fallback).
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  pressBadgeAndOpen() {
    if (this.badgePressing || !this.badgeMesh) {
      if (!this.badgeMesh) this.openPortfolioSite();
      return;
    }
    this.badgePressing = true;
    // Press inwards
    this.badgeTargetZ = this.badgePressedZ;
    setTimeout(() => {
      // Release back out
      this.badgeTargetZ = this.badgeRestZ;
    }, 130);
    setTimeout(() => {
      this.badgePressing = false;
      this.openPortfolioSite();
    }, 260);
  }

  getFsTargets() {
    // Built once: the fullscreen button mesh is assigned once during construction
    if (!this._fsTargets) {
      this._fsTargets = [];
      if (this.fsButtonMesh) this._fsTargets.push(this.fsButtonMesh);
    }
    return this._fsTargets;
  }

  isFsHovered() {
    if (!this._fsSupported || !this.camera || !this.fsButtonMesh) return false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.getFsTargets(), false);
    return intersects.length > 0;
  }

  setFsHovered(hovered) {
    if (this.fsHovered === hovered) return;
    this.fsHovered = hovered;
    if (!this.badgeHovered) document.body.style.cursor = hovered ? 'pointer' : '';
    // Subtle hover glow feedback on the button face
    if (this.fsIconMat && this.fsIconMat.emissive) {
      this.fsIconMat.emissive.setHex(hovered ? 0x2a2416 : 0x000000);
      this.fsIconMat.emissiveIntensity = hovered ? 0.6 : 0;
      // Emissive change needs one fresh WebGL frame to become visible
      this._sceneDirty = true;
    }
  }

  toggleFullscreen() {
    const docEl = document.documentElement;
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs) {
      this.tryOrientationUnlock();
      const exit = document.exitFullscreen
        ? document.exitFullscreen()
        : (document.webkitExitFullscreen ? document.webkitExitFullscreen() : null);
      if (exit && typeof exit.catch === 'function') exit.catch(() => {});
    } else {
      if (!this._fsSupported) return;
      const request = docEl.requestFullscreen
        ? docEl.requestFullscreen()
        : docEl.webkitRequestFullscreen();
      if (request && typeof request.then === 'function') {
        // Screen Orientation API requires fullscreen first: lock once entered.
        request.then(() => this.tryLandscapeLock()).catch(() => {});
      } else {
        // Older WebKit without a promise: best-effort immediate lock attempt.
        this.tryLandscapeLock();
      }
    }
  }

  isMobileDevice() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch { /* ignore */ }
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  tryLandscapeLock() {
    try {
      if (!this.isMobileDevice()) return;
      const orientation = screen?.orientation;
      if (!orientation || typeof orientation.lock !== 'function') return;
      const locked = orientation.lock('landscape');
      if (locked && typeof locked.catch === 'function') locked.catch(() => {});
    } catch { /* Orientation lock unsupported — stay in current orientation */ }
  }

  tryOrientationUnlock() {
    try {
      const orientation = screen?.orientation;
      if (!orientation || typeof orientation.unlock !== 'function') return;
      orientation.unlock();
    } catch { /* ignore */ }
  }

  pressFsAndToggle() {
    if (this.fsPressing || !this.fsButtonMesh) {
      if (!this.fsButtonMesh) this.toggleFullscreen();
      return;
    }
    this.fsPressing = true;
    // Press inwards
    this.fsTargetZ = this.fsPressedZ;
    setTimeout(() => {
      // Release back out
      this.fsTargetZ = this.fsRestZ;
    }, 130);
    setTimeout(() => {
      this.fsPressing = false;
      this.toggleFullscreen();
    }, 260);
  }

  initEvents() {
    const queueResize = () => {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      requestAnimationFrame(() => {
        this._resizeQueued = false;
        this.onResize();
      });
    };
    window.addEventListener('resize', queueResize, { passive: true });
    window.addEventListener('orientationchange', queueResize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      this._isVisible = !document.hidden;
      if (this._isVisible) this._sceneDirty = true;
      if (this._isVisible && this._animateBound && !this._rafRunning) this._animateBound();
    });

    if (this.dismissBtn) {
      this.dismissBtn.addEventListener('click', () => {
        this.alertDismissed = true;
        if (this.portraitAlert) {
          this.portraitAlert.classList.add('hidden');
        }
      });
    }

    // Hover feedback: pointer cursor over the PORTFOLIO badge or the
    // fullscreen button (raycasts coalesced to one check per frame via rAF)
    const queueHoverCheck = () => {
      if (this._hoverCheckQueued) return;
      this._hoverCheckQueued = true;
      requestAnimationFrame(() => {
        this._hoverCheckQueued = false;
        this.setBadgeHovered(this.isBadgeHovered());
        this.setFsHovered(this.isFsHovered());
      });
    };
    window.addEventListener('pointermove', (e) => {
      // Ignore DOM UI so the badge doesn't steal pointer state from real controls
      const t = e.target;
      if (t instanceof Element && typeof t.closest === 'function') {
        if (t.closest('#portfolio-frame, .screen-3d-viewport, button, a, input, textarea, .portrait-alert-banner')) {
          if (this.badgeHovered) this.setBadgeHovered(false);
          if (this.fsHovered) this.setFsHovered(false);
          return;
        }
      }
      this.updatePointerFromEvent(e);
      queueHoverCheck();
    }, { passive: true });

    // Press-in feel the moment a button is pushed down
    window.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (t instanceof Element && typeof t.closest === 'function') {
        if (t.closest('#portfolio-frame, .screen-3d-viewport, button, a, input, textarea, .portrait-alert-banner')) {
          return;
        }
      }
      this.updatePointerFromEvent(e);
      if (this.isFsHovered() && !this.fsPressing) {
        this.fsTargetZ = this.fsPressedZ;
      } else if (this.isBadgeHovered() && !this.badgePressing) {
        this.badgeTargetZ = this.badgePressedZ;
      }
    });

    // If pressed but not clicked (e.g. drag off), let the buttons come back out
    window.addEventListener('pointerup', () => {
      if (!this.badgePressing && this.badgeMesh) {
        this.badgeTargetZ = this.badgeRestZ;
      }
      if (!this.fsPressing && this.fsButtonMesh) {
        this.fsTargetZ = this.fsRestZ;
      }
    });

    // Click a button → press it inwards, release, then run its action
    window.addEventListener('click', (e) => {
      const t = e.target;
      if (t instanceof Element && typeof t.closest === 'function') {
        if (t.closest('#portfolio-frame, .screen-3d-viewport, button, a, input, textarea, .portrait-alert-banner')) {
          return;
        }
      }
      this.updatePointerFromEvent(e);
      if (this.isFsHovered()) {
        this.pressFsAndToggle();
      } else if (this.isBadgeHovered()) {
        this.pressBadgeAndOpen();
      }
    });
  }

  /**
   * Fullscreen state sync for the 3D button (Fullscreen API with Safari fallback).
   * The button face swaps between expand/compress glyphs. Entering/exiting
   * fires a viewport resize, which the existing resize handler already uses
   * to refit both renderers. Without API support the 3D button stays hidden.
   */
  initFullscreen() {
    const docEl = document.documentElement;
    this._fsSupported = !!(
      (docEl.requestFullscreen || docEl.webkitRequestFullscreen) &&
      (document.exitFullscreen || document.webkitExitFullscreen)
    );
    if (!this._fsSupported && this.fsButtonMesh) {
      this.fsButtonMesh.visible = false;
      return;
    }

    const syncFsIcon = () => {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      // Esc-key / system-gesture exits bypass toggleFullscreen(): release the lock here.
      if (!active) this.tryOrientationUnlock();
      if (this.fsIconMat) {
        const tex = active ? this.fsCompressTex : this.fsExpandTex;
        if (this.fsIconMat.map !== tex) {
          this.fsIconMat.map = tex;
          this.fsIconMat.needsUpdate = true;
          this._sceneDirty = true;
        }
      }
    };

    // Covers Esc-key exits and any external fullscreen changes
    document.addEventListener('fullscreenchange', syncFsIcon);
    document.addEventListener('webkitfullscreenchange', syncFsIcon);
    syncFsIcon();
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    this.camera.aspect = aspect;

    // Target framing aspect for 3D monitor + desk: ~1.25 (1500 / 1200)
    const targetAspect = 1500 / 1200;
    const baseFov = 32.5;

    if (aspect < targetAspect) {
      // Narrow screens (mobile portrait / square): widen vertical FOV so full monitor & table remain in view
      const fovRad = 2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) * (targetAspect / aspect));
      this.camera.fov = (fovRad * 180) / Math.PI;
      this.camera.position.set(-115, 390, 1680);
    } else {
      // Wide screens (desktop & laptop landscape): adaptive camera distance for smaller laptop screens
      // On compact laptop screens (height <= 850px), smoothly adjust camera closer so the monitor is larger
      // and much more readable, while keeping the wooden desk and bezel buttons in clear, comfortable view.
      const heightProgress = THREE.MathUtils.clamp((height - 580) / 340, 0, 1);
      const camZ = THREE.MathUtils.lerp(1550, 1680, heightProgress);
      const camY = THREE.MathUtils.lerp(410, 390, heightProgress);
      const camX = THREE.MathUtils.lerp(-95, -115, heightProgress);

      this.camera.position.set(camX, camY, camZ);
      this.camera.fov = baseFov;
    }

    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);

    this.renderer.setSize(width, height);
    this.cssRenderer.setSize(width, height);
    // Resized buffers need a fresh frame (shadow map included)
    this._sceneDirty = true;

    // Portrait Orientation Notice
    const isPortrait = height > width;
    if (this.portraitAlert) {
      if (isPortrait && !this.alertDismissed) {
        this.portraitAlert.classList.remove('hidden');
      } else if (!isPortrait) {
        this.alertDismissed = false;
        this.portraitAlert.classList.add('hidden');
      }
    }
  }

  animate() {
    if (!this._animateBound) this._animateBound = () => this.animate();
    if (!this._isVisible) {
      this._rafRunning = false;
      return;
    }
    this._rafRunning = true;
    requestAnimationFrame(this._animateBound);

    // Animate the push-button travel (press in / spring back out)
    // Identical easing/thresholds; also reports whether the scene is settled
    let badgeSettled = true;
    if (this.badgeMesh) {
      const currentZ = this.badgeMesh.position.z;
      const targetZ = this.badgeTargetZ || this.badgeRestZ || currentZ;
      const nextZ = currentZ + (targetZ - currentZ) * 0.35;
      if (Math.abs(targetZ - nextZ) < 0.05) {
        this.badgeMesh.position.z = targetZ;
      } else {
        this.badgeMesh.position.z = nextZ;
        badgeSettled = false;
      }
    }

    let fsSettled = true;
    if (this.fsButtonMesh && this.fsButtonMesh.visible) {
      const currentZ = this.fsButtonMesh.position.z;
      const targetZ = this.fsTargetZ || this.fsRestZ || currentZ;
      const nextZ = currentZ + (targetZ - currentZ) * 0.35;
      if (Math.abs(targetZ - nextZ) < 0.05) {
        this.fsButtonMesh.position.z = targetZ;
      } else {
        this.fsButtonMesh.position.z = nextZ;
        fsSettled = false;
      }
    }

    // Static scene: re-render WebGL (with a shadow refresh) only while a
    // button is travelling, something explicitly dirtied the scene, or during
    // warmup frames that let textures/shaders settle. The CSS3D iframe paints
    // itself independently, so it renders unconditionally.
    if (this._sceneDirty || !badgeSettled || !fsSettled || this._warmupFrames > 0) {
      this._sceneDirty = false;
      if (this._warmupFrames > 0) this._warmupFrames--;
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
    }
    this.cssRenderer.render(this.cssScene, this.camera);
  }
}

// Launch once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new RetroWorkspaceApp());
} else {
  new RetroWorkspaceApp();
}
