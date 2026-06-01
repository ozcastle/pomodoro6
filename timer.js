'use strict';

// ============================================================
// STATE
// ============================================================
let currentMode = 'focus';
let running = false;
let secs = 0;
let sessionTotal = 0;
let focusTime = 25;
let restTime = 5;
let longRestTime = 15;
let sessionCount = 4;
let completedSessions = 0;
let allDone = false;
let focusJustCompleted = false;
let intervalId = null;
let waveRafId = null;
let waveSyncPoint = null;
let activeTimeKey = null;
let activeTimeValue = 25;
let pendingSessionCount = null;
const savedSecsPerMode = { focus: null, rest: null, done: null };

const TIME_CONFIG = {
  focus:    { min: 5, max: 120, step: 1, unit: '분', label: '집중 시간',      valId: 'focusTimeVal'   },
  rest:     { min: 3, max: 60,  step: 1, unit: '분', label: '짧은 휴식 시간', valId: 'restTimeVal'    },
  count:    { min: 1, max: 10,  step: 1, unit: '회', label: '세션 횟수',      valId: 'countVal'       },
  longRest: { min: 5, max: 120, step: 1, unit: '분', label: '긴 휴식 시간',   valId: 'longRestTimeVal'},
};

// ============================================================
// localStorage 헬퍼
// ============================================================
function _load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function _save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const el = document.getElementById('clockDisplay');
  if (el) el.textContent = h + ':' + m;
}

// ============================================================
// WAVE FILL
// ============================================================
function _rawSetWave(ratio) {
  const progress = (currentMode === 'focus')
    ? Math.max(0, Math.min(1, ratio))
    : Math.max(0, Math.min(1, 1 - ratio));
  const level = 8 + progress * 84;
  const front = document.getElementById('waveFillFront');
  const back  = document.getElementById('waveFillBack');
  if (!front || !back) return;
  front.style.height = level + '%';
  back.style.height  = (level + 3) + '%';
}

function _startWaveRaf() {
  if (waveRafId) cancelAnimationFrame(waveRafId);
  waveSyncPoint = { ts: performance.now(), secs };
  function frame(now) {
    if (!running) { waveRafId = null; return; }
    if (sessionTotal > 0) {
      const elapsed = (now - waveSyncPoint.ts) / 1000;
      _rawSetWave(Math.max(0, waveSyncPoint.secs - elapsed) / sessionTotal);
    }
    waveRafId = requestAnimationFrame(frame);
  }
  waveRafId = requestAnimationFrame(frame);
}

function setWaveLevel(ratioRemaining, instant) {
  if (waveRafId) { cancelAnimationFrame(waveRafId); waveRafId = null; }
  _rawSetWave(ratioRemaining);
}

// ============================================================
// CHECKLIST — 체크되지 않은 가장 위 항목 가져오기
// ============================================================
function getTopUncheckedTask() {
  if (window.TaskManager && typeof window.TaskManager.getTopUnchecked === 'function') {
    return window.TaskManager.getTopUnchecked();
  }
  const items = document.querySelectorAll('.check-item:not(.done-task)');
  if (!items.length) return null;
  const t = items[0].querySelector('.check-text');
  return t ? t.textContent.trim() : null;
}

// ============================================================
// SESSION BADGE — 모든 모드에서 체크리스트 연동
// ============================================================
function updateSessionBadge() {
  const badge = document.getElementById('sessionBadge');
  if (!badge) return;
  const task = getTopUncheckedTask();
  const text = task !== null ? task : '모든 할 일 완료';
  badge.innerHTML = '<i class="fa-solid fa-list-check" style="margin-right:10px;font-size:14px;"></i>' + text;
}

// ============================================================
// SESSION DOTS
// ============================================================
function updateDots() {
  document.querySelectorAll('.session-dots').forEach(container => {
    container.innerHTML = '';
    for (let i = 0; i < sessionCount; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot' + (i < completedSessions ? ' filled' : '');
      container.appendChild(dot);
    }
  });
  updateSessionBadge();
}

// ============================================================
// TIMER DISPLAY
// ============================================================
function updateTimerDisplay() {
  const mm = Math.floor(secs / 60).toString().padStart(2, '0');
  const ss = (secs % 60).toString().padStart(2, '0');
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = mm + ':' + ss;
}

