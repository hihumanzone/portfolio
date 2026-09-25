import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createMountain } from './world/mountain.js';
import { createCabin } from './world/cabin.js';
import { createCampfire } from './world/campfire.js';
import { createForest } from './world/forest.js';
import { createVegetation } from './world/vegetation.js';
import { createRiver } from './world/river.js';
import { createSky } from './world/sky.js';
import { CameraRig } from './cameraRig.js';
import { soundscape } from './audio.js';
import { InteractionManager } from './interaction.js';
import content from './content.json';
import { renderPortfolioContent } from './contentRenderer.js';
import { projectShowcaseInstance } from './projectShowcase.js';

class App {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.clock = new THREE.Clock();
    this.currentWaypointIndex = 0;
    this._bootTime = Date.now();
    this._animateBound = this.animate.bind(this);
    this._resizeQueued = false;
    this._isVisible = true;

    renderPortfolioContent(content);

    // Cache frequently-queried DOM refs once (avoids per-event querySelectorAll)
    this.dom = {
      dockButtons: Array.from(document.querySelectorAll('.dock-btn')),
      dock: document.querySelector('.bottom-dock'),
      modalBackdrops: Array.from(document.querySelectorAll('.modal-backdrop')),
      tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
      tabPanes: Array.from(document.querySelectorAll('.tab-pane')),
      copyButtons: Array.from(document.querySelectorAll('[data-copy]')),
      closeButtons: Array.from(document.querySelectorAll('[data-close]')),
      inspectorModal: document.getElementById('project-inspector-modal'),
      toast: document.getElementById('toast'),
      toastMsg: document.getElementById('toast-message'),
      cliInput: document.getElementById('cli-input'),
    };

    this.initRenderer();
    this.initScene();
    this.initPostProcessing();
    this.buildWorld();
    this.initInteraction();
    this.soundscape = soundscape;
    this.soundscape.setWaypointMix(0);
    this.initUI();
    this.initCLI();

