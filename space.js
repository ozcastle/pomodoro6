// ============================================================
// 자간(letter-spacing) / 단어 간격(word-spacing) / 글자크기(font-scale)
// 접근성 설정 — 슬라이더 값으로 전체 UI 텍스트 간격·크기를 조절한다.
// (index.html 에서 분리)
// ============================================================

// ============================================================
// LETTER SPACING (자간) — 전체 UI에 적용 (타이머 숫자는 제외)
// 슬라이더 값(em)을 --letter-spacing 변수로 반영하면
// 위의 *:not(...) 규칙을 통해 모든 텍스트에 균일 적용된다.
// 0.12em ~ 0.25em 범위. (상한 0.25em — 글자가 두 줄로 넘치지 않는 최대치)
// 가운데 정렬 보정은 text-indent로 처리.
// ============================================================
const LS_MIN = 0.1, LS_MAX = 0.3, LS_DEFAULT = 0.12;

function setLetterSpacing(em) {
  let v = parseFloat(em);
  if (isNaN(v)) v = LS_DEFAULT;
  v = Math.min(LS_MAX, Math.max(LS_MIN, v));
  document.documentElement.style.setProperty('--letter-spacing', v + 'em');
  if (typeof _save === 'function') _save('letterSpacing', String(v));
  const label = document.getElementById('letterSpacingVal');
  if (label) label.textContent = v.toFixed(2) + 'em';
}

function initLetterSpacing() {
  let saved = LS_DEFAULT;
  if (typeof _load === 'function') saved = parseFloat(_load('letterSpacing', String(LS_DEFAULT)));
  if (isNaN(saved)) saved = LS_DEFAULT;
  saved = Math.min(LS_MAX, Math.max(LS_MIN, saved));
  const slider = document.getElementById('letterSpacingSlider');
  if (slider) slider.value = saved;
  setLetterSpacing(saved);
}

// ============================================================
// WORD SPACING (단어 간격) — 전체 UI에 적용 (타이머 숫자는 제외)
// 슬라이더 값(em)을 --word-spacing 변수로 반영. 0.12em ~ 0.3em 범위.
// ============================================================
const WS_MIN = 0, WS_MAX = 0.35, WS_DEFAULT = 0.12;

function setWordSpacing(em) {
  let v = parseFloat(em);
  if (isNaN(v)) v = WS_DEFAULT;
  v = Math.min(WS_MAX, Math.max(WS_MIN, v));
  document.documentElement.style.setProperty('--word-spacing', v + 'em');
  if (typeof _save === 'function') _save('wordSpacing', String(v));
  const label = document.getElementById('wordSpacingVal');
  if (label) label.textContent = v.toFixed(2) + 'em';
}

function initWordSpacing() {
  let saved = WS_DEFAULT;
  if (typeof _load === 'function') saved = parseFloat(_load('wordSpacing', String(WS_DEFAULT)));
  if (isNaN(saved)) saved = WS_DEFAULT;
  saved = Math.min(WS_MAX, Math.max(WS_MIN, saved));
  const slider = document.getElementById('wordSpacingSlider');
  if (slider) slider.value = saved;
  setWordSpacing(saved);
}

// ============================================================
// FONT SIZE (글자크기) — 전체 UI 비율 조절
// 슬라이더 값(85~135 %)을 --font-scale 배율로 반영하면
// 모든 font-size: calc(Npx * var(--font-scale)) 가 함께 커진다.
// ============================================================
const FS_MIN = 100, FS_MAX = 135;  /* 최소=보통(100%) */

function setFontScale(pct) {
  let p = parseInt(pct, 10) || 100;
  p = Math.min(FS_MAX, Math.max(FS_MIN, p));
  const scale = p / 100;
  document.documentElement.style.setProperty('--font-scale', String(scale));
  if (typeof _save === 'function') _save('fontScale', String(p));
  const label = document.getElementById('fontScaleVal');
  if (label) label.textContent = p === 100 ? '기본' : p + '%';
}

function initFontScale() {
  let saved = 100;
  if (typeof _load === 'function') saved = parseInt(_load('fontScale', '100'), 10) || 100;
  const slider = document.getElementById('fontScaleSlider');
  if (slider) slider.value = saved;
  setFontScale(saved);
}