// ============================================================
// TIMER ENGINE
// ============================================================
function startInterval() {
  clearInterval(intervalId);
  _startWaveRaf();
  intervalId = setInterval(() => {
    if (!running) { clearInterval(intervalId); return; }
    secs = Math.max(0, secs - 1);
    updateTimerDisplay();
    waveSyncPoint = { ts: performance.now(), secs };
    if (secs <= 0) {
      clearInterval(intervalId);
      running = false;
      if (waveRafId) { cancelAnimationFrame(waveRafId); waveRafId = null; }
      handleTimerEnd();
    }
  }, 1000);
}

function isTimerScreenActive() {
  const s = document.getElementById('screen-timer');
  return s && s.classList.contains('active');
}

function handleTimerEnd() {
  function fire(message) {
    if (window.Alarm) window.Alarm.trigger({ message });
  }

  if (currentMode === 'focus') {
    savedSecsPerMode.focus = null; // 자연 종료 — 저장 시간 무효화
    focusJustCompleted = true;
    updateDots();
    fire('집중 시간이 끝났어요. 잠시 쉬어요.');
    showModal('focus-end');

  } else if (currentMode === 'rest') {
    savedSecsPerMode.rest = null; // 자연 종료 — 저장 시간 무효화
    if (focusJustCompleted) {
      completedSessions++;
      _save('completedSessions', completedSessions);
    }
    focusJustCompleted = false;

    if (completedSessions >= sessionCount) {
      allDone = true;
      _save('allDone', true);
      updateDots();
      const doneTab = document.getElementById('doneTab');
      if (doneTab) doneTab.classList.remove('demo-tab-disabled');
      fire('수고했어요! 모든 세션을 완료했어요!');
      showModal('all-done');
    } else {
      updateDots();
      fire('쉬는 시간이 끝났어요. 다시 시작할까요?');
      showModal('rest-end');
    }

  } else if (currentMode === 'done') {
    savedSecsPerMode.done = null; // 자연 종료 — 저장 시간 무효화
    fire('긴 휴식이 끝났어요. 오늘 하루 수고했어요!');
    showModal('done');
  }
}

// ============================================================
// TIMER CONTROLS
// ============================================================
function toggleTimer() {
  running = !running;
  const btn = document.getElementById('mainBtn');
  if (running) {
    if (btn) btn.innerHTML = '<i class="fa fa-pause"></i>&nbsp; 멈춤';
    startInterval();
  } else {
    if (btn) btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 계속';
    clearInterval(intervalId);
  }
}

function resetTimer() {
  clearInterval(intervalId);
  running = false;
  savedSecsPerMode[currentMode] = null; // 리셋 버튼 — 현재 모드 저장 시간 무효화
  if (currentMode === 'rest') {
    secs = restTime * 60;
  } else if (currentMode === 'done') {
    secs = longRestTime * 60;
  } else {
    secs = focusTime * 60;
  }
  sessionTotal = secs;
  updateTimerDisplay();
  setWaveLevel(1, true);
  const btn = document.getElementById('mainBtn');
  if (btn) btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 시작';
}

function resetAll() {
  clearInterval(intervalId);
  running = false;
  completedSessions = 0;
  allDone = false;
  focusJustCompleted = false;
  savedSecsPerMode.focus = savedSecsPerMode.rest = savedSecsPerMode.done = null;
  _save('completedSessions', 0);
  _save('allDone', false);
  currentMode = 'focus';
  secs = focusTime * 60;
  sessionTotal = secs;
  _applyModeUI('focus');
  updateTimerDisplay();
  setWaveLevel(1, true);
  updateDots();
  _highlightTab(0);
}

// ============================================================
// MODE TRANSITIONS
// ============================================================
function startRestMode(autoStart) {
  closeModal('focus-end');
  clearInterval(intervalId);
  running = false;
  savedSecsPerMode.focus = null; // 집중 완료 — 집중 저장 시간 무효화
  currentMode = 'rest';
  secs = restTime * 60;
  sessionTotal = secs;
  _applyModeUI('rest');
  updateTimerDisplay();
  setWaveLevel(1, true);
  _highlightTab(1);
  if (autoStart) {
    running = true;
    const btn = document.getElementById('mainBtn');
    if (btn) btn.innerHTML = '<i class="fa fa-pause"></i>&nbsp; 멈춤';
    startInterval();
  }
}

