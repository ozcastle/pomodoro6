// ================================================================
//  alarm.js — 두 사운드 라이브러리 + 알람 트리거
//    Sounds.bgm   → 공부 중 잔잔한 배경 음악 (루프)
//    Sounds.alarm → 타이머 종료 시 알림음
//    Alarm.trigger() → 종료 시 알림음 + 진동
// ================================================================
(function (global) {
  'use strict';

  // ────────────────────────────────────────────────
  // 라이브러리: BGM (공부 중 배경 소리)
  // ────────────────────────────────────────────────
  const BGM_LIBRARY = {
    forest: { key: 'forest', name: '숲',     desc: '새소리 · 바람',  file: './sounds/forest.mp3', volume: 0.5 },
    rain:   { key: 'rain',   name: '비',     desc: '빗소리',         file: './sounds/rain.mp3',   volume: 0.55 },
    lofi:   { key: 'lofi',   name: '로파이', desc: '잔잔한 음악',    file: './sounds/lofi.mp3',   volume: 0.5 },
    white:  { key: 'white',  name: '화이트', desc: '백색 소음',      file: './sounds/white.mp3',  volume: 0.4 },
  };

  // ────────────────────────────────────────────────
  // 라이브러리: 종료 알림음 (빌트인)
  // ────────────────────────────────────────────────
  const BUILTIN_ALARMS = {
    classic:  { key: 'classic',  name: '비프음',        file: './sounds/classic.mp3',  volume: 0.5 },
    fastBeep: { key: 'fastBeep', name: '빠른 비프음',   file: './sounds/fastBeep.mp3', volume: 0.5 },
    digital:  { key: 'digital',  name: '디지털 비프음', file: './sounds/digital.mp3',  volume: 0.4 },
    vintage:  { key: 'vintage',  name: '빈티지 비프음', file: './sounds/vintage.mp3',  volume: 0.5 },
  };

  // ────────────────────────────────────────────────
  // 라이브러리: 종료 알림음 (사용자가 추가한 커스텀 음)
  // 핸드폰의 뮤직/파일 앱에서 가져온 오디오를 data URL 로 저장
  // ────────────────────────────────────────────────
  const CUSTOM_ALARMS_STORAGE = 'pomodoro.customAlarms';
  let customAlarms = (function loadCustomAlarms() {
    try {
      const raw = localStorage.getItem(CUSTOM_ALARMS_STORAGE);
      if (!raw) return {};
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      const map = {};
      arr.forEach(c => {
        if (c && c.key && c.file) {
          map[c.key] = {
            key: c.key,
            name: c.name || '나의 알림음',
            file: c.file,
            volume: c.volume != null ? c.volume : 0.8,
            custom: true,
          };
        }
      });
      return map;
    } catch (e) { return {}; }
  })();

  function saveCustomAlarms() {
    try {
      const arr = Object.keys(customAlarms).map(k => customAlarms[k]);
      localStorage.setItem(CUSTOM_ALARMS_STORAGE, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('[alarm] failed to save custom alarms:', e);
      return false;
    }
  }

  function getAlarmLibrary() {
    return Object.assign({}, BUILTIN_ALARMS, customAlarms);
  }

  const PREVIEW_DURATION_MS = 5000;

  // ────────────────────────────────────────────────
  // 공용 Web Audio
  // ────────────────────────────────────────────────
  let audioCtx = null;
  function getCtx() {
    if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function makeNoiseBuffer(ctx, durSec) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durSec), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function stopSynth(handle) {
    if (!handle) return;
    try {
      if (handle.sources) handle.sources.forEach(s => { try { s.stop(); } catch (e) {} });
      if (handle.node) handle.node.disconnect();
    } catch (e) {}
  }

  // ────────────────────────────────────────────────
  // BGM 합성음 (루프 가능)
  // ────────────────────────────────────────────────

  // 숲 — 새 chirp 무한 반복 (루프 가능한 패턴)
  function synthForest(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    const chirps = [
      { t: 0.0, f: 1800 }, { t: 0.55, f: 2300 }, { t: 1.2, f: 1600 },
      { t: 1.9, f: 2100 }, { t: 2.7, f: 1900 }, { t: 3.5, f: 2400 }, { t: 4.2, f: 1700 },
    ];
    chirps.forEach(({ t, f }) => {
      if (t >= dur) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.35, now + t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(f * 0.85, now + t + 0.22);
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.35, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.28);
      osc.connect(g).connect(master);
      osc.start(now + t); osc.stop(now + t + 0.32);
    });
    return { node: master };
  }

  // 비 — 대역통과 노이즈 + 물방울
  function synthRain(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
    noise.connect(bp).connect(master);
    noise.start(now); noise.stop(now + dur);
    const drops = [0.4, 1.1, 1.9, 2.6, 3.4, 4.2];
    drops.forEach(t => {
      if (t >= dur) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now + t);
      osc.frequency.exponentialRampToValueAtTime(400, now + t + 0.08);
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.15, now + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
      osc.connect(g).connect(master);
      osc.start(now + t); osc.stop(now + t + 0.15);
    });
    return { node: master, sources: [noise] };
  }

  // 로파이 — Am7 sine 패드
  function synthLofi(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.18, now + 0.4);
    master.gain.setValueAtTime(0.18, now + dur - 0.6);
    master.gain.linearRampToValueAtTime(0, now + dur);
    const notes = [220.00, 277.18, 329.63, 415.30];
    const oscs = notes.map((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 4;
      g.gain.value = 0.25;
      osc.connect(g).connect(master);
      osc.start(now); osc.stop(now + dur);
      return osc;
    });
    return { node: master, sources: oscs };
  }

  // 화이트 — 페이드 인/아웃 노이즈
  function synthWhite(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.22, now + 0.15);
    master.gain.setValueAtTime(0.22, now + dur - 0.3);
    master.gain.linearRampToValueAtTime(0, now + dur);
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, dur);
    noise.connect(master);
    noise.start(now); noise.stop(now + dur);
    return { node: master, sources: [noise] };
  }

  // ────────────────────────────────────────────────
  // 종료 알림음 합성음
  // ────────────────────────────────────────────────

  // 빠른 비프 — 1200Hz 짧고 빠른 비프음 반복
  function synthFastBeep(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    const beepDur = 0.07, gap = 0.07, cycle = beepDur + gap;
    const numBeeps = Math.floor(dur / cycle);
    for (let i = 0; i < numBeeps; i++) {
      const t = i * cycle;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.5, now + t + 0.004);
      g.gain.setValueAtTime(0.5, now + t + beepDur - 0.01);
      g.gain.linearRampToValueAtTime(0, now + t + beepDur);
      osc.connect(g).connect(master);
      osc.start(now + t); osc.stop(now + t + beepDur);
    }
    return { node: master };
  }

  // 디지털 — 1000Hz 사각파, 디지털 알람 시계 스타일
  function synthDigital(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    const onDur = 0.18, cycleDur = 0.4;
    const numCycles = Math.floor(dur / cycleDur);
    for (let i = 0; i < numCycles; i++) {
      const t = i * cycleDur;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1000;
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.35, now + t + 0.005);
      g.gain.setValueAtTime(0.35, now + t + onDur - 0.01);
      g.gain.linearRampToValueAtTime(0, now + t + onDur);
      osc.connect(g).connect(master);
      osc.start(now + t); osc.stop(now + t + onDur);
    }
    return { node: master };
  }

  // 빈티지 — 기계식 종 빠르게 연속 (옛날 알람시계)
  function synthVintage(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    const cycle = 0.11, ringDur = 0.09;
    const numRings = Math.floor(dur / cycle);
    for (let i = 0; i < numRings; i++) {
      const t = i * cycle;
      [1, 2.76, 5.4].forEach((ratio, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1200 * ratio;
        const amp = 0.4 / (idx + 1);
        g.gain.setValueAtTime(0, now + t);
        g.gain.linearRampToValueAtTime(amp, now + t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.001, now + t + ringDur);
        osc.connect(g).connect(master);
        osc.start(now + t); osc.stop(now + t + ringDur);
      });
    }
    return { node: master };
  }

  // 클래식 — 880Hz 비프음 5회
  function synthClassic(ctx, dur) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    const beepDur = 0.22, gap = 0.16, count = 5;
    for (let i = 0; i < count; i++) {
      const t = i * (beepDur + gap);
      if (t >= dur) break;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.5, now + t + 0.01);
      g.gain.setValueAtTime(0.5, now + t + beepDur - 0.02);
      g.gain.linearRampToValueAtTime(0, now + t + beepDur);
      osc.connect(g).connect(master);
      osc.start(now + t); osc.stop(now + t + beepDur);
    }
    return { node: master };
  }

  const BGM_SYNTHS = {
    forest: synthForest, rain: synthRain, lofi: synthLofi, white: synthWhite,
  };
  const ALARM_SYNTHS = {
    classic: synthClassic, fastBeep: synthFastBeep,
    digital: synthDigital, vintage: synthVintage,
  };

  function playSynth(synths, key, durationMs) {
    const ctx = getCtx();
    const synth = synths[key];
    if (!ctx || !synth) return Promise.resolve(null);
    const resumePromise = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    return resumePromise.then(() => synth(ctx, durationMs / 1000));
  }

  // ────────────────────────────────────────────────
  // 플레이어 생성기 — 한 라이브러리에 대해 미리듣기/선택/저장을 제공
  // ────────────────────────────────────────────────
  function createPlayer(libraryOrGetter, synths, storageKey, defaultKey, opts) {
    const cfg = Object.assign({ loopPreview: false }, opts || {});
    const getLib = typeof libraryOrGetter === 'function' ? libraryOrGetter : () => libraryOrGetter;
    let currentAudio = null;
    let currentSynth = null;
    let currentKey = null;
    let previewTimer = null;
    const listeners = [];

    function loadSelected() {
      try {
        const k = localStorage.getItem(storageKey);
        if (k && getLib()[k]) return k;
      } catch (e) {}
      return defaultKey;
    }
    function saveSelected(k) { try { localStorage.setItem(storageKey, k); } catch (e) {} }

    let selectedKey = loadSelected();

    function on(event, fn) { listeners.push({ event, fn }); }
    function emit(event, payload) {
      listeners.forEach(l => { if (l.event === event) { try { l.fn(payload); } catch (e) { console.error(e); } } });
    }

    function getSound(k) { return getLib()[k] || null; }

    function stopPreview() {
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
      if (currentAudio) {
        try { currentAudio.pause(); } catch (e) {}
        try { currentAudio.currentTime = 0; } catch (e) {}
        currentAudio = null;
      }
      if (currentSynth) { stopSynth(currentSynth); currentSynth = null; }
      const prev = currentKey;
      currentKey = null;
      if (prev) emit('stop', prev);
    }

    function preview(key) {
      const sound = getSound(key);
      if (!sound) return Promise.resolve(false);
      if (currentKey === key) { stopPreview(); return Promise.resolve(false); }

      stopPreview();
      currentKey = key;
      emit('play', key);

      const audio = new Audio(sound.file);
      audio.loop = cfg.loopPreview;
      audio.volume = sound.volume != null ? sound.volume : 0.7;

      return audio.play()
        .then(() => {
          if (currentKey !== key) { try { audio.pause(); } catch (e) {} return false; }
          currentAudio = audio;
          if (!cfg.loopPreview) {
            audio.addEventListener('ended', () => { if (currentAudio === audio) stopPreview(); });
            previewTimer = setTimeout(() => { if (currentKey === key) stopPreview(); }, PREVIEW_DURATION_MS);
          }
          return true;
        })
        .catch(() => {
          if (currentKey !== key) return false;
          // 파일 실패 → 합성음 fallback. 루프 모드면 한 사이클이 끝날 때마다 재시작.
          const SYNTH_CYCLE = PREVIEW_DURATION_MS;
          const startSynth = () => playSynth(synths, key, SYNTH_CYCLE).then(handle => {
            if (!handle) { emit('error', key); stopPreview(); return false; }
            if (currentKey !== key) { stopSynth(handle); return false; }
            currentSynth = handle;
            previewTimer = setTimeout(() => {
              if (currentKey !== key) return;
              stopSynth(currentSynth);
              currentSynth = null;
              if (cfg.loopPreview) startSynth();
              else stopPreview();
            }, SYNTH_CYCLE);
            return true;
          });
          return startSynth();
        });
    }

    // playSelected: 알람 — durationMs 후 정지. BGM 일회 재생용도.
    function playSelected(options) {
      const opts = Object.assign({ durationMs: 5000 }, options || {});
      const sound = getSound(selectedKey);
      if (!sound) return Promise.resolve(false);
      const audio = new Audio(sound.file);
      audio.loop = false;
      audio.volume = sound.volume != null ? sound.volume : 0.7;
      return audio.play()
        .then(() => {
          if (opts.durationMs) {
            setTimeout(() => { try { audio.pause(); audio.currentTime = 0; } catch (e) {} }, opts.durationMs);
          }
          return audio;
        })
        .catch(() => playSynth(synths, selectedKey, opts.durationMs).then(handle => {
          if (!handle) return false;
          setTimeout(() => stopSynth(handle), opts.durationMs);
          return handle;
        }));
    }

    function select(key) {
      if (!getSound(key)) return false;
      selectedKey = key;
      saveSelected(key);
      emit('select', key);
      return true;
    }

    return {
      get library() { return getLib(); },
      list: () => { const lib = getLib(); return Object.keys(lib).map(k => lib[k]); },
      preview,
      stopPreview,
      playSelected,
      select,
      getSelected: () => selectedKey,
      getSelectedInfo: () => getSound(selectedKey),
      on,
    };
  }

  // ────────────────────────────────────────────────
  // 두 라이브러리 플레이어 생성
  // ────────────────────────────────────────────────
  const bgm = createPlayer(BGM_LIBRARY, BGM_SYNTHS, 'pomodoro.selectedBgm', 'forest', { loopPreview: true });
  const alarm = createPlayer(getAlarmLibrary, ALARM_SYNTHS, 'pomodoro.selectedAlarm', 'classic');

  // ────────────────────────────────────────────────
  // Alarm — 종료 시 알림음 + 진동
  // ────────────────────────────────────────────────
  const ALARM_DEFAULTS = {
    beepFreq: 880,
    beepDuration: 0.25,
    beepGap: 0.15,
    beepCount: 5,
    beepVolume: 0.4,
    vibrationPattern: [400, 150, 400, 150, 600],
    durationMs: 5000,
  };

  function playBeep(ctx, startTime, opts) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = opts.beepFreq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(opts.beepVolume, startTime + 0.01);
    gain.gain.setValueAtTime(opts.beepVolume, startTime + opts.beepDuration - 0.02);
    gain.gain.linearRampToValueAtTime(0, startTime + opts.beepDuration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime); osc.stop(startTime + opts.beepDuration);
  }

  function playBeepFallback(opts) {
    const ctx = getCtx();
    if (!ctx) return Promise.resolve(false);
    const resumePromise = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    return resumePromise.then(() => {
      const now = ctx.currentTime;
      const cycle = opts.beepDuration + opts.beepGap;
      for (let i = 0; i < opts.beepCount; i++) playBeep(ctx, now + i * cycle, opts);
      return true;
    });
  }

  function vibrate(pattern) {
    if (!global.navigator || typeof global.navigator.vibrate !== 'function') return false;
    return global.navigator.vibrate(pattern || ALARM_DEFAULTS.vibrationPattern);
  }

  // ────────────────────────────────────────────────
  // on/off 상태 (localStorage)
  // ────────────────────────────────────────────────
  function makeToggle(key, defaultVal) {
    let val;
    try {
      const v = localStorage.getItem(key);
      val = v === null ? defaultVal : v === 'true';
    } catch (e) { val = defaultVal; }
    return {
      get: () => val,
      set: (v) => {
        val = !!v;
        try { localStorage.setItem(key, String(val)); } catch (e) {}
      },
    };
  }
  const alarmFlag     = makeToggle('pomodoro.alarmEnabled',     true);
  const vibrationFlag = makeToggle('pomodoro.vibrationEnabled', true);
  const ttsFlag       = makeToggle('pomodoro.ttsEnabled',       true);

  // ────────────────────────────────────────────────
  // TTS — Web Speech API
  // ────────────────────────────────────────────────
  let cachedKoVoice = null;
  function pickKoVoice() {
    if (!global.speechSynthesis) return null;
    const voices = global.speechSynthesis.getVoices();
    if (!voices.length) return null;
    return voices.find(v => v.lang === 'ko-KR')
        || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ko'))
        || null;
  }
  if (global.speechSynthesis) {
    cachedKoVoice = pickKoVoice();
    // 보이스 목록은 비동기로 로드되므로(특히 Chrome) 갱신될 때마다 다시 고른다.
    global.speechSynthesis.addEventListener('voiceschanged', () => {
      cachedKoVoice = pickKoVoice();
    });
  }

  function speak(text, options) {
    if (!text) return false;
    if (!ttsFlag.get()) return false;
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) {
      console.warn('[alarm] TTS not supported in this browser');
      return false;
    }
    const opts = Object.assign({ lang: 'ko-KR', rate: 1.0, pitch: 1.0, volume: 1.0 }, options || {});
    const synth = global.speechSynthesis;

    // 보이스가 아직 안 잡혔으면 호출 시점에 한 번 더 시도
    if (!cachedKoVoice) cachedKoVoice = pickKoVoice();

    const doSpeak = () => {
      try {
        const utter = new global.SpeechSynthesisUtterance(text);
        utter.lang   = opts.lang;
        utter.rate   = opts.rate;
        utter.pitch  = opts.pitch;
        utter.volume = opts.volume;
        // 한국어 보이스가 있을 때만 지정 — 없으면 lang만으로 기본 보이스 사용
        if (cachedKoVoice) utter.voice = cachedKoVoice;
        utter.onerror = (e) => console.warn('[alarm] TTS error:', (e && e.error) || e);
        // 일부 브라우저는 일시정지 상태로 멈춰 있어 resume()이 필요하다.
        try { synth.resume(); } catch (e) {}
        synth.speak(utter);
      } catch (e) {
        console.warn('[alarm] TTS failed:', e);
      }
    };

    try {
      synth.cancel();
      // Chrome 버그 회피: cancel() 직후 곧바로 speak()하면 발화가 씹히는 경우가 있어
      // 한 틱 뒤에 말하게 한다.
      setTimeout(doSpeak, 80);
      return true;
    } catch (e) {
      console.warn('[alarm] TTS failed:', e);
      return false;
    }
  }
  function stopSpeak() {
    try { global.speechSynthesis && global.speechSynthesis.cancel(); } catch (e) {}
  }

  // ────────────────────────────────────────────────
  // 타이머 종료 시: 진동 + 알람음 + TTS (각 토글 체크)
  // options.message 로 TTS 멘트 전달
  // ────────────────────────────────────────────────
  function trigger(options) {
    const opts = Object.assign({}, ALARM_DEFAULTS, options || {});
    const vibrated = vibrationFlag.get() ? vibrate(opts.vibrationPattern) : false;
    if (opts.message) speak(opts.message);
    if (!alarmFlag.get()) return { sound: Promise.resolve(false), vibrated };
    const soundPromise = alarm.playSelected({ durationMs: opts.durationMs })
      .then(result => result ? true : playBeepFallback(opts));
    return { sound: soundPromise, vibrated };
  }

  // ────────────────────────────────────────────────
  // Expose
  // ────────────────────────────────────────────────
  // ────────────────────────────────────────────────
  // 커스텀 알림음 추가/삭제 API
  // ────────────────────────────────────────────────
  function addCustomAlarm(name, fileUrl, opts) {
    if (!fileUrl) throw new Error('파일이 없어요');
    const key = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const entry = {
      key,
      name: (name || '나의 알림음').trim() || '나의 알림음',
      file: fileUrl,
      volume: opts && opts.volume != null ? opts.volume : 0.8,
      custom: true,
    };
    customAlarms[key] = entry;
    if (!saveCustomAlarms()) {
      delete customAlarms[key];
      throw new Error('저장 공간이 부족해요. 더 작은 파일을 선택하거나 기존 알림음을 지워주세요.');
    }
    return key;
  }

  function removeCustomAlarm(key) {
    if (!customAlarms[key]) return false;
    delete customAlarms[key];
    saveCustomAlarms();
    return true;
  }

  function listCustomAlarms() {
    return Object.keys(customAlarms).map(k => customAlarms[k]);
  }

  global.Sounds = { bgm, alarm };
  global.Alarm  = {
    trigger, vibrate, speak, stopSpeak,
    stopVibration: () => vibrate(0),
    isEnabled:           alarmFlag.get,
    setEnabled:          alarmFlag.set,
    isVibrationEnabled:  vibrationFlag.get,
    setVibrationEnabled: vibrationFlag.set,
    isTtsEnabled:        ttsFlag.get,
    setTtsEnabled:       ttsFlag.set,
    addCustom:    addCustomAlarm,
    removeCustom: removeCustomAlarm,
    listCustom:   listCustomAlarms,
    defaults: ALARM_DEFAULTS,
  };
})(typeof window !== 'undefined' ? window : this);