    this._onResize = () => {
      // Coalesce rapid resize bursts to one layout pass per frame
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      requestAnimationFrame(() => {
        this._resizeQueued = false;
        this.onResize();
      });
    };
    window.addEventListener('resize', this._onResize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      // Pause GPU work when tab hidden; clock delta clamped on resume
      this._isVisible = !document.hidden;
      if (this._isVisible) {
        this.clock.getDelta();
        if (!this._rafRunning) this.animate();
      }
    });
    this.animate();

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.classList.add('hidden');
    }, 600);
  }

  initRenderer() {
    const isMobile = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050a16');
    // Linear fog allows clear near/midground depth while fading distant ridges
    this.scene.fog = new THREE.Fog('#0c1326', 60, 320);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );

    this.cameraRig = new CameraRig(this.camera, this.canvas);

    // 1. Cool Directional Moonlight (Aligned with Crescent Moon position in open saddle sky)
    this.moonlight = new THREE.DirectionalLight(0x9cd0ff, 2.85);
    this.moonlight.position.set(-50, 26, -36);
    this.moonlight.castShadow = true;
    this.moonlight.shadow.mapSize.width = 2048;
    this.moonlight.shadow.mapSize.height = 2048;
    this.moonlight.shadow.camera.near = 5;
    this.moonlight.shadow.camera.far = 240;
    this.moonlight.shadow.camera.left = -24;
    this.moonlight.shadow.camera.right = 24;
    this.moonlight.shadow.camera.top = 24;
    this.moonlight.shadow.camera.bottom = -24;
    this.moonlight.shadow.bias = -0.0001;
    this.moonlight.shadow.normalBias = 0.035;
    this.scene.add(this.moonlight);

    // 2. Soft Valley Fill Light (Reveals low-poly tree facets & valley depth)
    const valleyFill = new THREE.DirectionalLight(0x38547c, 1.65);
    valleyFill.position.set(35, 28, 30);
    this.scene.add(valleyFill);

    // 3. Ambient Celestial Light (Soft night visibility)
    this.ambientLight = new THREE.AmbientLight(0x1f2e50, 1.55);
    this.scene.add(this.ambientLight);

    // 4. Hemisphere Sky/Ground Light
    const hemiLight = new THREE.HemisphereLight(0x354b72, 0x162538, 1.10);
    this.scene.add(hemiLight);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    // Match composer pixel ratio to renderer so bloom cost scales identically
    if (typeof this.composer.setPixelRatio === 'function') {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Selective Bloom (Luminous amber windows, fire embers, lantern)
    // Half-resolution bloom cuts fill-rate and texture bandwidth by 75% while rendering smoother glow
    const bloomW = Math.max(256, Math.floor(window.innerWidth / 2));
    const bloomH = Math.max(256, Math.floor(window.innerHeight / 2));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      0.68,
      0.45,
      0.78
    );
    this.composer.addPass(this.bloomPass);
  }

  buildWorld() {
    this.mountain = createMountain(this.scene);
    this.river = createRiver(this.scene, this.mountain);
    this.cabin = createCabin(this.scene);
    this.campfire = createCampfire(this.scene);
    this.forest = createForest(this.scene);
    this.vegetation = createVegetation(this.scene, this.mountain);
    this.sky = createSky(this.scene, this.camera);
  }

  initInteraction() {
    this.interaction = new InteractionManager(
      this.scene,
      this.camera,
      this.canvas,
      this.cameraRig,
      (modalId) => this.openModal(modalId),
      (wpIdx) => this.switchWaypoint(wpIdx),
      (panRatio) => soundscape?.setSummitPanMix?.(panRatio)
    );

    if (this.cabin && this.cabin.signalTower) {
      this.interaction.registerTarget(this.cabin.signalTower, {
        id: 'signalTower',
        label: content.navigation?.interactiveTargets?.signalTower?.label || 'OPEN SIGNAL TRANSMISSION',
        waypointIndex: 3,
        modalId: 'contact-modal'
      });
    }

    if (this.cabin && this.cabin.group) {
      this.interaction.registerTarget(this.cabin.group, {
        id: 'cabin',
        label: content.navigation?.interactiveTargets?.cabin?.label || 'ENTER CABIN WORKSPACE',
        waypointIndex: 1,
        modalId: 'terminal-modal'
      });
    }

    if (this.campfire && this.campfire.group) {
      this.interaction.registerTarget(this.campfire.group, {
        id: 'campfire',
        label: content.navigation?.interactiveTargets?.campfire?.label || 'INSPECT CAMPFIRE JOURNAL',
        waypointIndex: 2,
        modalId: 'journal-modal',
        onClick: () => {
          if (this.campfire && this.campfire.triggerSparks) {
            this.campfire.triggerSparks();
          }
          if (soundscape && soundscape.playCampfireBurst) {
            soundscape.playCampfireBurst();
          }
        }
      });
    }
  }

  switchWaypoint(index) {
    const dockButtons = this.dom.dockButtons;
    const dock = this.dom.dock;

    this.currentWaypointIndex = index;

    // 1. Update navigation dock buttons & vertical positioning
    dockButtons.forEach((b, idx) => {
      b.classList.toggle('active', idx === index);
    });

    if (dock) {
      dock.classList.remove('dock-pos-0', 'dock-pos-1', 'dock-pos-2', 'dock-pos-3');
      dock.classList.add(`dock-pos-${index}`);
    }

    // 2. Start smooth camera transition
    this.cameraRig.goToWaypoint(index);

    // 3. Dynamically modulate procedural audio landscape to match perspective
    if (soundscape && soundscape.setWaypointMix) {
      soundscape.setWaypointMix(index);
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Close any other open modal first (cached list)
    for (let i = 0; i < this.dom.modalBackdrops.length; i++) {
      this.dom.modalBackdrops[i].classList.add('hidden');
    }

    modal.classList.remove('hidden');
    soundscape.playModalSwoosh();

    if (modalId === 'terminal-modal') {
      const activeTab = document.querySelector('.tab-btn.active');
      if (!activeTab || activeTab.dataset.tab === 'projects') {
        setTimeout(() => {
          projectShowcaseInstance?.handleResize();
          if (projectShowcaseInstance?.viewMode === '3d') {
            projectShowcaseInstance?.start();
          }
        }, 120);
      }
      const cliInput = document.getElementById('cli-input');
      if (cliInput && activeTab && activeTab.dataset.tab === 'cli') {
        setTimeout(() => cliInput.focus(), 150);
      }
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      soundscape.playModalSwoosh();
      if (modalId === 'terminal-modal') {
        projectShowcaseInstance?.stop();
      }
    }
  }

  showToast(message) {
    const toast = this.dom.toast;
    const toastMsg = this.dom.toastMsg;
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;
    toast.classList.remove('hidden');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2400);
  }

  initUI() {
    const dockButtons = this.dom.dockButtons;
    const audioBtn = document.getElementById('audio-toggle');
    const audioStatus = audioBtn ? audioBtn.querySelector('.audio-status') : null;

    // Bottom Dock navigation
    dockButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) {
          if (index === 0 && this.cameraRig) {
            this.cameraRig.resetSummitPan();
            if (soundscape && soundscape.setSummitPanMix) {
              soundscape.setSummitPanMix(0);
            }
          }
          return;
        }
        soundscape.playKeyClick();
        this.switchWaypoint(index);
      });
    });

    // Modal Close Buttons (cached)
    this.dom.closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Click outside modal to close (cached)
    this.dom.modalBackdrops.forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          soundscape.playModalSwoosh();
        }
      });
    });

    // Single unified keydown handler: ESC closes mixer, inspector, then modals
    const mixBtnRef = document.getElementById('audio-mix-btn');
    const mixPanelRef = document.getElementById('audio-mixer-panel');
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (mixPanelRef && !mixPanelRef.classList.contains('hidden')) {
          mixPanelRef.classList.add('hidden');
          if (mixBtnRef) {
            mixBtnRef.setAttribute('aria-expanded', 'false');
            mixBtnRef.classList.remove('playing');
          }
        }
        const inspectorModal = this.dom.inspectorModal;
        if (inspectorModal && !inspectorModal.classList.contains('hidden')) {
          if (window.__projectShowcase) {
            window.__projectShowcase.closeInspector();
          } else {
            inspectorModal.classList.add('hidden');
          }
          return;
        }

        const openModals = this.dom.modalBackdrops.filter(m => !m.classList.contains('hidden'));
        if (openModals.length > 0) {
          openModals.forEach(m => m.classList.add('hidden'));
          soundscape.playModalSwoosh();
        }
      }
    });

    // CRT Tab Switcher (cached)
    const tabButtons = this.dom.tabButtons;
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        soundscape.playKeyClick();

        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.dom.tabPanes.forEach(pane => {
          pane.classList.remove('active');
        });

        const activePane = document.getElementById(`tab-${targetTab}`);
        if (activePane) activePane.classList.add('active');

        if (targetTab === 'projects') {
          setTimeout(() => {
            projectShowcaseInstance?.handleResize();
            if (projectShowcaseInstance?.viewMode === '3d') {
              projectShowcaseInstance?.start();
            }
          }, 60);
        } else {
          projectShowcaseInstance?.stop();
        }

        if (targetTab === 'cli') {
          const cliInput = document.getElementById('cli-input');
          const isMobile = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
          if (cliInput && !isMobile) setTimeout(() => cliInput.focus(), 80);
        }
      });
    });

    // Retro Workstation Switcher for Desktop Visitors
    const retroBtn = document.getElementById('retro-switch-btn');
    if (retroBtn) {
      const isEmbedded = window.self !== window.top;
      const isMobile = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
      if (!isEmbedded && !isMobile) {
        retroBtn.classList.remove('hidden');
      }
    }

    // One-Click Copy Buttons (cached)
    this.dom.copyButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-copy');
        try {
          await navigator.clipboard.writeText(text);
          soundscape.playTerminalBeep(1400);
          this.showToast(`Copied ${text} to clipboard!`);
        } catch {
          this.showToast(`Value: ${text}`);
        }
      });
    });

    // Procedural Audio Controls
    const volumeSlider = document.getElementById('audio-volume-slider');
    const volumeLabel = document.getElementById('audio-volume-label');

    // Restore saved volume preference if available
    try {
      const savedVol = localStorage.getItem('portfolio_ambient_volume');
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          soundscape.setVolume(parsed);
          if (volumeSlider) volumeSlider.value = Math.round(parsed * 100);
          if (volumeLabel) volumeLabel.textContent = `${Math.round(parsed * 100)}%`;
        }
      }
    } catch {
      // Ignore storage restrictions
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) / 100;
        soundscape.setVolume(val);
        if (volumeLabel) volumeLabel.textContent = `${e.target.value}%`;

        // If user drags volume slider while muted, activate audio smoothly
        if (val > 0 && !soundscape.isPlaying) {
          const isPlaying = soundscape.toggle();
          if (isPlaying && audioBtn) {
            audioBtn.classList.add('playing');
            if (audioStatus) audioStatus.textContent = 'AUDIO: PLAYING';
          }
        }
      });
    }

    // Procedural Audio Toggle
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const isPlaying = soundscape.toggle();
        if (isPlaying) {
          audioBtn.classList.add('playing');
          if (audioStatus) audioStatus.textContent = 'AUDIO: PLAYING';
        } else {
          audioBtn.classList.remove('playing');
          if (audioStatus) audioStatus.textContent = 'AUDIO: MUTED';
        }
      });
    }

    // Per-Layer Ambient Audio Mixer (Wind / River / Fire / Crickets)
    const mixBtn = document.getElementById('audio-mix-btn');
    const mixPanel = document.getElementById('audio-mixer-panel');
    const layerConfigs = [
      { key: 'wind', sliderId: 'layer-wind-slider', labelId: 'layer-wind-label' },
      { key: 'river', sliderId: 'layer-river-slider', labelId: 'layer-river-label' },
      { key: 'fire', sliderId: 'layer-fire-slider', labelId: 'layer-fire-label' },
      { key: 'cricket', sliderId: 'layer-cricket-slider', labelId: 'layer-cricket-label' }
    ];

    layerConfigs.forEach(({ key, sliderId, labelId }) => {
      const slider = document.getElementById(sliderId);
      const label = document.getElementById(labelId);

      // Restore saved layer balance preference if available
      try {
        const saved = localStorage.getItem(`portfolio_ambient_level_${key}`);
        if (saved !== null) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            soundscape.setLayerLevel(key, parsed);
            if (slider) slider.value = Math.round(parsed * 100);
            if (label) label.textContent = `${Math.round(parsed * 100)}%`;
          }
        }
      } catch {
        // Ignore storage restrictions
      }

      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10) / 100;
          soundscape.setLayerLevel(key, val);
          if (label) label.textContent = `${e.target.value}%`;
        });
      }
    });

    if (mixBtn && mixPanel) {
      const setMixerOpen = (open) => {
        mixPanel.classList.toggle('hidden', !open);
        mixBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        mixBtn.classList.toggle('playing', open);
      };

      mixBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundscape.playKeyClick();
        setMixerOpen(mixPanel.classList.contains('hidden'));
      });

      document.addEventListener('click', (e) => {
        if (mixPanel.classList.contains('hidden')) return;
        if (!mixPanel.contains(e.target) && !mixBtn.contains(e.target)) {
          setMixerOpen(false);
        }
      });
      // NOTE: Escape-to-close is handled by the single unified window keydown
      // handler above (avoids duplicate listeners firing per keypress).
    }
  }

  initCLI() {
    const input = document.getElementById('cli-input');
    const history = document.getElementById('cli-history');
    if (!input || !history) return;

    const projs = content.workstation?.projects || [];
    const skillsList = content.workstation?.skills || [];
    const channels = content.contact?.channels || [];
    const waypointAliasSets = [
      ['summit', 'peak', 'overlook'],
      ['cabin', 'cabin-desk', 'desk', 'workspace'],
      ['campfire', 'fire'],
      ['tower', 'signal-tower', 'signal', 'comms']
    ];
    const waypointDefs = (content.navigation?.waypoints || []).map((w, i) => ({
      name: (waypointAliasSets[i] && waypointAliasSets[i][0]) || w.name.toLowerCase(),
      aliases: waypointAliasSets[i] || [w.name.toLowerCase()],
      label: w.name || `LANDMARK ${i + 1}`,
      index: i
    }));
    const promptText = content.workstation?.cli?.prompt || 'guest@cabin:~$';

    const COMMANDS = [
      { cmd: 'help', desc: 'Display the command reference (help <cmd> for details)', usage: 'help [command]', example: 'help open' },
      { cmd: 'about', desc: 'Visitor briefing on Riddhiman Kundal', usage: 'about' },
      { cmd: 'projects', desc: 'List flagship repositories; add <name> for deep detail', usage: 'projects [project-name]', example: 'projects opendroid_remote' },
      { cmd: 'open', desc: 'Focus a project on the 3D Holo-Deck showcase', usage: 'open <project-name>', example: 'open Gemini-Discord-Bot', aliases: ['show', 'focus'] },
      { cmd: 'skills', desc: 'Display the technical capabilities matrix', usage: 'skills' },
      { cmd: 'contact', desc: 'List direct transmission channels & email', usage: 'contact' },
      { cmd: 'whoami', desc: 'Display the current session identity', usage: 'whoami' },
      { cmd: 'goto', desc: 'Fly the camera to a landmark', usage: 'goto <summit|cabin|campfire|tower|0-3>', example: 'goto campfire' },
      { cmd: 'summit', desc: 'Return camera to the panoramic mountain summit', usage: 'summit', aliases: ['home'] },
      { cmd: 'sysinfo', desc: 'Dump RiddhimanOS system telemetry', usage: 'sysinfo', aliases: ['neofetch'] },
      { cmd: 'date', desc: 'Print the current cabin system time', usage: 'date' },
      { cmd: 'echo', desc: 'Echo text back to the terminal', usage: 'echo <text>', example: 'echo hello cabin' },
      { cmd: 'ls', desc: 'List remote modules linked to this workstation', usage: 'ls' },
      { cmd: 'banner', desc: 'Re-print the boot banner & session hint', usage: 'banner' },
      { cmd: 'sound', desc: 'Toggle keystroke sounds on/off', usage: 'sound [on|off]', example: 'sound off' },
      { cmd: 'sudo', desc: 'Attempt to elevate privileges', usage: 'sudo <command>', example: 'sudo make me a sandwich' },
      { cmd: 'clear', desc: 'Clear the terminal screen buffer', usage: 'clear', aliases: ['cls'] }
    ];
    const commandNames = COMMANDS.map(c => c.cmd);
    const projectLookup = new Map(projs.map(p => [p.name.toLowerCase(), p]));
    const projectKeys = projs.map(p => p.name.toLowerCase());
    const waypointNames = waypointDefs.map(w => w.name);

    const soundKey = 'riddhiman_cli_sound';
    const historyKey = 'riddhiman_cli_history';

    let typedSoundOn = true;
    try { typedSoundOn = localStorage.getItem(soundKey) !== 'off'; } catch {}

    let commandHistory = [];
    try {
      const stored = JSON.parse(localStorage.getItem(historyKey) || '[]');
      if (Array.isArray(stored)) commandHistory = stored.filter(s => typeof s === 'string').slice(-80);
    } catch {}
    let historyIdx = commandHistory.length;
    let draft = '';

    const persistHistory = () => {
      try { localStorage.setItem(historyKey, JSON.stringify(commandHistory.slice(-80))); } catch {}
    };

    const persistSound = () => {
      try { localStorage.setItem(soundKey, typedSoundOn ? 'on' : 'off'); } catch {}
    };

    const scrollToBottom = () => { history.scrollTop = history.scrollHeight; };

    const encodeEntities = (str) => String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const printInstant = (html, cls = '') => {
      const line = document.createElement('div');
      line.className = `cli-line ${cls}`.trim();
      line.innerHTML = html;
      history.appendChild(line);
      scrollToBottom();
      return line;
    };

    const typewriter = (html, cls = '', opts = {}) => {
      const { speed = 8, onDone } = opts;
      const line = document.createElement('div');
      line.className = `cli-line ${cls}`.trim();
      history.appendChild(line);

      const segRegex = /<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*?)>|([^<]+)/g;
      const tokens = [];
      let seg;
      while ((seg = segRegex.exec(html)) !== null) {
        if (seg[4] !== undefined) {
          const dec = document.createElement('div');
          dec.innerHTML = seg[4];
          tokens.push({ type: 'text', text: dec.textContent });
        } else {
          tokens.push(seg[1]
            ? { type: 'close', tag: seg[2] }
            : { type: 'open', tag: seg[2], attrs: seg[3] || '' });
        }
      }

      const caret = document.createElement('span');
      caret.className = 'cli-caret-block';
      line.appendChild(caret);

      const stack = [];
      let ti = 0;
      let ci = 0;
      let finished = false;

      const tick = () => {
        while (ti < tokens.length) {
          const tok = tokens[ti];
          if (tok.type === 'open') {
            const el = document.createElement(tok.tag);
            const attrRe = /([\w-]+)="([^"]*)"/g;
            let am;
            while ((am = attrRe.exec(tok.attrs))) el.setAttribute(am[1], am[2]);
            (stack.length ? stack[stack.length - 1] : line).appendChild(el);
            stack.push(el);
            ti++;
            continue;
          }
          if (tok.type === 'close') {
            if (stack.length) stack.pop();
            ti++;
            continue;
          }
          if (ci < tok.text.length) {
            const ch = tok.text[ci++];
            (stack.length ? stack[stack.length - 1] : line).append(ch);
            line.appendChild(caret);
            scrollToBottom();
            if (typedSoundOn && ch !== ' ' && typeof soundscape.playKeyClick === 'function') {
              soundscape.playKeyClick();
            }
            return;
          }
          ti++;
          ci = 0;
        }
        if (!finished) {
          finished = true;
          caret.remove();
          if (onDone) onDone();
        }
      };

      const step = () => {
        tick();
        if (!finished) setTimeout(step, speed);
      };
      step();
    };

    const printHeader = (title) => printInstant(`<span class="cmd-header">${encodeEntities(title)}</span>`);
    const printRule = () => printInstant(`<span class="cmd-rule">${'─'.repeat(54)}</span>`);

    const findProject = (query) => {
      const q = query.trim().toLowerCase().replace(/['"_]/g, '');
      if (!q) return null;
      if (projectLookup.has(q)) return projectLookup.get(q);
      const flat = q.replace(/[-_ ]/g, '');
      const f = projs.find(p => p.name.toLowerCase().replace(/[-_ ]/g, '') === flat);
      if (f) return f;
      return projs.find(p => p.name.toLowerCase().includes(q));
    };

    const norm = (s) => s.toLowerCase().replace(/[-_\s]+/g, '');
    const findWaypoint = (query) => {
      const q = query.trim().toLowerCase();
      if (/^\d+$/.test(q)) {
        const wp = waypointDefs[parseInt(q, 10)];
        if (wp) return wp;
      }
      const nq = norm(q);
      return waypointDefs.find(w => w.aliases.some(a => a === q))
        || waypointDefs.find(w => w.aliases.some(a => norm(a) === nq))
        || waypointDefs.find(w => w.aliases.some(a => norm(a).startsWith(nq)))
        || null;
    };

    const showProjectDetails = (p) => {
      printRule();
      printInstant(`<span class="cmd-id">${p.id}</span> <span class="cmd-cyan">${p.name}</span> <span class="dim">${p.categoryLabel || ''}</span>`);
      if (p.badge) printInstant(`  <span class="cmd-amber">${p.badge}</span>`);
      if (p.stats) printInstant(`  <span class="dim">language:</span> <span class="cmd-amber">${encodeEntities(p.stats.language)}</span> <span class="dim">• stars:</span> <span class="cmd-amber">${p.stats.stars}</span> <span class="dim">• forks:</span> <span class="cmd-amber">${p.stats.forks}</span>`);
      printInstant(' ');
      if (p.description) printInstant(`  ${encodeEntities(p.description)}`);
      if (p.tags && p.tags.length) printInstant(`  <span class="dim">stack:</span> ${p.tags.map(t => `<span class="cmd-tag">${encodeEntities(t)}</span>`).join(' ')}`);
      printInstant(' ');
      if (p.features && p.features.length) {
        printInstant(`  <span class="cmd-cyan">▸ KEY FEATURES</span>`);
        p.features.forEach(f => printInstant(`    <span class="dim">•</span> ${encodeEntities(f)}`));
      }
      if (p.architecture && p.architecture.length) {
        printInstant(`  <span class="cmd-cyan">▸ ARCHITECTURE</span>`);
        p.architecture.forEach(a => printInstant(`    <span class="dim">•</span> ${encodeEntities(a)}`));
      }
      if (p.cloneUrl) printInstant(`  <span class="cmd-green">$</span> ${encodeEntities(p.cloneUrl)}`);
      if (p.link && p.link.url) printInstant(`  <span class="dim">repo:</span> <a href="${p.link.url}" target="_blank" rel="noopener noreferrer" class="cmd-link">${p.link.url}</a>`);
      printInstant(`  <span class="dim">tip:</span> type <span class="cmd-highlight">open ${p.name}</span> to mount it on the Holo-Deck.`);
      printRule();
    };

    const resetShowcaseFilter = () => {
      const sc = projectShowcaseInstance;
      if (!sc) return;
      const searchEl = document.getElementById('project-search-input');
      if (searchEl && searchEl.value) {
        searchEl.value = '';
        if (sc.searchClearBtn) sc.searchClearBtn.classList.add('hidden');
      }
      sc.searchQuery = '';
      if (typeof sc.applyFilterAndSearch === 'function') sc.applyFilterAndSearch();
    };

    const focusShowcaseProject = (id) => {
      const sc = projectShowcaseInstance;
      if (!sc) return;
      resetShowcaseFilter();
      const total = sc.filteredProjects.length;
      if (total === 0) return;
      let idx = sc.filteredProjects.findIndex(p => p.id === id || p.name === id);
      if (idx < 0) idx = 0;
      const step = (Math.PI * 2) / total;
      const curStep = Math.round(-sc.targetRotation / step);
      const normCur = ((curStep % total) + total) % total;
      let diff = idx - normCur;
      if (diff > total / 2) diff -= total;
      if (diff < -total / 2) diff += total;
      sc.targetRotation = -(curStep + diff) * step;
      sc.currentIndex = idx;
      sc.updateStageCounter();
      sc.updateActiveProjectSummary();
    };

    const teleport = (index, label) => {
      typewriter(`<span class="success">◉ ${encodeEntities(label)} selected. Flying camera...</span>`, '', {
        onDone: () => {
          setTimeout(() => {
            this.closeModal('terminal-modal');
            this.switchWaypoint(index);
          }, 500);
        }
      });
    };

    let completionList = [];
    let completionIdx = 0;

    const handleTab = () => {
      const trimmed = input.value.trim();
      const parts = trimmed.split(/\s+/);
      const head = parts[0] ? parts[0].toLowerCase() : '';
      const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
      let candidates = [];
      const replaceLast = parts.length > 1;

      if (!trimmed) {
        candidates = commandNames.slice();
      } else if (parts.length === 1) {
        candidates = commandNames.filter(n => n.startsWith(head));
      } else if (head === 'open' || head === 'projects') {
        candidates = projectKeys.filter(n => n.startsWith(last));
      } else if (head === 'goto') {
        candidates = waypointNames.filter(n => n.startsWith(last));
      } else if (head === 'sound') {
        candidates = ['on', 'off'].filter(n => n.startsWith(last));
      } else {
        candidates = commandNames.filter(n => n.startsWith(head) || head.startsWith(n));
      }

      if (candidates.length === 0) return;

      if (completionList.length === candidates.length && completionList.every((v, i) => v === candidates[i])) {
        completionIdx = (completionIdx + 1) % candidates.length;
      } else {
        completionList = candidates;
        completionIdx = 0;
      }

      const chosen = candidates[completionIdx];
      input.value = replaceLast
        ? `${parts.slice(0, -1).join(' ')} ${chosen} `
        : `${chosen} `;
      input.setSelectionRange(input.value.length, input.value.length);
      if (typedSoundOn && typeof soundscape.playKeyClick === 'function') soundscape.playKeyClick();
    };

    const execute = (raw) => {
      const parts = raw.split(/\s+/);
      const head = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');
      const arg0 = parts[1] ? parts[1].toLowerCase() : '';

      switch (head) {
        case 'help': {
          if (arg0) {
            const meta = COMMANDS.find(c => c.cmd === arg0 || (c.aliases && c.aliases.includes(arg0)));
            if (meta) {
              printInstant(`<span class="cmd-cyan">${meta.cmd}</span> — <span class="dim">${meta.desc}</span>`);
              printInstant(`  <span class="cmd-highlight">usage:</span>  <span class="dim">${meta.usage}</span>`);
              if (meta.example) printInstant(`  <span class="cmd-highlight">example:</span> <span class="cmd-amber">${meta.example}</span>`);
              if (meta.aliases) printInstant(`  <span class="dim">aliases:</span> ${meta.aliases.map(a => `<span class="cmd-name">${a}</span>`).join(' ')}`);
            } else {
              printInstant(`Unknown command '${encodeEntities(arg)}'. Type <span class="cmd-highlight">help</span> for the command list.`, 'dim');
            }
            break;
          }
          printHeader('RIDDHIMANOS SHELL // COMMAND REFERENCE');
          COMMANDS.forEach(c => {
            printInstant(`  <span class="cmd-name">${c.cmd}</span> <span class="dim">${c.desc}</span>`);
          });
          printRule();
          printInstant(`  <span class="dim"><span class="cmd-amber">Tab</span> autocomplete • <span class="cmd-amber">↑/↓</span> history • <span class="cmd-amber">Ctrl+L</span> clear • <span class="cmd-amber">Esc</span> cancel line</span>`);
          break;
        }

        case 'about': {
          printHeader('VISITOR BRIEFING // RIDDHIMAN KUNDAL');
          printRule();
          typewriter(`<span class="cmd-cyan">${encodeEntities(content.personal.role)}</span> <span class="dim">@</span> <span class="cmd-link">${encodeEntities(content.personal.tag)}</span>`);
          typewriter(`<span class="dim">${encodeEntities(content.personal.institution)}</span>`);
          typewriter(`<span class="dim">»</span> ${encodeEntities(content.personal.statusMessage)}`);
          break;
        }

        case 'projects': {
          if (arg0) {
            const found = findProject(arg);
            if (found) {
              showProjectDetails(found);
            } else {
              printInstant(`<span class="error">No project matches '${encodeEntities(arg)}'.</span>`);
              printInstant(`  <span class="dim">Try <span class="cmd-highlight">projects</span> to list all repositories.</span>`);
            }
            break;
          }
          printHeader(`FLAGSHIP OPEN-SOURCE REPOSITORIES [${projs.length} LOADED]`);
          projs.forEach((p, i) => {
            const starBadge = p.stats && p.stats.stars ? ` <span class="cmd-amber">★ ${p.stats.stars}</span>` : '';
            const cat = p.categoryLabel ? ` <span class="dim">[${encodeEntities(p.categoryLabel)}]</span>` : '';
            printInstant(`  [0${i + 1}] <span class="cmd-cyan">${encodeEntities(p.name)}</span>${starBadge}${cat}`);
          });
          printInstant(`  <span class="dim">▸ <span class="cmd-highlight">projects &lt;name&gt;</span> for detail • <span class="cmd-highlight">open &lt;name&gt;</span> to launch the Holo-Deck</span>`);
          break;
        }

        case 'open':
        case 'show':
        case 'focus': {
          const found = findProject(arg);
          if (!found) {
            printInstant(`<span class="error">No project matches '${encodeEntities(arg)}'.</span>`);
            printInstant(`  <span class="dim">usage: open &lt;project-name&gt; • e.g. <span class="cmd-amber">open opendroid_remote</span></span>`);
            break;
          }
          focusShowcaseProject(found.id);
          typewriter(`<span class="success">■ ${encodeEntities(found.name)} mounted on the 3D Holo-Deck.</span>`, '', {
            onDone: () => {
              const tab = document.querySelector('.tab-btn[data-tab="projects"]');
              if (tab && !tab.classList.contains('active')) tab.click();
            }
          });
          break;
        }

        case 'skills': {
          printHeader('TECHNICAL CAPABILITIES MATRIX');
          skillsList.forEach(cat => {
            const catName = cat.category.replace(/\s*\/\/\s*/, '').trim();
            printInstant(`  <span class="cmd-cyan">${encodeEntities(catName)}</span>`);
            const items = (cat.items || []).map(it => {
              if (it.type === 'highlight') return `<span class="cmd-highlight">${encodeEntities(it.name)}</span>`;
              if (it.type === 'learning') return `<span class="dim">${encodeEntities(it.name)} [learning]</span>`;
              return `<span class="cmd-amber">${encodeEntities(it.name)}</span>`;
            });
            printInstant(`      ${items.join(' • ')}`);
          });
          break;
        }

        case 'contact': {
          printHeader('SIGNAL TRANSMISSION ARRAY // OPEN CHANNELS');
          channels.forEach(ch => {
            printInstant(`  <span class="cmd-cyan">${encodeEntities(ch.label)}</span>`);
            printInstant(`    <span class="dim">${encodeEntities(ch.value)}</span>`);
            if (ch.url) printInstant(`    <a href="${encodeEntities(ch.url)}" target="_blank" rel="noopener noreferrer" class="cmd-link">${encodeEntities(ch.url)}</a>`);
          });
          printInstant(`  <span class="dim">▸ Visit the <span class="cmd-highlight">04_SIGNAL TOWER</span> waypoint for the interactive console.</span>`);
          break;
        }

        case 'whoami':
          typewriter(encodeEntities(content.workstation?.cli?.whoami || 'guest@riddhiman-cabin (visitor - read-only terminal access)'));
          break;

        case 'goto': {
          const wp = findWaypoint(arg);
          if (!wp) {
            printInstant(`<span class="error">Unknown destination '${encodeEntities(arg)}'.</span>`);
            printInstant(`  <span class="dim">destinations: ${waypointNames.join(', ')}</span>`);
            break;
          }
          teleport(wp.index, wp.label);
          break;
        }

        case 'summit':
        case 'home':
          teleport(0, 'SUMMIT');
          break;

        case 'sysinfo':
        case 'neofetch': {
          const totalStars = projs.reduce((s, p) => s + (p.stats?.stars || 0), 0);
          const totalForks = projs.reduce((s, p) => s + (p.stats?.forks || 0), 0);
          const languages = [...new Set(projs.map(p => (p.stats?.language || 'unknown').split(' / ')[0]))].join(', ');
          const upMs = Math.max(0, Date.now() - this._bootTime);
          const upH = Math.floor(upMs / 3600000);
          const upM = Math.floor((upMs % 3600000) / 60000);
          const hostname = content.personal?.name.replace(/\s+/g, '-').toLowerCase();
          printHeader('RIDDHIMANOS // SYSTEM TELEMETRY');
          printRule();
          printInstant(`  <span class="dim">hostname:</span>   <span class="cmd-cyan">${encodeEntities(hostname)}</span>`);
          printInstant(`  <span class="dim">uptime:</span>     <span class="cmd-amber">${upH}h ${upM}m</span>`);
          printInstant(`  <span class="dim">shell:</span>      <span class="cmd-amber">RiddhimanOS v2.5</span> (x86_64-timber-cabin)`);
          printInstant(`  <span class="dim">core:</span>       <span class="cmd-amber">8× neural co-processor</span> (local-first cluster)`);
          printInstant(`  <span class="dim">memory:</span>     <span class="cmd-amber">1.2 TB</span> TimberCache (zero-instrumentation)`);
          printInstant(`  <span class="dim">repos:</span>      ${projs.length} linked • <span class="cmd-amber">★ ${totalStars}</span> stars • <span class="cmd-amber">⚑ ${totalForks}</span> forks`);
          printInstant(`  <span class="dim">languages:</span>  ${encodeEntities(languages)}`);
          printRule();
          break;
        }

        case 'date':
          typewriter(new Date().toLocaleString('en-GB', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
          }));
          break;

        case 'echo':
          if (!arg) {
            printInstant(`  <span class="dim">usage: echo &lt;text&gt;</span>`);
          } else {
            typewriter(encodeEntities(arg));
          }
          break;

        case 'ls':
          printHeader('REMOTE MODULES // LINKED WORKSTATION');
          [
            ['projects', '01_PROJECTS • 3D Holo-Deck showcase'],
            ['skills', '02_TECH_MATRIX • capability matrix'],
            ['cli', '03_INTERACTIVE_CLI • you are here'],
            ['journal', 'CAMPFIRE LOG • engineering journal'],
            ['comms', 'TRANSMISSION ARRAY • contact console']
          ].forEach(([name, desc]) => {
            printInstant(`  <span class="cmd-cyan">${name}</span><span class="dim"> → ${desc}</span>`);
          });
          break;

        case 'banner':
          typewriter(`<span class="success">${encodeEntities(content.workstation?.cli?.banner || 'RiddhimanOS Terminal v2.5 (x86_64-timber-cabin)')}</span>`, 'banner');
          typewriter(`Type <span class="cmd-highlight">help</span> to view available commands.`, 'dim');
          break;

        case 'sound': {
          if (arg0 === 'on' || arg0 === 'off') {
            typedSoundOn = arg0 === 'on';
            persistSound();
          }
          printInstant(`Keystroke sounds: <span class="${typedSoundOn ? 'success' : 'error'}">${typedSoundOn ? 'ON' : 'OFF'}</span>`);
          if (arg0 && arg0 !== 'on' && arg0 !== 'off') {
            printInstant(`  <span class="dim">usage: sound [on|off]</span>`);
          }
          break;
        }

        case 'sudo':
          if (arg) {
            printInstant('<span class="error">[sudo] Permission denied: guest session has read-only clearance.</span>');
            printInstant(`  <span class="dim">This incident has been logged to the cabin syslog.</span>`);
          } else {
            printInstant(`  <span class="dim">usage: sudo &lt;command&gt;</span>`);
            printInstant(`  <span class="dim">Hint: guests don't get root in this cabin.</span>`);
          }
          break;

        case 'clear':
        case 'cls':
          history.innerHTML = '';
          break;

        default:
          printInstant(`<span class="error">bash: ${encodeEntities(head)}: command not found</span>`);
          printInstant(`  <span class="dim">Type <span class="cmd-highlight">help</span> for the command list or press <span class="cmd-highlight">Tab</span> to autocomplete.</span>`);
          break;
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        if (historyIdx === commandHistory.length) draft = input.value;
        historyIdx = Math.max(0, historyIdx - 1);
        input.value = commandHistory[historyIdx];
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdx >= commandHistory.length) return;
        historyIdx += 1;
        input.value = historyIdx === commandHistory.length ? draft : commandHistory[historyIdx];
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleTab();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        history.innerHTML = '';
        return;
      }

      if (e.key === 'Escape') {
        if (input.value) {
          input.value = '';
          printInstant('<span class="dim">^C</span>');
        }
        return;
      }

      if (e.key !== 'Enter' && e.key.length === 1 && typedSoundOn && typeof soundscape.playKeyClick === 'function') {
        soundscape.playKeyClick();
      }

      if (e.key !== 'Enter') return;

      const cmd = input.value.trim();
      input.value = '';

      if (!cmd) return;

      if (typeof soundscape.playTerminalBeep === 'function') soundscape.playTerminalBeep(980);

      const echoLine = document.createElement('div');
      echoLine.className = 'cli-line cmd-echo';
      echoLine.innerHTML = `<span class="cli-prompt">${promptText}</span> <span class="cmd-amber">${encodeEntities(cmd)}</span>`;
      history.appendChild(echoLine);

      commandHistory.push(cmd);
      if (commandHistory.length > 80) commandHistory.shift();
      historyIdx = commandHistory.length;
      draft = '';
      persistHistory();

      execute(cmd);
      scrollToBottom();
    });

    // Mobile quick command toolbar support
    const quickBar = document.getElementById('cli-quick-bar');
    if (quickBar) {
      quickBar.addEventListener('click', (e) => {
        const chip = e.target.closest('.cli-chip');
        if (!chip) return;
        const cmd = chip.getAttribute('data-cmd');
        if (!cmd) return;

        if (typeof soundscape.playTerminalBeep === 'function') soundscape.playTerminalBeep(980);

        const echoLine = document.createElement('div');
        echoLine.className = 'cli-line cmd-echo';
        echoLine.innerHTML = `<span class="cli-prompt">${promptText}</span> <span class="cmd-amber">${encodeEntities(cmd)}</span>`;
        history.appendChild(echoLine);

        commandHistory.push(cmd);
        if (commandHistory.length > 80) commandHistory.shift();
        historyIdx = commandHistory.length;
        draft = '';
        persistHistory();

        execute(cmd);
        scrollToBottom();
      });
    }

    history.addEventListener('click', () => {
      const isMobile = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      if (!isMobile) input.focus();
    });
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isMobile = w <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    if (this.cameraRig) {
      this.cameraRig.updateFov();
      if (!isMobile) {
        this.cameraRig.resetSummitPan();
        if (soundscape && soundscape.setSummitPanMix) {
          soundscape.setSummitPanMix(0);
        }
      }
    }

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);
    if (typeof this.composer.setPixelRatio === 'function') {
      this.composer.setPixelRatio(pixelRatio);
    }
    this.composer.setSize(w, h);

    if (this.bloomPass) {
      const bloomW = Math.max(256, Math.floor(w / (isMobile ? 3 : 2)));
      const bloomH = Math.max(256, Math.floor(h / (isMobile ? 3 : 2)));
      this.bloomPass.resolution.set(bloomW, bloomH);
    }

    if (projectShowcaseInstance) {
      if (typeof projectShowcaseInstance.handleResize === 'function') {
        projectShowcaseInstance.handleResize();
      } else if (typeof projectShowcaseInstance.onResize === 'function') {
        projectShowcaseInstance.onResize();
      }
    }
  }

  animate() {
    if (!this._isVisible) {
      this._rafRunning = false;
      return;
    }
    this._rafRunning = true;
    requestAnimationFrame(this._animateBound);

    // getDelta() updates elapsedTime internally; reading .elapsedTime avoids a
    // second internal getDelta call that would return ~0 (old getElapsedTime bug)
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsedTime = this.clock.elapsedTime;

    if (this.cabin && this.cabin.update) this.cabin.update(elapsedTime);
    if (this.campfire && this.campfire.update) this.campfire.update(elapsedTime);
    if (this.forest && this.forest.update) this.forest.update(elapsedTime);
    if (this.vegetation && this.vegetation.update) this.vegetation.update(elapsedTime);
    if (this.river && this.river.update) this.river.update(elapsedTime, delta);
    if (this.sky && this.sky.update) this.sky.update(elapsedTime);
    if (this.cameraRig && this.cameraRig.update) this.cameraRig.update(delta);
    if (this.interaction && this.interaction.update) this.interaction.update();

    this.composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__portfolioApp = new App();
});
