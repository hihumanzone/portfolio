import * as THREE from 'three';
import { soundscape } from './audio.js';

/**
 * 3D Project Showcase Module
 * Manages the interactive Three.js 3D Holo-Deck stage, 3D card parallax tilt in Grid view,
 * search & category filtering, multi-screenshot galleries, and the Deep Dive 3D Project Inspector.
 */
export class ProjectShowcase {
  constructor(projects = []) {
    this.projects = projects;
    this.filteredProjects = [...projects];
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.viewMode = '3d'; // '3d' | 'grid'

    // 3D Holo-Deck state
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.cardsGroup = null;
    this.cardMeshes = [];
    this.particleSystem = null;
    this.gridPlatform = null;

    // Carousel physics & interaction
    this.currentIndex = 0;
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartRotation = 0;
    this.dragMoved = false;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.0018;
    this.isHovered = false;
    this.hoveredCardMesh = null;

    // Drag Velocity & Momentum Physics
    this.lastPointerX = 0;
    this.lastPointerTime = 0;
    this.dragVelocityX = 0;
    this.canvasRect = null;

    // Event-driven Raycasting (dirty flag saves CPU cycles)
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);
    this.mouseDirty = false;

    // Shared Three.js Geometry & Material Pool
    this.sharedGeometries = {};
    this.sharedMaterials = {};

    // Texture cache
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.setCrossOrigin('anonymous');
    this.textureCache = new Map();

    // Inspector state
    this.currentInspectorProject = null;
    this.currentScreenshotIndex = 0;
    this.isScanlinesActive = true;

    // Focus Trap & Accessibility
    this.lastFocusedElement = null;
    this.focusTrapHandler = null;

    // Debounce timers & observers
    this.searchDebounceTimer = null;
    this.resizeObserver = null;
    this.cleanupListeners = [];

    // Animation loop
    this.animFrameId = null;
    this.isRunning = false;
    this.clock = new THREE.Clock();

    // DOM references
    this.initDomReferences();