function continueFocus() {
  closeModal('focus-end');
  clearInterval(intervalId);

  // 이어가기 = 휴식 1회 한 걸로 처리 → 세션 카운트 증가
  if (focusJustCompleted) {
    completedSessions++;
    _save('completedSessions', completedSessions);
  }
  focusJustCompleted = false;
  savedSecsPerMode.focus = null;

  // 모든 세션 완료 → 완료 모달
  if (completedSessions >= sessionCount) {
    allDone = true;
    _save('allDone', true);
    running = false;
    updateDots();
    const doneTab = document.getElementById('doneTab');
    if (doneTab) doneTab.classList.remove('demo-tab-disabled');
    if (window.Alarm) window.Alarm.trigger({ message: '수고했어요! 모든 세션을 완료했어요!' });
    showModal('all-done');
    return;
  }

  running = true;
  secs = focusTime * 60;
  sessionTotal = secs;
  updateTimerDisplay();
  setWaveLevel(1, true);
  updateDots();
  const btn = document.getElementById('mainBtn');
  if (btn) btn.innerHTML = '<i class="fa fa-pause"></i>&nbsp; 멈춤';
  startInterval();
}

function startFocusMode(autoStart) {
  closeModal('rest-end');
  clearInterval(intervalId);
  running = false;
  savedSecsPerMode.rest = null; // 휴식 완료 — 휴식 저장 시간 무효화
  currentMode = 'focus';
  secs = focusTime * 60;
  sessionTotal = secs;
  _applyModeUI('focus');
  updateTimerDisplay();
  setWaveLevel(1, true);
  updateDots();
  _highlightTab(0);
  if (autoStart) {
    running = true;
    const btn = document.getElementById('mainBtn');
    if (btn) btn.innerHTML = '<i class="fa fa-pause"></i>&nbsp; 멈춤';
    startInterval();
  }
}

function continueRest() {
  closeModal('rest-end');
  clearInterval(intervalId);
  running = false;
  savedSecsPerMode.rest = null; // 더 쉬기 선택 — 휴식 저장 시간 무효화
  currentMode = 'focus';
  secs = focusTime * 60;
  sessionTotal = secs;
  _applyModeUI('focus');
  updateTimerDisplay();
  setWaveLevel(1, true);
  updateDots();
  _highlightTab(0);
}

function handleDoneReset() {
  closeModal('done');
  resetAll();
}

function startLongRest() {
  closeModal('all-done');
  clearInterval(intervalId);
  currentMode = 'done';
  secs = longRestTime * 60;
  sessionTotal = secs;
  savedSecsPerMode.done = null;
  _applyModeUI('done');
  updateDots();
  updateTimerDisplay();
  setWaveLevel(1, true);
  _highlightTab(2);
  running = true;
  const btn = document.getElementById('mainBtn');
  if (btn) btn.innerHTML = '<i class="fa fa-pause"></i>&nbsp; 멈춤';
  startInterval();
}

function startNewSessionFromAllDone() {
  closeModal('all-done');
  resetAll();
}

// ============================================================
// MODE UI 내부 헬퍼
// ============================================================
function _applyWaveStyle(mode) {
  const frontSurface = document.querySelector('#waveFillFront .wave-surface');
  const backSurface  = document.querySelector('#waveFillBack .wave-surface');
  const frontPath    = document.querySelector('#waveFillFront .wave-path');
  const backPath     = document.querySelector('#waveFillBack .wave-path');

const configs = {
  focus: {
    frontDur: '4.0s', backDur: '5.0s',
    frontD: 'M0,13 C25,22 75,22 100,13 C125,4 175,4 200,13 C225,22 275,22 300,13 C325,4 375,4 400,13 L400,26 L0,26 Z',
    backD:  'M0,13 C25,4 75,4 100,13 C125,22 175,22 200,13 C225,4 275,4 300,13 C325,22 375,22 400,13 L400,26 L0,26 Z',
  },
  rest: {
    frontDur: '4.0s', backDur: '5.0s',
    frontD: 'M0,13 C25,22 75,22 100,13 C125,4 175,4 200,13 C225,22 275,22 300,13 C325,4 375,4 400,13 L400,26 L0,26 Z',
    backD:  'M0,13 C25,4 75,4 100,13 C125,22 175,22 200,13 C225,4 275,4 300,13 C325,22 375,22 400,13 L400,26 L0,26 Z',
  },
done: {
  frontDur: '7s', backDur: '9s',
  frontD: 'M0,13 C25,18 75,18 100,13 C125,8 175,8 200,13 C225,18 275,18 300,13 C325,8 375,8 400,13 L400,26 L0,26 Z',
  backD:  'M0,13 C25,8 75,8 100,13 C125,18 175,18 200,13 C225,8 275,8 300,13 C325,18 375,18 400,13 L400,26 L0,26 Z',
},
};

  const cfg = configs[mode] || configs.focus;
  if (frontSurface) frontSurface.style.animationDuration = cfg.frontDur;
  if (backSurface)  backSurface.style.animationDuration  = cfg.backDur;
  if (frontPath)    frontPath.setAttribute('d', cfg.frontD);
  if (backPath)     backPath.setAttribute('d', cfg.backD);
}

