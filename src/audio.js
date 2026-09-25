// Procedural Web Audio Ambient Soundscape Engine
// Remastered with broadcast loudness standards, DynamicsCompressor mastering,
// rich multi-layer procedural sound generators, and interactive volume scaling.

class AmbientSoundscape {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.volume = 0.8; // Default to 80% loudness
    this.currentWaypoint = 0;

    // Master bus nodes
    this.limiter = null;
    this.masterGain = null;
    this.ambientBus = null;
    this.sfxBus = null;

    // Per-layer user balance levels (0.0 to 1.0), multiplied onto waypoint mix
    this.windLevel = 1.0;
    this.riverLevel = 1.0;
    this.fireLevel = 1.0;
    this.cricketLevel = 1.0;

    // Ambient layer gain nodes
    this.windGain = null;
    this.riverGain = null;
    this.fireGain = null;
    this.cricketGain = null;

    // Continuous sound sources & modulators
    this.windSources = [];
    this.riverSources = [];
    this.fireRoarSource = null;
    this.fireSizzleSource = null;
    this.fireRoarGain = null;
    this.fireSizzleGain = null;

    // Active timers and recurring intervals
    this.intervals = [];
    this.crackleTimer = null;
    this.cricketTimer = null;
    this.isFireRunning = false;
    this.isCricketsRunning = false;
    this.crackleBuffers = { loud: [], soft: [] };