    // Global reference for diagnostics & controls
    window.__projectShowcase = this;
  }

  initSharedResources() {
    const cardWidth = 4.2;
    const cardHeight = 2.45;
    const cardDepth = 0.08;

    // Max bounds of the screen plane; per-image aspect fit scales within these.
    this.screenMaxW = cardWidth - 0.18;
    this.screenMaxH = cardHeight - 0.18;

    this.sharedGeometries.chassis = new THREE.BoxGeometry(cardWidth, cardHeight, cardDepth);
    this.sharedGeometries.edges = new THREE.EdgesGeometry(this.sharedGeometries.chassis);
    this.sharedGeometries.screen = new THREE.PlaneGeometry(this.screenMaxW, this.screenMaxH);
    this.sharedGeometries.led = new THREE.SphereGeometry(0.065, 12, 12);

    this.sharedMaterials.chassis = new THREE.MeshStandardMaterial({
      color: 0x09101c,
      metalness: 0.75,
      roughness: 0.35
    });

    this.sharedMaterials.ledAmber = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
    this.sharedMaterials.ledCyan = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.sharedMaterials.ledGreen = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  }

  initDomReferences() {
    this.tabPane = document.getElementById('tab-projects');
    this.searchInput = document.getElementById('project-search-input');
    this.searchClearBtn = document.getElementById('search-clear-btn');
    this.categoriesContainer = document.getElementById('filter-categories');
    this.statsIndicator = document.getElementById('showcase-stats');
    this.viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
    this.stage3dContainer = document.getElementById('showcase-3d-container');
    this.gridContainer = document.getElementById('showcase-grid-container');
    this.canvas = document.getElementById('projects-3d-canvas');
    this.stagePrevBtn = document.getElementById('stage-prev-btn');
    this.stageNextBtn = document.getElementById('stage-next-btn');
    this.stageAutoplayBtn = document.getElementById('stage-autoplay-btn');
    this.stageCurrentIdx = document.getElementById('stage-current-idx');
    this.stageTotalCount = document.getElementById('stage-total-count');
    this.stageFocusSummary = document.getElementById('stage-focus-summary');
    this.inspectorModal = document.getElementById('project-inspector-modal');
  }

  init() {
    if (!this.tabPane) {
      this.initDomReferences();
    }
    if (!this.tabPane) return;

    this.init3DStage();
    this.renderTacticalGrid();
    this.bindEvents();
    this.updateActiveProjectSummary();

    // Preload textures for all projects
    this.preloadProjectTextures();

    // Start 3D animation loop
    this.start();
  }

  /* -------------------------------------------------------------------------- */
  /*                              TEXTURE PRELOADING                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Rewrite GitHub page URLs to the CORS-enabled raw CDN.
   *
   * THREE.TextureLoader uploads images to WebGL, which requires CORS
   * (`Access-Control-Allow-Origin`). `github.com/.../raw/...` (and `/blob/...`)
   * URLs serve via a redirect without CORS headers, so WebGL rejects them and
   * the 3D cards stay blank. `raw.githubusercontent.com` sends
   * `Access-Control-Allow-Origin: *`, so textures load correctly.
   * Plain <img> tags (grid / inspector) don't need CORS, which is why only the
   * 3D canvas was broken.
   */
  resolveTextureUrl(url) {
    if (!url || typeof url !== 'string') return url;
    try {
      if (url.includes('raw.githubusercontent.com')) return url;
      const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(.+)$/);
      if (match) {
        const [, owner, repo, rest] = match;
        const cleanRest = rest.split('?')[0].split('#')[0];
        return `https://raw.githubusercontent.com/${owner}/${repo}/${cleanRest}`;
      }
      return url;
    } catch {
      return url;
    }
  }

  applyTextureSettings(texture) {
    if (!texture) return texture;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if ('colorSpace' in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    return texture;
  }

  /**
   * Scale a screen plane so the image fits inside the max bounds without
   * stretching (contain fit). The shared plane geometry stays at max size;
   * per-card scale preserves the image's own aspect ratio, leaving dark
   * chassis bars on the sides instead of a squeeze/stretch.
   */
  fitScreenMeshToTexture(screenMesh, texture) {
    if (!screenMesh || !texture?.image?.width || !texture?.image?.height) return;
    const maxW = this.screenMaxW || 4.02;
    const maxH = this.screenMaxH || 2.27;
    const imgAspect = texture.image.width / texture.image.height;
    const maxAspect = maxW / maxH;
    let w;
    let h;
    if (imgAspect > maxAspect) {
      w = maxW;
      h = maxW / imgAspect;
    } else {
      h = maxH;
      w = maxH * imgAspect;
    }
    screenMesh.scale.set(w / maxW, h / maxH, 1);
  }

  loadCardTexture(rawUrl, material) {
    this.textureLoader.load(
      rawUrl,
      texture => {
        this.applyTextureSettings(texture);
        this.textureCache.set(rawUrl, texture);

        // If card mesh already exists, update its material
        const mesh = this.cardMeshes.find(m => m.userData.screenMesh?.material === material);
        if (mesh && mesh.userData.screenMesh) {
          material.map = texture;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
          this.fitScreenMeshToTexture(mesh.userData.screenMesh, texture);
        } else if (material.map !== texture) {
          material.map = texture;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
        }
      },
      undefined,
      () => {
        // Keep the dark placeholder on failure; avoid retry storms.
        // The error is expected only for dead links / rate-limited hosts.
      }
    );
  }

  preloadProjectTextures() {
    // Bounded concurrency (4 in flight): same textures cached, no N-parallel storm
    const urls = [];
    this.projects.forEach(project => {
      if (project.screenshots && project.screenshots.length > 0) {
        const url = this.resolveTextureUrl(project.screenshots[0].url);
        if (url && !this.textureCache.has(url) && !urls.includes(url)) urls.push(url);
      }
    });
    let inFlight = 0;
    let cursor = 0;
    const pump = () => {
      while (inFlight < 4 && cursor < urls.length) {
        const url = urls[cursor++];
        inFlight++;
        this.textureLoader.load(
          url,
          texture => {
            this.applyTextureSettings(texture);
            this.textureCache.set(url, texture);

            // Update every card using this URL (same result as before, batched)
            for (let i = 0; i < this.cardMeshes.length; i++) {
              const m = this.cardMeshes[i];
              const mu = m.userData.project.screenshots?.[0]?.url;
              if (mu && this.resolveTextureUrl(mu) === url && m.userData.screenMesh) {
                m.userData.screenMesh.material.map = texture;
                m.userData.screenMesh.material.color.setHex(0xffffff);
                m.userData.screenMesh.material.needsUpdate = true;
                this.fitScreenMeshToTexture(m.userData.screenMesh, texture);
              }
            }
            inFlight--;
            pump();
          },
          undefined,
          () => {
            // Ignore: rebuild3DCards() keeps a placeholder material.
            inFlight--;
            pump();
          }
        );
      }
    };
    pump();
    // NOTE: original per-project onload body preserved below for reference is
    // superseded by the queued pump above; keep method behavior identical.
    return;
  }

  /* -------------------------------------------------------------------------- */
  /*                         THREE.JS 3D HOLO-DECK STAGE                         */
  /* -------------------------------------------------------------------------- */

  init3DStage() {
    if (!this.canvas) return;

    const width = this.canvas.parentElement?.clientWidth || 860;
    const height = this.canvas.parentElement?.clientHeight || 460;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070b16, 0.045);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    this.camera.position.set(0, 0.4, 9.4);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x22304d, 1.4);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(0, 8, 6);
    this.scene.add(keyLight);

    const cyanLight = new THREE.PointLight(0x38bdf8, 3.2, 22);
    cyanLight.position.set(-6, 2, 4);
    this.scene.add(cyanLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 2.8, 22);
    amberLight.position.set(6, 2, 4);
    this.scene.add(amberLight);

    // Initialize shared geometry and material pool
    this.initSharedResources();

    // 5. Holographic Floor Grid Platform
    this.createHoloPlatform();

    // 6. Ambient Floating Dust / Ember Particles
    this.createAmbientParticles();

    // 7. Cards Container Group
    this.cardsGroup = new THREE.Group();
    this.scene.add(this.cardsGroup);

    // Build the 3D cards
    this.rebuild3DCards();
  }

  createHoloPlatform() {
    const platformGroup = new THREE.Group();
    platformGroup.position.set(0, -1.8, 0);
    platformGroup.rotation.x = -Math.PI / 2;

    // 1. Center disc grid base (layer 0, depthWrite: false)
    const discGeo = new THREE.CircleGeometry(5.2, 48);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x070c18,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.position.z = 0;
    platformGroup.add(discMesh);

    // 2. Outer cyan cyber ring (elevated to z = 0.02, depthWrite: false)
    const ringGeo = new THREE.RingGeometry(5.15, 5.3, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = 0.02;
    platformGroup.add(ringMesh);

    // 3. Inner glowing amber ring (elevated to z = 0.04 to eliminate any Z-fighting, depthWrite: false)
    const innerRingGeo = new THREE.RingGeometry(3.55, 3.68, 64);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRingMesh.position.z = 0.04;
    platformGroup.add(innerRingMesh);

    this.gridPlatform = platformGroup;
    this.scene.add(platformGroup);
  }

  createAmbientParticles() {
    const count = 75;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6 - 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;

      // Alternating cyan and amber embers
      if (Math.random() > 0.4) {
        colors[i * 3] = 0.22;
        colors[i * 3 + 1] = 0.74;
        colors[i * 3 + 2] = 0.97;
      } else {
        colors[i * 3] = 0.96;
        colors[i * 3 + 1] = 0.62;
        colors[i * 3 + 2] = 0.04;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.scene.add(this.particleSystem);
  }

  rebuild3DCards() {
    if (!this.cardsGroup) return;

    // Clear existing card meshes safely without disposing shared geometries/materials
    while (this.cardsGroup.children.length > 0) {
      const obj = this.cardsGroup.children[0];
      this.cardsGroup.remove(obj);
      if (obj.userData?.screenMesh?.material) {
        obj.userData.screenMesh.material.dispose();
      }
      if (obj.userData?.edgeLines?.material) {
        obj.userData.edgeLines.material.dispose();
      }
    }
    this.cardMeshes = [];

    const total = this.filteredProjects.length;
    if (total === 0) return;

    const radius = Math.max(5.8, total * 0.78);
    const cardWidth = 4.2;
    const cardHeight = 2.45;
    const cardDepth = 0.08;

    this.filteredProjects.forEach((project, idx) => {
      const cardGroup = new THREE.Group();
      cardGroup.userData = {
        project,
        index: idx,
        baseScale: 1.0,
        hoverScale: 1.05
      };

      // 1. Card Chassis (Chamfered look using shared chassis geometry and material)
      const chassisMesh = new THREE.Mesh(this.sharedGeometries.chassis, this.sharedMaterials.chassis);
      cardGroup.add(chassisMesh);

      // 2. Cyber Glowing Edge Wireframe (using shared edge geometry)
      const isStarred = project.badge && project.badge.includes('★');
      const edgeColor = isStarred ? 0xffaa33 : (project.category === 'hardware' ? 0x10b981 : 0x38bdf8);
      const edgeMat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: 0.55
      });
      const edgeLines = new THREE.LineSegments(this.sharedGeometries.edges, edgeMat);
      cardGroup.add(edgeLines);

      // 3. Screen Plane with Screenshot Texture (aspect-preserving contain fit)
      // NOTE: transparent:true is set once here so the per-frame loop only
      // writes opacity (no material program/state churn per frame)
      let screenMat;
      const screenshotUrl = this.resolveTextureUrl(project.screenshots?.[0]?.url);
      if (screenshotUrl && this.textureCache.has(screenshotUrl)) {
        screenMat = new THREE.MeshBasicMaterial({
          map: this.textureCache.get(screenshotUrl),
          toneMapped: false,
          transparent: true
        });
      } else if (screenshotUrl) {
        screenMat = new THREE.MeshBasicMaterial({
          color: 0x111c30,
          transparent: true
        });
        this.loadCardTexture(screenshotUrl, screenMat);
      } else {
        screenMat = new THREE.MeshBasicMaterial({ color: 0x13213a, transparent: true });
      }

      const screenMesh = new THREE.Mesh(this.sharedGeometries.screen, screenMat);
      screenMesh.position.z = cardDepth / 2 + 0.005;
      // Apply aspect-correct fit immediately for cached textures
      if (screenMat.map) {
        this.fitScreenMeshToTexture(screenMesh, screenMat.map);
      }
      cardGroup.add(screenMesh);
      cardGroup.userData.screenMesh = screenMesh;
      cardGroup.userData.edgeLines = edgeLines;

      // 4. Status Indicator Glow Sphere on top right (using shared LED geometry and materials)
      const ledMat = isStarred
        ? this.sharedMaterials.ledAmber
        : (project.category === 'hardware' ? this.sharedMaterials.ledGreen : this.sharedMaterials.ledCyan);
      const ledMesh = new THREE.Mesh(this.sharedGeometries.led, ledMat);
      ledMesh.position.set(cardWidth / 2 - 0.22, cardHeight / 2 - 0.22, cardDepth / 2 + 0.02);
      cardGroup.add(ledMesh);

      // Position along the circular carousel arc
      const angle = (idx / total) * Math.PI * 2;
      cardGroup.userData.baseAngle = angle;
      cardGroup.position.set(
        Math.sin(angle) * radius,
        0,
        Math.cos(angle) * radius - radius
      );
      cardGroup.rotation.y = angle;

      this.cardsGroup.add(cardGroup);
      this.cardMeshes.push(cardGroup);
    });

    this.currentIndex = 0;
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.updateCarouselCardPositions();
    this.updateStageCounter();
  }

  updateCarouselCardPositions() {
    const total = this.filteredProjects.length;
    if (total === 0 || !this.cardsGroup) return;

    const radius = Math.max(5.8, total * 0.78);

    this.cardMeshes.forEach((cardGroup, idx) => {
      const baseAngle = (idx / total) * Math.PI * 2;
      const angle = baseAngle + this.currentRotation;

      // Position in cylinder with camera facing z=0
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius - radius;
      cardGroup.position.set(x, 0, z);
      cardGroup.rotation.y = angle;

      // Distance from front center (angle closest to 0 mod 2PI)
      let normAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (normAngle > Math.PI) normAngle = Math.PI * 2 - normAngle;

      const dist = normAngle / Math.PI; // 0 (front) to 1 (back)

      // Slight depth scale and opacity falloff
      const depthScale = THREE.MathUtils.lerp(1.0, 0.78, dist);
      const isHovered = (this.hoveredCardMesh === cardGroup);
      const finalScale = isHovered ? depthScale * 1.06 : depthScale;

      cardGroup.scale.set(finalScale, finalScale, finalScale);

      // Soft opacity adjustment on screen (transparent flag set once at creation)
      if (cardGroup.userData.screenMesh && cardGroup.userData.screenMesh.material) {
        cardGroup.userData.screenMesh.material.opacity = THREE.MathUtils.lerp(1.0, 0.45, dist);
      }

      // Edge line brightness
      if (cardGroup.userData.edgeLines && cardGroup.userData.edgeLines.material) {
        cardGroup.userData.edgeLines.material.opacity = isHovered
          ? 0.95
          : THREE.MathUtils.lerp(0.65, 0.2, dist);
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                             EVENT BINDINGS                                 */
  /* -------------------------------------------------------------------------- */

  bindEvents() {
    // 1. Search Input (Debounced 150ms to prevent thrashing)
    if (this.searchInput) {
      this.searchInput.addEventListener('input', e => {
        const val = e.target.value.trim().toLowerCase();
        if (this.searchClearBtn) {
          this.searchClearBtn.classList.toggle('hidden', val.length === 0);
        }
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.searchQuery = val;
          this.applyFilterAndSearch();
        }, 150);
      });
    }

    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        if (this.searchInput) {
          this.searchInput.value = '';
          this.searchQuery = '';
          this.searchClearBtn.classList.add('hidden');
          clearTimeout(this.searchDebounceTimer);
          this.applyFilterAndSearch();
        }
      });
    }

    // 2. View Mode Toggle (3D Stage vs Grid)
    this.viewToggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        this.setViewMode(targetView);
      });
    });

    // 3. 3D Stage Navigation Buttons
    if (this.stagePrevBtn) {
      this.stagePrevBtn.addEventListener('click', () => {
        this.navigateCard(-1);
      });
    }

    if (this.stageNextBtn) {
      this.stageNextBtn.addEventListener('click', () => {
        this.navigateCard(1);
      });
    }

    // 4. Auto-Play Toggle
    if (this.stageAutoplayBtn) {
      this.stageAutoplayBtn.addEventListener('click', () => {
        this.autoRotate = !this.autoRotate;
        this.stageAutoplayBtn.classList.toggle('paused', !this.autoRotate);
        const text = this.stageAutoplayBtn.querySelector('.btn-text');
        if (text) text.textContent = this.autoRotate ? 'AUTO' : 'PAUSED';
      });
    }

    // 5. 3D Canvas Pointer Interactions (Drag to rotate, click to inspect, momentum fling)
    if (this.canvas) {
      const updateCanvasRect = () => {
        if (this.canvas) this.canvasRect = this.canvas.getBoundingClientRect();
      };

      const onPointerDown = e => {
        this.isDragging = true;
        updateCanvasRect();
        const touch = e.touches && e.touches[0];
        const clientX = touch ? touch.clientX : (typeof e.clientX === 'number' ? e.clientX : 0);
        this.dragStartX = clientX;
        this.lastPointerX = clientX;
        this.lastPointerTime = performance.now();
        this.dragVelocityX = 0;
        this.dragStartRotation = this.targetRotation;
        this.dragMoved = false;
        if (this.canvas) this.canvas.style.cursor = 'grabbing';
      };

      const onPointerMove = e => {
        const touch = e.touches && e.touches[0];
        const clientX = touch ? touch.clientX : (typeof e.clientX === 'number' ? e.clientX : 0);
        const clientY = touch ? touch.clientY : (typeof e.clientY === 'number' ? e.clientY : 0);
        const now = performance.now();

        if (!this.canvasRect) updateCanvasRect();
        const rect = this.canvasRect;

        if (rect && rect.width > 0 && rect.height > 0) {
          this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
          this.mouseDirty = true;
        }

        if (this.isDragging) {
          const deltaX = clientX - this.dragStartX;
          if (Math.abs(deltaX) > 4) {
            this.dragMoved = true;
          }
          this.targetRotation = this.dragStartRotation + deltaX * 0.005;

          // Track instantaneous smoothed velocity (px / ms)
          const dt = Math.max(now - this.lastPointerTime, 1);
          const dx = clientX - this.lastPointerX;
          this.dragVelocityX = (dx / dt) * 0.65 + this.dragVelocityX * 0.35;
          this.lastPointerX = clientX;
          this.lastPointerTime = now;
        }
      };

      const onPointerUp = () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (this.canvas) this.canvas.style.cursor = 'grab';

          if (!this.dragMoved) {
            this.handleCardClick();
          } else {
            this.snapToNearestCard(this.dragVelocityX);
          }
        }
      };

      this.canvas.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);

      this.canvas.addEventListener('touchstart', onPointerDown, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerUp, { passive: true });

      // Mouse Wheel Navigation
      this.canvas.addEventListener('wheel', e => {
        e.preventDefault();
        if (Math.abs(e.deltaY) > 8 || Math.abs(e.deltaX) > 8) {
          const dir = (e.deltaY > 0 || e.deltaX > 0) ? 1 : -1;
          this.navigateCard(dir);
        }
      }, { passive: false });

      // Canvas Hover tracking
      this.canvas.addEventListener('mouseenter', () => {
        this.isHovered = true;
        updateCanvasRect();
      });
      this.canvas.addEventListener('mouseleave', () => {
        this.isHovered = false;
        this.hoveredCardMesh = null;
        this.mouse.set(-999, -999);
        this.mouseDirty = true;
      });
    }

    // 6. Keyboard Shortcuts inside Projects Tab
    window.addEventListener('keydown', e => {
      const terminalModal = document.getElementById('terminal-modal');
      if (!terminalModal || terminalModal.classList.contains('hidden')) return;

      const activeTab = document.querySelector('.tab-btn.active');
      if (!activeTab || activeTab.dataset.tab !== 'projects') return;

      if (document.activeElement === this.searchInput) return;

      if (this.inspectorModal && !this.inspectorModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          this.closeInspector();
        } else if (e.key === 'ArrowLeft') {
          this.navigateScreenshot(-1);
        } else if (e.key === 'ArrowRight') {
          this.navigateScreenshot(1);
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        this.navigateCard(-1);
      } else if (e.key === 'ArrowRight') {
        this.navigateCard(1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        this.openInspector(this.filteredProjects[this.currentIndex]);
      }
    });

    // 7. Resize Observer for Canvas Auto-Fit
    if (this.canvas && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  handleResize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth || 860;
    const height = parent.clientHeight || 460;

    if (width === 0 || height === 0) return;

    this.canvasRect = this.canvas.getBoundingClientRect();
    this.camera.aspect = width / height;

    if (width < 640) {
      this.camera.fov = 44;
      this.camera.position.z = 10.4;
    } else {
      this.camera.fov = 38;
      this.camera.position.z = 9.4;
    }

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  onResize() {
    this.handleResize();
  }

  /* -------------------------------------------------------------------------- */
  /*                          NAVIGATION & CAROUSEL SNAPPING                    */
  /* -------------------------------------------------------------------------- */

  navigateCard(direction) {
    const total = this.filteredProjects.length;
    if (total === 0) return;

    soundscape.playKeyClick();
    const step = (Math.PI * 2) / total;

    // Advance target rotation by exactly one discrete step forward or backward
    const currentStep = Math.round(-this.targetRotation / step);
    const nextStep = currentStep + direction;
    this.targetRotation = -nextStep * step;

    let nextIdx = (nextStep % total + total) % total;
    this.currentIndex = nextIdx;

    this.updateStageCounter();
    this.updateActiveProjectSummary();
  }

  snapToNearestCard(velocity = 0) {
    const total = this.filteredProjects.length;
    if (total === 0) return;

    const step = (Math.PI * 2) / total;
    let flingSteps = 0;
    if (Math.abs(velocity) > 0.28) {
      flingSteps = Math.round(velocity * 3.2);
      flingSteps = Math.max(-2, Math.min(2, flingSteps));
    }

    const currentStep = Math.round(-this.targetRotation / step);
    const targetStep = currentStep - flingSteps;
    this.targetRotation = -targetStep * step;

    let nearestIdx = (targetStep % total + total) % total;
    this.currentIndex = nearestIdx;

    this.updateStageCounter();
    this.updateActiveProjectSummary();
  }

  handleCardClick() {
    if (!this.raycaster || !this.camera) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cardsGroup.children, true);

    if (intersects.length > 0) {
      let hitCard = intersects[0].object;
      while (hitCard.parent && hitCard.parent !== this.cardsGroup) {
        hitCard = hitCard.parent;
      }

      if (hitCard && hitCard.userData?.project) {
        const clickedIdx = hitCard.userData.index;

        if (clickedIdx === this.currentIndex) {
          // Clicked center card: open deep dive inspector!
          soundscape.playTerminalBeep(1200);
          this.openInspector(hitCard.userData.project);
        } else {
          // Clicked side card: rotate via shortest angular path
          soundscape.playKeyClick();
          const total = this.filteredProjects.length;
          const step = (Math.PI * 2) / total;
          const currentStep = Math.round(-this.targetRotation / step);
          const currentNormIdx = (currentStep % total + total) % total;

          let diff = clickedIdx - currentNormIdx;
          if (diff > total / 2) diff -= total;
          if (diff < -total / 2) diff += total;

          const targetStep = currentStep + diff;
          this.targetRotation = -targetStep * step;
          this.currentIndex = clickedIdx;
          this.updateStageCounter();
          this.updateActiveProjectSummary();
        }
      }
    }
  }

  updateStageCounter() {
    const total = this.filteredProjects.length;
    if (this.stageCurrentIdx) {
      this.stageCurrentIdx.textContent = total > 0 ? String(this.currentIndex + 1).padStart(2, '0') : '00';
    }
    if (this.stageTotalCount) {
      this.stageTotalCount.textContent = String(total).padStart(2, '0');
    }
  }

  updateActiveProjectSummary() {
    if (!this.stageFocusSummary) return;

    const project = this.filteredProjects[this.currentIndex];
    if (!project) {
      this.stageFocusSummary.innerHTML = `
        <div class="empty-focus-banner">
          <span>NO PROTOCOL SELECTED // ADJUST FILTERS</span>
        </div>
      `;
      return;
    }

    const badgeClass = project.badge?.includes('★') ? 'project-stars' : 'project-badge';
    const tagsHtml = (project.tags || [])
      .slice(0, 4)
      .map(t => `<span class="tag">${t}</span>`)
      .join('');

    this.stageFocusSummary.innerHTML = `
      <div class="focus-meta-row">
        <div class="focus-id-group">
          <span class="focus-num">${project.id}</span>
          <span class="${badgeClass}">${project.badge || ''}</span>
        </div>
        <div class="focus-action-btns">
          <button class="stage-inspect-btn" id="stage-inspect-trigger">
            <span class="btn-icon">⛶</span>
            <span>INSPECT 3D</span>
          </button>
          ${project.link?.url ? `
            <a href="${project.link.url}" target="_blank" rel="noopener noreferrer" class="stage-repo-link">
              <span>REPO</span>
              <span class="arrow">↗</span>
            </a>
          ` : ''}
        </div>
      </div>
      <h3 class="focus-title">${project.name}</h3>
      <p class="focus-desc">${project.summary}</p>
      <div class="focus-tags-row">${tagsHtml}</div>
    `;

    const inspectBtn = document.getElementById('stage-inspect-trigger');
    if (inspectBtn) {
      inspectBtn.addEventListener('click', () => {
        soundscape.playTerminalBeep(1200);
        this.openInspector(project);
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          FILTERING & SEARCH PIPELINE                       */
  /* -------------------------------------------------------------------------- */

  applyFilterAndSearch() {
    let result = [...this.projects];

    // Search Query Filter
    if (this.searchQuery) {
      const q = this.searchQuery;
      result = result.filter(p => {
        const inName = p.name?.toLowerCase().includes(q);
        const inSummary = p.summary?.toLowerCase().includes(q);
        const inDesc = p.description?.toLowerCase().includes(q);
        const inTags = Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q));
        const inBadge = p.badge?.toLowerCase().includes(q);
        return inName || inSummary || inDesc || inTags || inBadge;
      });
    }

    this.filteredProjects = result;
    this.rebuild3DCards();
    this.renderTacticalGrid();
    this.updateActiveProjectSummary();
  }

  /* -------------------------------------------------------------------------- */
  /*                         TACTICAL GRID & 3D PARALLAX TILT                  */
  /* -------------------------------------------------------------------------- */

  setViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    soundscape.playKeyClick();

    this.viewToggleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });

    if (mode === '3d') {
      if (this.stage3dContainer) this.stage3dContainer.classList.remove('hidden');
      if (this.gridContainer) this.gridContainer.classList.add('hidden');
      this.handleResize();
      this.start();
    } else {
      if (this.stage3dContainer) this.stage3dContainer.classList.add('hidden');
      if (this.gridContainer) this.gridContainer.classList.remove('hidden');
      this.stop();
    }
  }

  renderTacticalGrid() {
    if (!this.gridContainer) return;
    const grid = this.gridContainer.querySelector('.projects-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (this.filteredProjects.length === 0) {
      grid.innerHTML = `
        <div class="grid-empty-state">
          <div class="empty-icon">⌕</div>
          <h4>NO MATCHING REPOSITORIES</h4>
          <p>No projects match your current query or category filter.</p>
          <button class="reset-filter-btn" id="reset-filter-btn">RESET FILTERS</button>
        </div>
      `;
      const resetBtn = grid.querySelector('#reset-filter-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (this.searchInput) this.searchInput.value = '';
          this.searchQuery = '';
          this.setCategory('all');
        });
      }
      return;
    }

    this.filteredProjects.forEach(proj => {
      const card = document.createElement('article');
      card.className = 'tactical-project-card';
      card.setAttribute('data-id', proj.id);

      const topBadgeHtml = proj.badge
        ? `<div class="${proj.badge.includes('★') ? 'project-stars' : 'project-badge'}">${proj.badge}</div>`
        : '';

      const tagsHtml = Array.isArray(proj.tags)
        ? proj.tags.map(tag => `<span class="tag">${tag}</span>`).join('')
        : '';

      const screenshotUrl = this.resolveTextureUrl(proj.screenshots?.[0]?.url) || '';

      card.innerHTML = `
        <!-- Specular 3D Reflection Glare Overlay -->
        <div class="card-glare" aria-hidden="true"></div>

        <!-- Screenshot Header Banner with CRT Scanlines -->
        <div class="card-screenshot-banner">
          ${screenshotUrl ? `<img src="${screenshotUrl}" alt="${proj.name} Interface Screenshot" loading="lazy" class="card-img" />` : `<div class="card-img-placeholder">NO VISUAL TELEMETRY</div>`}
          <div class="card-scanlines" aria-hidden="true"></div>
          <button class="quick-inspect-trigger" aria-label="Inspect project">⛶ INSPECT</button>
        </div>

        <!-- Card Body -->
        <div class="card-body">
          <div class="project-top">
            <span class="project-num">${proj.id}</span>
            ${topBadgeHtml}
          </div>
          <h3 class="project-name">${proj.name}</h3>
          <p class="project-summary">${proj.summary}</p>
          <div class="project-tags">${tagsHtml}</div>
          <div class="project-links">
            <button class="prj-btn tactical-inspect-btn">
              <span>Inspect 3D</span>
              <span class="arrow">⛶</span>
            </button>
            ${proj.link?.url ? `
              <a href="${proj.link.url}" target="_blank" rel="noopener noreferrer" class="prj-btn primary">
                <span>Repository</span>
                <span class="arrow">↗</span>
              </a>
            ` : ''}
          </div>
        </div>
      `;

      // 3D Parallax Tilt on Mouse Move
      this.attach3DCardTilt(card);

      // Open Inspector on click
      card.querySelectorAll('.quick-inspect-trigger, .tactical-inspect-btn, .card-screenshot-banner').forEach(el => {
        el.addEventListener('click', e => {
          e.stopPropagation();
          soundscape.playTerminalBeep(1200);
          this.openInspector(proj);
        });
      });

      card.addEventListener('click', e => {
        if (!e.target.closest('a, button')) {
          soundscape.playTerminalBeep(1200);
          this.openInspector(proj);
        }
      });

      grid.appendChild(card);
    });
  }

  attach3DCardTilt(card) {
    const glare = card.querySelector('.card-glare');
    let rect = null;
    let rafId = null;

    const handleMouseEnter = () => {
      rect = card.getBoundingClientRect();
    };

    const handleMouseMove = e => {
      if (!rect) rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const normX = (x / rect.width) - 0.5; // -0.5 to 0.5
        const normY = (y / rect.height) - 0.5;

        const rotateX = -normY * 16;
        const rotateY = normX * 16;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px) scale3d(1.02, 1.02, 1.02)`;

        if (glare) {
          glare.style.opacity = '1';
          glare.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(120, 188, 235, 0.22) 0%, transparent 65%)`;
        }
      });
    };

    const handleMouseLeave = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rect = null;
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale3d(1, 1, 1)';
      if (glare) {
        glare.style.opacity = '0';
      }
    };

    card.addEventListener('mouseenter', handleMouseEnter, { passive: true });
    card.addEventListener('mousemove', handleMouseMove, { passive: true });
    card.addEventListener('mouseleave', handleMouseLeave, { passive: true });
  }

  /* -------------------------------------------------------------------------- */
  /*                    DEEP DIVE 3D PROJECT INSPECTOR MODAL                   */
  /* -------------------------------------------------------------------------- */

  openInspector(project) {
    if (!this.inspectorModal || !project) return;
    this.currentInspectorProject = project;

    const screenshots = (project.screenshots || []).map(s => ({ ...s, url: this.resolveTextureUrl(s.url) }));

    const topBadgeClass = project.badge?.includes('★') ? 'project-stars' : 'project-badge';

    const archListHtml = (project.architecture || [])
      .map(item => `<li><span class="arch-bullet">⚡</span><span>${item}</span></li>`)
      .join('');

    const featListHtml = (project.features || [])
      .map(item => `<li><span class="feat-check">✓</span><span>${item}</span></li>`)
      .join('');

    const tagsHtml = (project.tags || [])
      .map(t => `<span class="tag clickable-tag" data-tag="${t}">${t}</span>`)
      .join('');

    const statsHtml = project.stats ? `
      <div class="inspector-stat-cluster">
        ${project.stats.stars ? `<div class="stat-pill"><span class="stat-icon">★</span><span class="stat-val">${project.stats.stars} Stars</span></div>` : ''}
        ${project.stats.forks ? `<div class="stat-pill"><span class="stat-icon">⑂</span><span class="stat-val">${project.stats.forks} Forks</span></div>` : ''}
        ${project.stats.language ? `<div class="stat-pill"><span class="stat-icon">⌥</span><span class="stat-val">${project.stats.language}</span></div>` : ''}
      </div>
    ` : '';

    const badgeHtml = project.badge ? `<span class="${topBadgeClass}">${project.badge}</span>` : '';

    this.inspectorModal.innerHTML = `
      <div class="inspector-chassis">
        <header class="inspector-header">
          <div class="inspector-title-group">
            <span class="inspector-code">${project.id} // DEEP INSPECT</span>
            ${badgeHtml}
          </div>
          <button class="inspector-close-btn" id="inspector-close-btn" aria-label="Close Inspector" title="Close Inspector [Esc]">&times;</button>
        </header>

        <div class="inspector-body">
          <!-- Left Column: Scrollable All-Images Gallery Feed -->
          <div class="inspector-visual-col" id="inspector-visual-col">
            <div class="gallery-feed-header">
              <span class="gallery-feed-label">VISUAL TELEMETRY &amp; INTERFACES (${screenshots.length})</span>
            </div>
            ${screenshots.map((s, idx) => `
              <div class="screenshot-item-card">
                <div class="screenshot-stage-frame" data-gallery-index="${idx}">
                  <div class="screenshot-glare" aria-hidden="true"></div>
                  <img src="${s.url}" alt="${project.name} Screenshot ${idx + 1}" class="inspector-img" loading="lazy" />
                  <div class="inspector-scanlines ${this.isScanlinesActive ? 'active' : ''}" aria-hidden="true"></div>
                  <div class="frame-controls-bar">
                    <button class="frame-btn zoom-btn" data-url="${s.url}" data-caption="${s.caption || ''}" title="Open Full-Resolution Lightbox">
                      ⛶ ZOOM HIGH-RES
                    </button>
                  </div>
                </div>
                <div class="screenshot-caption-tag">
                  <span class="caption-idx">[IMG ${String(idx + 1).padStart(2, '0')}/${String(screenshots.length).padStart(2, '0')}]</span>
                  <span class="caption-text">${s.caption || 'Interface Overview'}</span>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Right Column: Technical Dossier & Architecture -->
          <div class="inspector-info-col">
            <div class="dossier-main">
              <h2 class="dossier-title">${project.name}</h2>
              ${statsHtml}
              <p class="dossier-desc">${project.description || project.summary}</p>

              <!-- Architecture Highlights -->
              <div class="dossier-section">
                <h4 class="section-heading">// ARCHITECTURE &amp; LOW-LEVEL PIPELINE</h4>
                <ul class="dossier-arch-list">${archListHtml}</ul>
              </div>

              <!-- Key Capabilities -->
              <div class="dossier-section">
                <h4 class="section-heading">// CORE CAPABILITIES &amp; BENCHMARKS</h4>
                <ul class="dossier-feat-list">${featListHtml}</ul>
              </div>

              <!-- Tech Matrix Chips -->
              <div class="dossier-section">
                <h4 class="section-heading">// TECH MATRIX TAGS</h4>
                <div class="dossier-tags-row">${tagsHtml}</div>
              </div>

              <!-- Git Clone Box with Vertically Centered Copy Button on the Right -->
              ${project.cloneUrl ? `
                <div class="clone-box">
                  <span class="clone-label">LOCAL CLONE REPOSITORY:</span>
                  <div class="clone-row">
                    <div class="clone-cmd-wrapper">
                      <code class="clone-code">${project.cloneUrl}</code>
                    </div>
                    <button class="clone-copy-btn" id="clone-copy-btn" data-copy="${project.cloneUrl}" title="Copy clone command">
                      COPY CLONE COMMAND 📋
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Bottom Actions Cluster -->
            <div class="dossier-footer">
              ${project.link?.url ? `
                <a href="${project.link.url}" target="_blank" rel="noopener noreferrer" class="inspector-action-btn primary">
                  <span>LAUNCH REPOSITORY</span>
                  <span class="arrow">↗</span>
                </a>
              ` : ''}
              ${project.demoUrl ? `
                <a href="${project.demoUrl}" target="_blank" rel="noopener noreferrer" class="inspector-action-btn secondary">
                  <span>LIVE DEMO</span>
                  <span class="arrow">↗</span>
                </a>
              ` : ''}
              <button class="inspector-action-btn outline" id="inspector-return-btn">
                <span>← BACK TO SHOWCASE</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Lightbox Zoom Modal -->
      <div id="inspector-lightbox" class="inspector-lightbox hidden" role="dialog" aria-modal="true">
        <button class="lightbox-close-btn" id="lightbox-close-btn">&times;</button>
        <div class="lightbox-img-wrapper">
          <img id="lightbox-img" src="${screenshots[0].url}" alt="High-Res Screenshot" />
          <div class="lightbox-caption" id="lightbox-caption">${screenshots[0].caption || ''}</div>
        </div>
      </div>
    `;

    this.inspectorModal.classList.remove('hidden');

    // Save focused element and setup focus trap
    this.lastFocusedElement = document.activeElement;
    this.setupFocusTrap();

    // Bind Inspector UI Controls
    this.bindInspectorControls(project, screenshots);
  }

  setupFocusTrap() {
    if (this.focusTrapHandler) {
      window.removeEventListener('keydown', this.focusTrapHandler);
    }

    const closeBtn = document.getElementById('inspector-close-btn');
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 60);
    }

    this.focusTrapHandler = e => {
      if (!this.inspectorModal || this.inspectorModal.classList.contains('hidden')) return;
      if (e.key !== 'Tab') return;

      const focusableEls = Array.from(
        this.inspectorModal.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null);

      if (focusableEls.length === 0) return;

      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', this.focusTrapHandler);
  }

  bindInspectorControls(project, screenshots) {
    // 1. Close Button & Return
    const closeBtn = document.getElementById('inspector-close-btn');
    const returnBtn = document.getElementById('inspector-return-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeInspector());
    if (returnBtn) returnBtn.addEventListener('click', () => this.closeInspector());

    // 2. Click outside chassis to close (bound once; backdrop persists across opens)
    if (!this._inspectorBackdropBound) {
      this._inspectorBackdropBound = true;
      this.inspectorModal.addEventListener('click', e => {
        if (e.target === this.inspectorModal) {
          this.closeInspector();
        }
      });
    }

    // 3. Interactive 3D Tilt on ALL screenshot frames (cached rect & RAF batched)
    const frames = this.inspectorModal.querySelectorAll('.screenshot-stage-frame');
    frames.forEach(frame => {
      const glare = frame.querySelector('.screenshot-glare');
      let frameRect = null;
      let frameRaf = null;

      frame.addEventListener('mouseenter', () => {
        frameRect = frame.getBoundingClientRect();
      }, { passive: true });

      frame.addEventListener('mousemove', e => {
        if (!frameRect) frameRect = frame.getBoundingClientRect();
        const x = e.clientX - frameRect.left;
        const y = e.clientY - frameRect.top;

        if (frameRaf) cancelAnimationFrame(frameRaf);
        frameRaf = requestAnimationFrame(() => {
          const normX = (x / frameRect.width) - 0.5;
          const normY = (y / frameRect.height) - 0.5;

          frame.style.transform = `perspective(800px) rotateX(${(-normY * 6).toFixed(2)}deg) rotateY(${(normX * 6).toFixed(2)}deg) scale(1.008)`;

          if (glare) {
            glare.style.opacity = '1';
            glare.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(120, 188, 235, 0.22) 0%, transparent 60%)`;
          }
        });
      }, { passive: true });

      frame.addEventListener('mouseleave', () => {
        if (frameRaf) cancelAnimationFrame(frameRaf);
        frameRect = null;
        frame.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
        if (glare) glare.style.opacity = '0';
      }, { passive: true });
    });

    // 4. Lightbox Zoom on clicking any zoom button or clicking any screenshot image
    const lightbox = document.getElementById('inspector-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.getElementById('lightbox-close-btn');

    this.inspectorModal.querySelectorAll('.zoom-btn, .screenshot-stage-frame img').forEach(trigger => {
      trigger.addEventListener('click', e => {
        e.stopPropagation();
        soundscape.playModalSwoosh();
        const card = trigger.closest('.screenshot-item-card');
        const img = card ? card.querySelector('.inspector-img') : trigger;
        const cap = card ? card.querySelector('.caption-text')?.textContent : '';
        if (lightboxImg && img) lightboxImg.src = img.src;
        if (lightboxCaption) lightboxCaption.textContent = cap || '';
        if (lightbox) lightbox.classList.remove('hidden');
      });
    });

    if (lightboxClose && lightbox) {
      lightboxClose.addEventListener('click', () => {
        lightbox.classList.add('hidden');
        soundscape.playModalSwoosh();
      });
    }

    if (lightbox) {
      lightbox.addEventListener('click', e => {
        if (e.target === lightbox) {
          lightbox.classList.add('hidden');
          soundscape.playModalSwoosh();
        }
      });
    }

    // 5. One-click Git clone copy with robust fallback
    const cloneBtn = document.getElementById('clone-copy-btn');
    if (cloneBtn) {
      cloneBtn.addEventListener('click', async () => {
        const text = cloneBtn.getAttribute('data-copy');
        let copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
          }
        } catch {
          copied = false;
        }

        if (!copied) {
          try {
            const tempArea = document.createElement('textarea');
            tempArea.value = text;
            tempArea.style.position = 'fixed';
            tempArea.style.opacity = '0';
            document.body.appendChild(tempArea);
            tempArea.select();
            document.execCommand('copy');
            document.body.removeChild(tempArea);
          } catch {
            // Ignore
          }
        }

        soundscape.playTerminalBeep(1400);
        cloneBtn.textContent = 'COPIED! ✓';
        cloneBtn.classList.add('copied');

        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-message');
        if (toast && toastMsg) {
          toastMsg.textContent = `Copied clone command to clipboard!`;
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 2200);
        }

        setTimeout(() => {
          cloneBtn.textContent = 'COPY CLONE COMMAND 📋';
          cloneBtn.classList.remove('copied');
        }, 2400);
      });
    }

    // 6. Clickable tag filter shortcuts
    this.inspectorModal.querySelectorAll('.clickable-tag').forEach(tagEl => {
      tagEl.addEventListener('click', () => {
        const tagText = tagEl.dataset.tag;
        if (tagText) {
          this.closeInspector();
          if (this.searchInput) {
            this.searchInput.value = tagText;
            this.searchQuery = tagText.toLowerCase();
            if (this.searchClearBtn) this.searchClearBtn.classList.remove('hidden');
            this.applyFilterAndSearch();
          }
        }
      });
    });
  }

  closeInspector() {
    if (!this.inspectorModal) return;
    this.inspectorModal.classList.add('hidden');
    soundscape.playModalSwoosh();

    if (this.focusTrapHandler) {
      window.removeEventListener('keydown', this.focusTrapHandler);
      this.focusTrapHandler = null;
    }

    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      try {
        this.lastFocusedElement.focus();
      } catch {
        // Ignore
      }
      this.lastFocusedElement = null;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                            RENDER ANIMATION LOOP                           */
  /* -------------------------------------------------------------------------- */

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._forceLayoutRefresh = true;
    this.clock.start();
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  animate() {
    if (!this.isRunning) return;

    this.animFrameId = requestAnimationFrame(() => this.animate());

    // getDelta() updates elapsedTime internally; use .elapsedTime directly
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.elapsedTime;

    // 1. Auto-rotation when not dragging and not hovering (frame-rate normalized)
    if (this.autoRotate && !this.isDragging && !this.isHovered) {
      this.targetRotation -= this.autoRotateSpeed * (delta * 60);
    }

    // 2. Exponential smooth damping interpolation (frame-rate normalized)
    const damping = 8.0;
    const alpha = 1 - Math.exp(-damping * delta);
    const rotDelta = this.targetRotation - this.currentRotation;
    this.currentRotation += rotDelta * alpha;

    // 3. Update 3D card layout only while settling or hover changes
    // (skips N×position/rotation/scale + opacity writes once static)
    const isSettling = Math.abs(rotDelta) > 0.00004 || Math.abs(rotDelta * alpha) > 0.00001;
    const hoverChanged = this._lastHoveredForLayout !== this.hoveredCardMesh;
    if (isSettling || hoverChanged || this._forceLayoutRefresh) {
      this._lastHoveredForLayout = this.hoveredCardMesh;
      this._forceLayoutRefresh = false;
      this.updateCarouselCardPositions();
    }

    // Synchronize HUD nav cluster and focus summary dynamically with front-facing card
    const total = this.filteredProjects.length;
    if (total > 0) {
      const step = (Math.PI * 2) / total;
      let activeIndex = Math.round(-this.currentRotation / step) % total;
      if (activeIndex < 0) activeIndex += total;

      if (activeIndex !== this.currentIndex) {
        this.currentIndex = activeIndex;
        this.updateStageCounter();
        this.updateActiveProjectSummary();
      }
    }

    // 4. Animate floating ember particles via orbital group drift (zero CPU-GPU buffer re-uploads)
    if (this.particleSystem) {
      this.particleSystem.rotation.y = elapsedTime * 0.035;
      this.particleSystem.position.y = Math.sin(elapsedTime * 0.45) * 0.18;
    }

    // 5. Slowly rotate holographic floor ring
    if (this.gridPlatform) {
      this.gridPlatform.rotation.z = elapsedTime * 0.08;
    }

    // 6. Raycast for card hover (only when pointer moved)
    if (this.raycaster && this.camera && !this.isDragging && this.mouseDirty) {
      this.mouseDirty = false;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.cardsGroup.children, true);

      if (intersects.length > 0) {
        let hitCard = intersects[0].object;
        while (hitCard.parent && hitCard.parent !== this.cardsGroup) {
          hitCard = hitCard.parent;
        }

        if (hitCard && hitCard.userData?.project) {
          if (this.hoveredCardMesh !== hitCard) {
            this.hoveredCardMesh = hitCard;
            if (this.canvas) this.canvas.style.cursor = 'pointer';
          }
        }
      } else {
        if (this.hoveredCardMesh) {
          this.hoveredCardMesh = null;
          if (this.canvas) this.canvas.style.cursor = 'grab';
        }
      }
    }

    // 7. Render
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          LIFECYCLE & RESOURCE DISPOSAL                     */
  /* -------------------------------------------------------------------------- */

  dispose() {
    this.stop();

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.focusTrapHandler) {
      window.removeEventListener('keydown', this.focusTrapHandler);
      this.focusTrapHandler = null;
    }

    // Remove bound window event listeners
    this.cleanupListeners.forEach(cleanup => cleanup && cleanup());
    this.cleanupListeners = [];

    // Dispose scene meshes
    if (this.cardsGroup) {
      while (this.cardsGroup.children.length > 0) {
        const obj = this.cardsGroup.children[0];
        this.cardsGroup.remove(obj);
        if (obj.userData?.screenMesh?.material) obj.userData.screenMesh.material.dispose();
        if (obj.userData?.edgeLines?.material) obj.userData.edgeLines.material.dispose();
      }
    }

    if (this.scene) {
      while (this.scene.children.length > 0) {
        const obj = this.scene.children[0];
        this.scene.remove(obj);
      }
    }

    // Dispose shared geometries & materials
    Object.values(this.sharedGeometries).forEach(geo => geo?.dispose());
    this.sharedGeometries = {};

    Object.values(this.sharedMaterials).forEach(mat => mat?.dispose());
    this.sharedMaterials = {};

    // Dispose texture cache
    this.textureCache.forEach(tex => tex?.dispose());
    this.textureCache.clear();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }
}

// Export singleton instance
export let projectShowcaseInstance = null;

export function initProjectShowcase(projects) {
  if (!projectShowcaseInstance) {
    projectShowcaseInstance = new ProjectShowcase(projects);
    projectShowcaseInstance.init();
  }
  return projectShowcaseInstance;
}