function _applyModeUI(mode) {
  const btn           = document.getElementById('mainBtn');
  const resetBtn      = document.getElementById('resetBtn');
  const longRestReset = document.getElementById('longRestResetBtn');
  const wave          = document.getElementById('waveCircle');
  const doneTab       = document.getElementById('doneTab');
  const modeLabel     = document.getElementById('modeLabel');

  if (wave) wave.className = 'wave-circle' + (mode !== 'focus' ? ' ' + mode : '');

  if (mode === 'focus') {
    if (btn) { btn.className = 'main-btn btn-focus'; btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 시작'; }
    if (resetBtn)      resetBtn.style.display     = '';
    if (longRestReset) longRestReset.style.display = 'none';
    if (modeLabel) modeLabel.textContent = '천천히 한 번 해볼까요?';
    applyTheme('focus');

  } else if (mode === 'rest') {
    if (btn) { btn.className = 'main-btn btn-rest'; btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 시작'; }
    if (resetBtn)      resetBtn.style.display     = '';
    if (longRestReset) longRestReset.style.display = 'none';
    if (modeLabel) modeLabel.textContent = '가볍게 스트레칭 후 쉬어요.';
    applyTheme('rest');

  } else if (mode === 'done') {
    if (btn) { btn.className = 'main-btn btn-done'; btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 시작'; }
    if (resetBtn)      resetBtn.style.display     = 'none';
    if (longRestReset) longRestReset.style.display = '';
    if (doneTab) doneTab.classList.remove('demo-tab-disabled');
    if (modeLabel) modeLabel.textContent = '모든 세션이 끝났어요. 여유롭게 쉬어요!';
    applyTheme('done');
    _highlightTab(2);
  }

  _applyWaveStyle(mode);
  updateSessionBadge();
}

function _highlightTab(idx) {
  document.querySelectorAll('.demo-tab').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
}

// ============================================================
// setMode (탭 버튼 onclick) — 모드 전환 시 남은 시간 보존
// ============================================================
function setMode(mode, tabEl) {
  // 현재 모드의 남은 시간 저장 (중간에 멈춰있던 경우)
  if (currentMode && secs > 0 && secs < sessionTotal) {
    savedSecsPerMode[currentMode] = secs;
  } else if (currentMode) {
    savedSecsPerMode[currentMode] = null;
  }

  clearInterval(intervalId);
  running = false;
  focusJustCompleted = false;
  currentMode = mode;

  // 모드별 전체 시간 설정
  if (mode === 'focus') {
    sessionTotal = focusTime * 60;
  } else if (mode === 'rest') {
    sessionTotal = restTime * 60;
  } else if (mode === 'done') {
    sessionTotal = longRestTime * 60;
  } else {
    sessionTotal = 0;
  }

  // 저장된 남은 시간이 있으면 복원, 없으면 전체 시간
  const saved = savedSecsPerMode[mode];
  secs = (saved !== null && saved > 0) ? saved : sessionTotal;

  _applyModeUI(mode);
  updateTimerDisplay();
  if (sessionTotal > 0) setWaveLevel(secs / sessionTotal, true);
  updateDots();
  document.querySelectorAll('.demo-tab').forEach(t => t.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');

  // 중간 시간이 복원됐으면 버튼을 "계속"으로
  if (secs > 0 && secs < sessionTotal) {
    const btn = document.getElementById('mainBtn');
    if (btn) btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 계속';
  }
}

// ============================================================
// MODALS
// ============================================================
function showModal(name) {
  const el = document.getElementById('modal-' + name);
  if (el) el.classList.add('show');
}

function closeModal(name) {
  const el = document.getElementById('modal-' + name);
  if (el) el.classList.remove('show');
}

// ============================================================
// CHECKLIST
// ============================================================
function toggleCheck(item) {
  const box    = item.querySelector('.check-box');
  const isDone = item.classList.contains('done-task');
  if (isDone) {
    item.classList.remove('done-task');
    box.classList.remove('checked');
  } else {
    item.classList.add('done-task');
    box.classList.add('checked');
  }
  updateSessionBadge();
}

// ============================================================
// TIME PICKER SHEET
// ============================================================
function openTimeSheet(key) {
  activeTimeKey = key;
  const cfg = TIME_CONFIG[key];
  const el  = document.getElementById(cfg.valId);
  const cur = el ? parseInt(el.textContent, 10) : cfg.min;
  activeTimeValue = isNaN(cur) ? cfg.min : cur;

  document.getElementById('timeSheetTitle').textContent = cfg.label;
  document.getElementById('timeSheetUnit').textContent  = cfg.unit;
  document.getElementById('timeSheetValue').textContent = activeTimeValue;

  const slider = document.getElementById('timeSheetSlider');
  slider.min   = cfg.min;
  slider.max   = cfg.max;
  slider.step  = cfg.step;
  slider.value = activeTimeValue;

  document.getElementById('timeSheetMin').textContent = cfg.min + cfg.unit;
  document.getElementById('timeSheetMax').textContent = cfg.max + cfg.unit;

  showModal('time-sheet');
}

function adjustTime(delta) {
  if (!activeTimeKey) return;
  const cfg = TIME_CONFIG[activeTimeKey];
  activeTimeValue = Math.max(cfg.min, Math.min(cfg.max, activeTimeValue + delta * cfg.step));
  document.getElementById('timeSheetValue').textContent = activeTimeValue;
  document.getElementById('timeSheetSlider').value = activeTimeValue;
}

function onSliderInput(val) {
  if (!activeTimeKey) return;
  activeTimeValue = parseInt(val, 10);
  document.getElementById('timeSheetValue').textContent = activeTimeValue;
}

function saveTimeSheet() {
  if (!activeTimeKey) { closeModal('time-sheet'); return; }

  let originalValue = focusTime;
  if (activeTimeKey === 'rest')          originalValue = restTime;
  else if (activeTimeKey === 'count')    originalValue = sessionCount;
  else if (activeTimeKey === 'longRest') originalValue = longRestTime;

  if (activeTimeValue !== originalValue && completedSessions > 0) {
    pendingSessionCount = activeTimeValue;
    closeModal('time-sheet');
    showModal('session-reset');
    return;
  }

  _applySavedTimeSheet();
  closeModal('time-sheet');
}

function _applySavedTimeSheet() {
  const cfg = TIME_CONFIG[activeTimeKey];
  const el  = document.getElementById(cfg.valId);
  if (el) el.textContent = activeTimeValue;

  if (activeTimeKey === 'focus') {
    focusTime = activeTimeValue;
    _save('focusTime', focusTime);
    if (currentMode === 'focus' && !running) {
      secs = focusTime * 60; sessionTotal = secs;
      updateTimerDisplay(); setWaveLevel(1, true);
    }
  } else if (activeTimeKey === 'rest') {
    restTime = activeTimeValue;
    _save('restTime', restTime);
    if (currentMode === 'rest' && !running) {
      secs = restTime * 60; sessionTotal = secs;
      updateTimerDisplay(); setWaveLevel(1, true);
    }
  } else if (activeTimeKey === 'count') {
    sessionCount = activeTimeValue;
    _save('sessionCount', sessionCount);
    completedSessions = Math.min(completedSessions, sessionCount);
    _save('completedSessions', completedSessions);
    updateDots();
  } else if (activeTimeKey === 'longRest') {
    longRestTime = activeTimeValue;
    _save('longRestTime', longRestTime);
    if (currentMode === 'done' && !running) {
      secs = longRestTime * 60; sessionTotal = secs;
      updateTimerDisplay(); setWaveLevel(1, true);
    }
  }
}

function confirmSessionReset() {
  if (pendingSessionCount !== null) {
    if (activeTimeKey === 'focus') {
      focusTime = pendingSessionCount;
      _save('focusTime', focusTime);
      const el = document.getElementById('focusTimeVal');
      if (el) el.textContent = focusTime;
    } else if (activeTimeKey === 'rest') {
      restTime = pendingSessionCount;
      _save('restTime', restTime);
      const el = document.getElementById('restTimeVal');
      if (el) el.textContent = restTime;
    } else if (activeTimeKey === 'count') {
      sessionCount = pendingSessionCount;
      _save('sessionCount', sessionCount);
      const el = document.getElementById('countVal');
      if (el) el.textContent = sessionCount;
    } else if (activeTimeKey === 'longRest') {
      longRestTime = pendingSessionCount;
      _save('longRestTime', longRestTime);
      const el = document.getElementById('longRestTimeVal');
      if (el) el.textContent = longRestTime;
    }

    completedSessions = 0;
    allDone = false;
    focusJustCompleted = false;
    savedSecsPerMode.focus = savedSecsPerMode.rest = savedSecsPerMode.done = null;
    _save('completedSessions', 0);
    _save('allDone', false);

    clearInterval(intervalId);
    running = false;
    currentMode = 'focus';

    secs = focusTime * 60;
    sessionTotal = secs;

    _applyModeUI('focus');
    updateTimerDisplay();
    setWaveLevel(1, true);
    updateDots();
    _highlightTab(0);

    pendingSessionCount = null;
  }
  closeModal('session-reset');
}

function cancelSessionReset() {
  pendingSessionCount = null;
  closeModal('session-reset');
}

// ============================================================
// INIT — DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  focusTime         = _load('focusTime',         25);
  restTime          = _load('restTime',           5);
  longRestTime      = _load('longRestTime',       15);
  sessionCount      = _load('sessionCount',       4);
  completedSessions = _load('completedSessions',  0);
  allDone           = _load('allDone',            false);

  const fv  = document.getElementById('focusTimeVal');
  const rv  = document.getElementById('restTimeVal');
  const lrv = document.getElementById('longRestTimeVal');
  const cv  = document.getElementById('countVal');
  if (fv)  fv.textContent  = focusTime;
  if (rv)  rv.textContent  = restTime;
  if (lrv) lrv.textContent = longRestTime;
  if (cv)  cv.textContent  = sessionCount;

  const savedMode = _load('timerMode', 'focus');
  const savedSecs = _load('timerSecs', focusTime * 60);

  if (allDone || savedMode === 'done') {
    currentMode  = 'done';
    secs         = Math.min(savedSecs, longRestTime * 60);
    sessionTotal = longRestTime * 60;
    _applyModeUI('done');
    _highlightTab(2);
  } else if (savedMode === 'rest') {
    currentMode  = 'rest';
    secs         = Math.min(savedSecs, restTime * 60);
    sessionTotal = restTime * 60;
    _applyModeUI('rest');
    _highlightTab(1);
  } else {
    currentMode  = 'focus';
    secs         = Math.min(savedSecs, focusTime * 60);
    sessionTotal = focusTime * 60;
    _applyModeUI('focus');
    _highlightTab(0);
  }

  updateTimerDisplay();
  if (sessionTotal > 0) setWaveLevel(secs / sessionTotal, true);
  updateDots();

  const savedBg = _load('bgColor', '');
  if (savedBg) {
    const swatch = [...document.querySelectorAll('.swatch')].find(s =>
      (s.getAttribute('onclick') || '').includes(savedBg)
    );
    if (swatch) {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      const t = SWATCH_THEMES[savedBg];
      if (t) applyPalette(t);
    }
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('show');
    });
  });

  // 타이머 화면이 다시 활성화될 때 표시와 버튼 상태 복원
  const timerScreen = document.getElementById('screen-timer');
  if (timerScreen) {
    new MutationObserver(() => {
      if (!timerScreen.classList.contains('active')) return;
      updateTimerDisplay();
      if (sessionTotal > 0) setWaveLevel(secs / sessionTotal, true);
      const btn = document.getElementById('mainBtn');
      if (btn && !running) {
        if (secs > 0 && secs < sessionTotal) {
          btn.innerHTML = '<i class="fa fa-play"></i>&nbsp; 계속';
        }
      }
    }).observe(timerScreen, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('beforeunload', () => {
    _save('timerSecs',         secs);
    _save('timerMode',         currentMode);
    _save('completedSessions', completedSessions);
    _save('allDone',           allDone);
  });
});