    // Key-click rate limiter (typewriter fires every ~8ms; cap the patter)
    this._lastKeyClickAt = 0;
    // Pooled short-noise buffers (avoids per-SFX createBuffer + Math.random loops)
    this._tickBuffer = null;
    this._swooshBuffer = null;
    this._burstBuffers = [];
    // Shared stereo panner for cricket choruses (avoids per-burst node leak)
    this._cricketPanner = null;
  }

  /**
   * Initializes or ensures the Web Audio Context and all core processing buses.
   * Completely idempotent and safe to call from any UI interaction or toggle.
   */
  ensureContext() {
    if (this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.ctx) {
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // 1. Output Dynamics Compressor (Mastering Limiter)
    // Guarantees maximum perceived loudness, warm glue, and zero harsh digital clipping
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-14, this.ctx.currentTime);
    this.limiter.knee.setValueAtTime(10, this.ctx.currentTime);
    this.limiter.ratio.setValueAtTime(4.0, this.ctx.currentTime);
    this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.limiter.release.setValueAtTime(0.22, this.ctx.currentTime);
    this.limiter.connect(this.ctx.destination);

    // 2. Master Gain Node (handles mute/unmute and volume slider scaling)
    // NOTE: assigned directly via `.value` (not setValueAtTime) so the
    // silence-at-birth level can't be wiped by a cancelScheduledValues(t)
    // in the same render quantum (e.g. toggle() right after ensureContext),
    // which would otherwise fall back to the default gain of 1.0 and blast
    // at 100% before ramping down to the slider level.
    this.masterGain = this.ctx.createGain();
    const initialGain = this.isPlaying ? this.volume : 0.0;
    this.masterGain.gain.value = initialGain;
    this.masterGain.connect(this.limiter);

    // 3. Ambient Sub-mix Bus
    this.ambientBus = this.ctx.createGain();
    this.ambientBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.ambientBus.connect(this.masterGain);

    // 4. Sound Effects Bus (Routed to limiter for high clarity without clipping)
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.setValueAtTime(1.15, this.ctx.currentTime);
    this.sfxBus.connect(this.limiter);

    // Build the ambient generator nodes
    this.createWind();
    this.createRiver();
    this.createFire();
    this.createCrickets();

    this.setWaypointMix(this.currentWaypoint);
  }

  init() {
    this.ensureContext();
  }

  /**
   * Generates a stereo mountain wind soundscape with deep resonant gusts
   * and high-altitude whistling breezes.
   */
  createWind() {
    if (this.windGain || !this.ctx) return;

    const sampleRate = this.ctx.sampleRate;
    const bufferSize = 4 * sampleRate;
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, sampleRate);
    const leftChannel = noiseBuffer.getChannelData(0);
    const rightChannel = noiseBuffer.getChannelData(1);

    // Pink / Brown noise filter states
    let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
    let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;

    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      b0L = 0.99886 * b0L + whiteL * 0.0555179;
      b1L = 0.99332 * b1L + whiteL * 0.0750759;
      b2L = 0.96900 * b2L + whiteL * 0.1538520;
      b3L = 0.86650 * b3L + whiteL * 0.3104856;
      b4L = 0.55000 * b4L + whiteL * 0.5329522;
      b5L = -0.7616 * b5L - whiteL * 0.0168980;
      leftChannel[i] = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + whiteL * 0.5362) * 0.27;
      b6L = whiteL * 0.115926;

      const whiteR = Math.random() * 2 - 1;
      b0R = 0.99886 * b0R + whiteR * 0.0555179;
      b1R = 0.99332 * b1R + whiteR * 0.0750759;
      b2R = 0.96900 * b2R + whiteR * 0.1538520;
      b3R = 0.86650 * b3R + whiteR * 0.3104856;
      b4R = 0.55000 * b4R + whiteR * 0.5329522;
      b5R = -0.7616 * b5R - whiteR * 0.0168980;
      rightChannel[i] = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + whiteR * 0.5362) * 0.27;
      b6R = whiteR * 0.115926;
    }

    // Soft sub-bass gust filter (mountain breeze body, rounded and velvety)
    const lowFilter = this.ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.setValueAtTime(370, this.ctx.currentTime);
    lowFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

    // High whistle breeze filter (subtle airy whisper, low resonance)
    const whistleFilter = this.ctx.createBiquadFilter();
    whistleFilter.type = 'bandpass';
    whistleFilter.frequency.setValueAtTime(950, this.ctx.currentTime);
    whistleFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    const whistleGain = this.ctx.createGain();
    whistleGain.gain.setValueAtTime(0.33, this.ctx.currentTime);

    // Gust modulation: two slow, incommensurate LFOs summed for organic
    // non-repeating swells (avoids the "pumping" of a single sine cycle)
    const lfo1 = this.ctx.createOscillator();
    lfo1.frequency.setValueAtTime(0.055, this.ctx.currentTime);
    const lfo1Gain = this.ctx.createGain();
    lfo1Gain.gain.setValueAtTime(38, this.ctx.currentTime);
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(lowFilter.frequency);
    lfo1.start();

    const lfo1b = this.ctx.createOscillator();
    lfo1b.frequency.setValueAtTime(0.021, this.ctx.currentTime);
    const lfo1bGain = this.ctx.createGain();
    lfo1bGain.gain.setValueAtTime(24, this.ctx.currentTime);
    lfo1b.connect(lfo1bGain);
    lfo1bGain.connect(lowFilter.frequency);
    lfo1b.start();

    // LFO 2: Modulating whistle frequency for gentle airy movement
    const lfo2 = this.ctx.createOscillator();
    lfo2.frequency.setValueAtTime(0.09, this.ctx.currentTime);
    const lfo2Gain = this.ctx.createGain();
    lfo2Gain.gain.setValueAtTime(70, this.ctx.currentTime);
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(whistleFilter.frequency);
    lfo2.start();

    // Wind master layer gain - gentle ambient level sitting softly behind campfire and river
    // Direct `.value` assignment: immune to the cancelScheduledValues(t) in
    // setWaypointMix() running in the same quantum (see masterGain note).
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.26;

    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    windSource.connect(lowFilter);
    windSource.connect(whistleFilter);

    lowFilter.connect(this.windGain);
    whistleFilter.connect(whistleGain);
    whistleGain.connect(this.windGain);

    this.windGain.connect(this.ambientBus);
    windSource.start();
    this.windSources.push(windSource);
  }

  /**
   * Generates a stereo mountain river / rushing alpine stream soundscape.
   */
  createRiver() {
    if (this.riverGain || !this.ctx) return;

    const sampleRate = this.ctx.sampleRate;
    const bufferSize = 4 * sampleRate;
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, sampleRate);
    const leftData = noiseBuffer.getChannelData(0);
    const rightData = noiseBuffer.getChannelData(1);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.20;
      b6 = white * 0.115926;

      leftData[i] = pink * 0.95 + (Math.random() * 2 - 1) * 0.05;
      rightData[i] = pink * 0.90 + (Math.random() * 2 - 1) * 0.08;
    }

    const riverSource = this.ctx.createBufferSource();
    riverSource.buffer = noiseBuffer;
    riverSource.loop = true;

    // Filter 1: Deep low-mid churning water body (420 Hz)
    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.setValueAtTime(420, this.ctx.currentTime);
    bodyFilter.Q.setValueAtTime(1.3, this.ctx.currentTime);

    // Filter 2: High splash shimmer & spray (1900 Hz)
    const splashFilter = this.ctx.createBiquadFilter();
    splashFilter.type = 'bandpass';
    splashFilter.frequency.setValueAtTime(1900, this.ctx.currentTime);
    splashFilter.Q.setValueAtTime(1.9, this.ctx.currentTime);

    // Flow LFO (gentle water surge rhythm)
    const flowLfo = this.ctx.createOscillator();
    flowLfo.frequency.setValueAtTime(0.19, this.ctx.currentTime);
    const flowLfoGain = this.ctx.createGain();
    flowLfoGain.gain.setValueAtTime(90, this.ctx.currentTime);
    flowLfo.connect(flowLfoGain);
    flowLfoGain.connect(bodyFilter.frequency);
    flowLfo.start();

    this.riverGain = this.ctx.createGain();
    this.riverGain.gain.value = 0.46;

    riverSource.connect(bodyFilter);
    riverSource.connect(splashFilter);

    bodyFilter.connect(this.riverGain);
    splashFilter.connect(this.riverGain);

    this.riverGain.connect(this.ambientBus);
    riverSource.start();
    this.riverSources.push(riverSource);
  }

  /**
   * Generates a warm 3-layer campfire sound:
   * 1. Continuous low flame rumble/flutter
   * 2. Continuous ember simmer/sizzle
   * 3. Randomized resonant wood snap pops
   */
  createFire() {
    if (!this.ctx) return;

    if (!this.fireGain) {
      this.fireGain = this.ctx.createGain();
      this.fireGain.gain.value = 0.65;
      this.fireGain.connect(this.ambientBus);
    }

    // Continuous flame body roar
    if (!this.fireRoarSource) {
      const bufferSize = 2 * this.ctx.sampleRate;
      const roarBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const roarData = roarBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        roarData[i] = last * 3.5;
      }

      this.fireRoarSource = this.ctx.createBufferSource();
      this.fireRoarSource.buffer = roarBuffer;
      this.fireRoarSource.loop = true;

      const roarFilter = this.ctx.createBiquadFilter();
      roarFilter.type = 'lowpass';
      roarFilter.frequency.setValueAtTime(220, this.ctx.currentTime);
      roarFilter.Q.setValueAtTime(1.6, this.ctx.currentTime);

      this.fireRoarGain = this.ctx.createGain();
      this.fireRoarGain.gain.setValueAtTime(0.38, this.ctx.currentTime);

      // Modulate roar with flutter
      const flutter = this.ctx.createOscillator();
      flutter.frequency.setValueAtTime(4.2, this.ctx.currentTime);
      const flutterGain = this.ctx.createGain();
      flutterGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      flutter.connect(flutterGain);
      flutterGain.connect(this.fireRoarGain.gain);
      flutter.start();

      this.fireRoarSource.connect(roarFilter);
      roarFilter.connect(this.fireRoarGain);
      this.fireRoarGain.connect(this.fireGain);
      this.fireRoarSource.start();
    }

    // Continuous ember sizzle
    if (!this.fireSizzleSource) {
      const sizzleBufSize = 2 * this.ctx.sampleRate;
      const sizzleBuf = this.ctx.createBuffer(1, sizzleBufSize, this.ctx.sampleRate);
      const sData = sizzleBuf.getChannelData(0);
      for (let i = 0; i < sizzleBufSize; i++) {
        sData[i] = (Math.random() * 2 - 1) * 0.16;
      }

      this.fireSizzleSource = this.ctx.createBufferSource();
      this.fireSizzleSource.buffer = sizzleBuf;
      this.fireSizzleSource.loop = true;

      const sizzleFilter = this.ctx.createBiquadFilter();
      sizzleFilter.type = 'bandpass';
      sizzleFilter.frequency.setValueAtTime(3600, this.ctx.currentTime);
      sizzleFilter.Q.setValueAtTime(1.4, this.ctx.currentTime);

      this.fireSizzleGain = this.ctx.createGain();
      this.fireSizzleGain.gain.setValueAtTime(0.24, this.ctx.currentTime);

      this.fireSizzleSource.connect(sizzleFilter);
      sizzleFilter.connect(this.fireSizzleGain);
      this.fireSizzleGain.connect(this.fireGain);
      this.fireSizzleSource.start();
    }

    // Wood pops & crackle loop
    if (!this.isFireRunning) {
      this.isFireRunning = true;
      this.scheduleNextCrackle();
    }
  }

  initCrackleBuffers() {
    if (!this.ctx || (this.crackleBuffers.loud.length > 0 && this.crackleBuffers.soft.length > 0)) return;

    const sampleRate = this.ctx.sampleRate;

    // Pre-bake 4 loud pop buffers
    for (let p = 0; p < 4; p++) {
      const dur = 0.05 + p * 0.015;
      const bufferSize = Math.max(128, Math.floor(sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      const decayRate = 0.28;
      for (let i = 0; i < bufferSize; i++) {
        const env = Math.exp(-i / (bufferSize * decayRate));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      this.crackleBuffers.loud.push(buffer);
    }

    // Pre-bake 4 soft crackle buffers
    for (let p = 0; p < 4; p++) {
      const dur = 0.02 + p * 0.008;
      const bufferSize = Math.max(128, Math.floor(sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      const decayRate = 0.18;
      for (let i = 0; i < bufferSize; i++) {
        const env = Math.exp(-i / (bufferSize * decayRate));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      this.crackleBuffers.soft.push(buffer);
    }
  }

  scheduleNextCrackle() {
    if (!this.isPlaying || !this.ctx || !this.fireGain) {
      this.isFireRunning = false;
      return;
    }

    this.initCrackleBuffers();

    const t = this.ctx.currentTime;
    const isLoudPop = Math.random() < 0.25;
    const pool = isLoudPop ? this.crackleBuffers.loud : this.crackleBuffers.soft;
    const buffer = pool[Math.floor(Math.random() * pool.length)];

    const crackleSource = this.ctx.createBufferSource();
    crackleSource.buffer = buffer;
    crackleSource.playbackRate.setValueAtTime(0.85 + Math.random() * 0.3, t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = isLoudPop ? 'bandpass' : 'highpass';
    filter.frequency.setValueAtTime(
      isLoudPop ? 900 + Math.random() * 1800 : 2200 + Math.random() * 2600,
      t
    );
    filter.Q.setValueAtTime(isLoudPop ? 4.5 : 2.0, t);

    const crackleGain = this.ctx.createGain();
    const peakGain = isLoudPop ? 0.45 + Math.random() * 0.35 : 0.22 + Math.random() * 0.25;
    crackleGain.gain.setValueAtTime(peakGain, t);

    crackleSource.connect(filter);
    filter.connect(crackleGain);
    crackleGain.connect(this.fireGain);

    const dur = buffer.duration;
    crackleSource.onended = () => {
      try {
        crackleSource.disconnect();
        filter.disconnect();
        crackleGain.disconnect();
      } catch {}
    };
    crackleSource.start(t);
    crackleSource.stop(t + dur + 0.01);

    const nextDelay = isLoudPop ? 110 + Math.random() * 240 : 45 + Math.random() * 180;
    this.crackleTimer = setTimeout(() => this.scheduleNextCrackle(), nextDelay);
  }

  /**
   * Generates a realistic night cricket chorus with micro-pulse stridulation
   * and dual harmonic overtones.
   */
  createCrickets() {
    if (!this.ctx) return;

    if (!this.cricketGain) {
      this.cricketGain = this.ctx.createGain();
      this.cricketGain.gain.value = 0.42;
      this.cricketGain.connect(this.ambientBus);
    }

    if (!this.isCricketsRunning) {
      this.isCricketsRunning = true;
      this.scheduleNextCricketBurst();
    }
  }

  scheduleNextCricketBurst() {
    if (!this.isPlaying || !this.ctx || !this.cricketGain) {
      this.isCricketsRunning = false;
      return;
    }

    const pulseCount = 3 + Math.floor(Math.random() * 3); // 3 to 5 chirps per sequence
    const baseFreq = 4400 + (Math.random() * 400 - 200);
    const panX = (Math.random() * 2 - 1) * 0.65; // Stereo spread

    // Reuse one persistent panner; just re-target the pan (no per-burst leak)
    if (this.ctx.createStereoPanner && !this._cricketPanner) {
      this._cricketPanner = this.ctx.createStereoPanner();
      this._cricketPanner.connect(this.cricketGain);
    }
    if (this._cricketPanner) {
      this._cricketPanner.pan.setValueAtTime(panX, this.ctx.currentTime);
    }

    const outputNode = this._cricketPanner || this.cricketGain;

    const pulseDuration = 0.038;
    const pulseGap = 0.024;
    const startTime = this.ctx.currentTime + 0.02;

    for (let p = 0; p < pulseCount; p++) {
      const pStart = startTime + p * (pulseDuration + pulseGap);
      const pEnd = pStart + pulseDuration;

      // Primary tone
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseFreq, pStart);

      // Subtle harmonic overtone for natural timber
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(baseFreq * 2.05, pStart);

      const pGain = this.ctx.createGain();
      pGain.gain.setValueAtTime(0.001, pStart);
      pGain.gain.linearRampToValueAtTime(0.28, pStart + pulseDuration * 0.35);
      pGain.gain.exponentialRampToValueAtTime(0.001, pEnd);

      const hGain = this.ctx.createGain();
      hGain.gain.setValueAtTime(0.08, pStart);

      osc1.connect(pGain);
      osc2.connect(hGain);
      hGain.connect(pGain);
      pGain.connect(outputNode);

      // Auto-disconnect on ended so short-lived oscs never accumulate
      const cleanup = () => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          pGain.disconnect();
          hGain.disconnect();
        } catch {}
      };
      osc1.onended = cleanup;
      osc2.onended = cleanup;

      osc1.start(pStart);
      osc1.stop(pEnd);
      osc2.start(pStart);
      osc2.stop(pEnd);
    }

    const burstDuration = pulseCount * (pulseDuration + pulseGap);
    const nextDelay = Math.floor(burstDuration * 1000 + 400 + Math.random() * 1200);
    this.cricketTimer = setTimeout(() => this.scheduleNextCricketBurst(), nextDelay);
  }

  /**
   * Sets the master volume level (0.0 to 1.0).
   */
  setVolume(val) {
    const clamped = Math.max(0, Math.min(1, parseFloat(val) || 0));
    this.volume = clamped;

    if (this.ctx && this.masterGain && this.isPlaying) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
      this.masterGain.gain.linearRampToValueAtTime(this.volume, t + 0.08);
    }

    try {
      localStorage.setItem('portfolio_ambient_volume', clamped.toString());
    } catch {
      // Ignore storage restrictions
    }
  }

  getVolume() {
    return this.volume;
  }

  /**
   * Smoothly ramps a gain node to a target level, cancelling any in-flight automation.
   */
  rampGain(gainNode, target, rampTime) {
    if (!gainNode || !this.ctx) return;
    const t = this.ctx.currentTime;
    const param = gainNode.gain;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(target, t + rampTime);
  }

  /**
   * Adjusts the acoustic sub-mix to dynamically match the current waypoint camera location.
   * Per-layer gains are the waypoint base level scaled by the user's layer balance level.
   */
  setWaypointMix(waypointIndex, rampTime = 1.2) {
    this.currentWaypoint = waypointIndex;
    if (!this.ctx) return;

    // Base mix per waypoint: WIND, RIVER, FIRE, CRICKETS
    const windBase = [0.46, 0.26, 0.26, 0.56][waypointIndex];
    const riverBase = [0.34, 0.28, 0.28, 0.22][waypointIndex];
    const fireBase = [0.50, 0.65, 0.95, 0.30][waypointIndex];
    const cricketBase = [0.42, 0.52, 0.48, 0.35][waypointIndex];

    this.rampGain(this.windGain, windBase * this.windLevel, rampTime);
    this.rampGain(this.riverGain, riverBase * this.riverLevel, rampTime);
    this.rampGain(this.fireGain, fireBase * this.fireLevel, rampTime);
    this.rampGain(this.cricketGain, cricketBase * this.cricketLevel, rampTime);
  }

  /**
   * Dynamically modulates ambient balance based on panoramic look direction at the Summit waypoint.
   * @param {number} panRatio - Normalized horizontal pan from -1.0 (right, mountains) to +1.0 (left, river/valley)
   */
  setSummitPanMix(panRatio = 0, rampTime = 0.15) {
    if (!this.ctx || this.currentWaypoint !== 0) return;
    const clamped = Math.max(-1, Math.min(1, panRatio));

    // Waypoint 0 base mix: wind=0.46, river=0.34, fire=0.50, cricket=0.42
    // Looking Left (positive clamped -> river):
    // River rises up to +42% (0.34 -> 0.48), wind softens slightly (-15%)
    // Looking Right (negative clamped -> mountain ridge):
    // Wind gusts rise up to +35% (0.46 -> 0.62), river softens (-40%)
    const riverMod = clamped > 0 ? (1 + clamped * 0.42) : (1 + clamped * 0.45);
    const windMod = clamped < 0 ? (1 - clamped * 0.35) : (1 - clamped * 0.15);
    const fireMod = 1 - Math.abs(clamped) * 0.18;

    const windTarget = Math.max(0.05, 0.46 * windMod * this.windLevel);
    const riverTarget = Math.max(0.05, 0.34 * riverMod * this.riverLevel);
    const fireTarget = Math.max(0.05, 0.50 * fireMod * this.fireLevel);

    this.rampGain(this.windGain, windTarget, rampTime);
    this.rampGain(this.riverGain, riverTarget, rampTime);
    this.rampGain(this.fireGain, fireTarget, rampTime);
  }

  /**
   * Sets an individual ambient layer's balance level (0.0 to 1.0).
   * Valid keys: 'wind' | 'river' | 'fire' | 'cricket'
   * Re-applies the current waypoint mix so the change is heard immediately.
   */
  setLayerLevel(key, val) {
    const valid = ['wind', 'river', 'fire', 'cricket'];
    if (!valid.includes(key)) return;
    const clamped = Math.max(0, Math.min(1, parseFloat(val) || 0));
    this[`${key}Level`] = clamped;

    if (this.ctx && typeof this.currentWaypoint === 'number') {
      this.setWaypointMix(this.currentWaypoint, 0.08);
    }

    try {
      localStorage.setItem(`portfolio_ambient_level_${key}`, clamped.toString());
    } catch {
      // Ignore storage restrictions
    }
    return clamped;
  }

  getLayerLevel(key) {
    const current = this[`${key}Level`];
    return typeof current === 'number' ? current : 1.0;
  }

  /**
   * Toggles ambient sound playback on or off.
   */
  toggle() {
    this.ensureContext();

    this.isPlaying = !this.isPlaying;
    const target = this.isPlaying ? this.volume : 0.0;
    const t = this.ctx.currentTime;

    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(target, t + 0.8);

    if (this.isPlaying) {
      if (!this.isFireRunning) {
        this.isFireRunning = true;
        this.scheduleNextCrackle();
      }
      if (!this.isCricketsRunning) {
        this.isCricketsRunning = true;
        this.scheduleNextCricketBurst();
      }
    } else {
      if (this.crackleTimer) {
        clearTimeout(this.crackleTimer);
        this.crackleTimer = null;
      }
      if (this.cricketTimer) {
        clearTimeout(this.cricketTimer);
        this.cricketTimer = null;
      }
      this.intervals.forEach(clearTimeout);
      this.intervals = [];
      this.isFireRunning = false;
      this.isCricketsRunning = false;
    }

    try {
      localStorage.setItem('portfolio_ambient_playing', this.isPlaying ? 'true' : 'false');
    } catch {
      // Ignore storage restrictions
    }

    return this.isPlaying;
  }

  // =========================================================================
  // REMASTERED UI SOUND EFFECTS (Crisp, punchy, and routed via SFX Bus)
  // =========================================================================

  playKeyClick() {
    this.ensureContext();
    if (!this.ctx || !this.sfxBus) return;

    const t = this.ctx.currentTime;

    // Throttle rapid-fire callers (CLI typewriter emits a char every ~8ms).
    // Cap at ~1 soft tick per 35ms so output reads as a gentle patter,
    // not a machine-gun chirp. Overlapping oscs were the main harshness source.
    if (t - this._lastKeyClickAt < 0.035) return;
    this._lastKeyClickAt = t;

    // Humanized velocity + respect for the master volume slider (SFX bus
    // bypasses masterGain, so scale here). Never fully silent unless volume is 0.
    const velocity = 0.65 + Math.random() * 0.35;
    const volScale = 0.15 + 0.85 * (typeof this.volume === 'number' ? this.volume : 0.8);

    // --- Layer 1: soft low "thock" body (sine, ~520-680Hz, no pitch sweep) ---
    // The old triangle 1600Hz -> 280Hz sweep is what sounded piercing/laser-like.
    const bodyFreq = 520 + Math.random() * 160;
    const osc = this.ctx.createOscillator();
    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(1400, t);
    bodyFilter.Q.setValueAtTime(0.7, t);
    const bodyGain = this.ctx.createGain();
    const bodyPeak = 0.07 * velocity * volScale;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(bodyFreq, t);

    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, bodyPeak), t + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(this.sfxBus);

    osc.onended = () => {
      try {
        osc.disconnect();
        bodyFilter.disconnect();
        bodyGain.disconnect();
      } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.06);

    // --- Layer 2: short tactile "tick" (pooled filtered noise, very quiet) ---
    const tickDur = 0.014;
    if (!this._tickBuffer || this._tickBuffer.sampleRate !== this.ctx.sampleRate) {
      const tickSize = Math.max(16, Math.floor(this.ctx.sampleRate * tickDur));
      const buf = this.ctx.createBuffer(1, tickSize, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < tickSize; i++) {
        const env = Math.exp(-i / (tickSize * 0.3));
        d[i] = (Math.random() * 2 - 1) * env;
      }
      this._tickBuffer = buf;
    }

    const tick = this.ctx.createBufferSource();
    tick.buffer = this._tickBuffer;

    const tickFilter = this.ctx.createBiquadFilter();
    tickFilter.type = 'lowpass';
    tickFilter.frequency.setValueAtTime(1800, t);
    tickFilter.Q.setValueAtTime(0.5, t);

    const tickGain = this.ctx.createGain();
    const tickPeak = 0.028 * velocity * volScale;
    tickGain.gain.setValueAtTime(Math.max(0.0002, tickPeak), t);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, t + tickDur);

    tick.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(this.sfxBus);

    tick.onended = () => {
      try {
        tick.disconnect();
        tickFilter.disconnect();
        tickGain.disconnect();
      } catch {}
    };
    tick.start(t);
  }

  playTerminalBeep(freq = 660) {
    this.ensureContext();
    if (!this.ctx || !this.sfxBus) return;

    const t = this.ctx.currentTime;
    const volScale = 0.15 + 0.85 * (typeof this.volume === 'number' ? this.volume : 0.8);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Gentle attack + soft level: avoids the sharp onset transient that
    // made the old 0.22-gain beep feel piercing next to the soft key ticks.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.1 * volScale), t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxBus);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };
    osc.start(t);
    osc.stop(t + 0.09);
  }

  playModalSwoosh() {
    this.ensureContext();
    if (!this.ctx || !this.sfxBus) return;

    const t = this.ctx.currentTime;
    // Pool the 0.16s swoosh envelope buffer (identical bytes every call)
    if (!this._swooshBuffer || this._swooshBuffer.sampleRate !== this.ctx.sampleRate) {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.16);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / bufferSize);
      }
      this._swooshBuffer = buffer;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._swooshBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + 0.14);
    filter.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);

    noise.onended = () => {
      try {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {}
    };
    noise.start(t);
  }

  playCampfireBurst() {
    this.ensureContext();
    if (!this.ctx || !this.sfxBus) return;

    // Pre-build a small pool of decay envelopes once; pick per pop (same sound)
    if (this._burstBuffers.length === 0) {
      for (let b = 0; b < 4; b++) {
        const dur = 0.04 + b * 0.015;
        const size = Math.floor(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < size; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.25));
        }
        this._burstBuffers.push(buf);
      }
    }
    // Cascading crackle pops simulating stirred coals and flying embers
    for (let p = 0; p < 8; p++) {
      const delay = p * (24 + Math.random() * 38);
      const burstIdx = p % this._burstBuffers.length;
      const burstTimer = setTimeout(() => {
        if (!this.ctx || !this.sfxBus) return;
        const t = this.ctx.currentTime;
        const buffer = this._burstBuffers[burstIdx];
        const dur = buffer.duration;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = p % 2 === 0 ? 'bandpass' : 'lowpass';
        filter.frequency.setValueAtTime(
          p % 2 === 0 ? 1800 + Math.random() * 1800 : 450 + Math.random() * 450,
          t
        );
        filter.Q.value = 3.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.48, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxBus);

        noise.onended = () => {
          try {
            noise.disconnect();
            filter.disconnect();
            gain.disconnect();
          } catch {}
        };
        noise.start(t);
      }, delay);
      this.intervals.push(burstTimer);
    }
  }
}

export const soundscape = new AmbientSoundscape();

// Expose soundscape on window for interactive debugging
if (typeof window !== 'undefined') {
  window.soundscape = soundscape;
}
