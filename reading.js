/**
 * reading.js — 읽기 가이드 (포커스 블러)
 *
 * 싱글탭/클릭  → 300ms 후 원래 기능 실행 (더블 확인 후)
 * 더블탭/클릭  → 해당 영역 강조 + 나머지 블러 (원래 기능 미실행)
 * 빈 공간 클릭 → 읽기 가이드 즉시 해제
 * 읽기 가이드 활성 시 하단 네비게이션도 블러
 */
(function () {
  'use strict';

  // 읽기 가이드 대상 요소 셀렉터
  const READABLE_SELECTOR = [
    '.check-item', '.chip', '.add-task-btn',
    '.demo-tab', '.main-btn', '.secondary-btn', '.session-badge', '.timer-ring-wrap',
    '.setting-row', '.time-btn', '.sound-option',
  ].join(', ');

  const DOUBLE_TAP_MS = 300;

  let focused      = null;
  let focusedId    = null;
  let _lastTapKey  = null;
  let _lastTapTime = 0;
  let _approvedClick = null;          // 합성 클릭 마커
  const _pending = new Map();         // key → { timer, target }

  // ── 요소 식별 키 (재렌더 후에도 동일 요소 인식) ──────────
  function _getKey(el) {
    if (el.dataset.id) return 'data:' + el.dataset.id;
    if (el.id)         return 'id:'   + el.id;
    const screenId = (el.closest('.screen') || {}).id || '';
    const cls = [...el.classList].sort().join('|');
    const text = el.textContent.trim().slice(0, 30);
    return screenId + ':' + cls + ':' + text;
  }

  // ── 보류 중인 싱글탭 관리 ────────────────────────────────
  function _clearPending(key) {
    const p = _pending.get(key);
    if (p) { clearTimeout(p.timer); _pending.delete(key); }
  }

  // 300ms 후 원래 기능을 합성 클릭으로 실행
  function _scheduleAction(key, target, clientX, clientY) {
    _clearPending(key);
    const timer = setTimeout(() => {
      _pending.delete(key);
      if (!document.contains(target)) return;
      const syn = new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX, clientY,
      });
      _approvedClick = syn;
      target.dispatchEvent(syn);   // dispatchEvent는 동기 실행
      _approvedClick = null;
    }, DOUBLE_TAP_MS);
    _pending.set(key, { timer, target });
  }

  // ── 포커스 핸들링 ────────────────────────────────────────
  function setFocus(el) {
    if (focused === el) { clearFocus(); return; }
    if (focused) focused.classList.remove('reading-focused');
    document.querySelectorAll('.screen.reading-active')
            .forEach(s => s.classList.remove('reading-active'));

    focused   = el;
    focusedId = el.dataset.id || null;
    el.classList.add('reading-focused');

    const screen = el.closest('.screen');
    if (screen) screen.classList.add('reading-active');
    document.body.classList.add('reading-guide-active');
  }

  function clearFocus() {
    if (focused) { focused.classList.remove('reading-focused'); focused = null; }
    focusedId = null;
    document.querySelectorAll('.screen.reading-active')
            .forEach(s => s.classList.remove('reading-active'));
    document.body.classList.remove('reading-guide-active');
  }

  // 동적 렌더 후 data-id로 포커스 재적용 (checklist.js render() 에서 호출)
  function reapplyFocus() {
    if (!focusedId) return;
    const el = document.querySelector('[data-id="' + focusedId + '"]');
    if (el) {
      focused = el;
      el.classList.add('reading-focused');
      const screen = el.closest('.screen');
      if (screen) screen.classList.add('reading-active');
      document.body.classList.add('reading-guide-active');
    } else {
      clearFocus();
    }
  }

  // ── 클릭 인터셉트 (캡처 페이즈 — 모든 핸들러보다 먼저 실행) ──
  function _onCapture(e) {
    // ① 승인된 합성 클릭은 통과
    if (e === _approvedClick) return;

    // ② 모달 내부 클릭은 인터셉트하지 않음 (지연 없이 즉시 실행)
    if (e.target.closest('.modal-overlay')) return;

    const el  = e.target.closest(READABLE_SELECTOR);
    const now = Date.now();

    // ③ 대상 요소가 없으면 읽기 가이드 해제 후 원래 클릭 통과
    if (!el) {
      _lastTapKey  = null;
      _lastTapTime = 0;
      if (focused) clearFocus();
      return; // stopPropagation 안 함 → 원래 기능 유지
    }

    // ④ 대상 요소 클릭: 원본 클릭 차단 (싱글·더블 공통)
    e.stopPropagation();

    const key      = _getKey(el);
    const isDouble = (key === _lastTapKey) && (now - _lastTapTime) < DOUBLE_TAP_MS;

    if (isDouble) {
      // 더블탭 → 보류 중인 싱글탭 취소, 읽기 가이드 실행
      _clearPending(key);
      _lastTapKey  = null;
      _lastTapTime = 0;
      setFocus(el);
    } else {
      // 싱글탭 → 300ms 후 원래 기능 실행 (더블이 오면 취소됨)
      _lastTapKey  = key;
      _lastTapTime = now;
      _scheduleAction(key, e.target, e.clientX, e.clientY);
    }
  }

  // ── CSS 주입 ──────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('reading-guide-styles')) return;
    const s = document.createElement('style');
    s.id = 'reading-guide-styles';
    s.textContent = `
      /* 블러 전환 (transition이 없는 요소에만 추가) */
      .setting-row, .time-btn, .sound-option,
      .session-badge, .timer-ring-wrap, .session-dots,
      .bottom-nav {
        transition: filter 0.35s ease, opacity 0.35s ease;
      }

      /* ── 하단 네비게이션 블러 ── */
      .reading-guide-active .bottom-nav {
        filter: blur(3px);
        opacity: 0.28;
      }

      /* ── 타이머 화면 블러 ── */
      #screen-timer.reading-active .demo-tab:not(.reading-focused),
      #screen-timer.reading-active .session-badge:not(.reading-focused),
      #screen-timer.reading-active .timer-ring-wrap:not(.reading-focused),
      #screen-timer.reading-active .main-btn:not(.reading-focused),
      #screen-timer.reading-active .secondary-btn:not(.reading-focused),
      #screen-timer.reading-active .session-dots {
        filter: blur(3px);
        opacity: 0.28;
      }

      /* ── 체크리스트 화면 블러 ── */
      #screen-checklist.reading-active .screen-header,
      #screen-checklist.reading-active .chip:not(.reading-focused),
      #screen-checklist.reading-active .check-item:not(.reading-focused),
      #screen-checklist.reading-active .add-task-btn:not(.reading-focused),
      #screen-checklist.reading-active .add-task-input-wrap {
        filter: blur(3px);
        opacity: 0.28;
      }

      /* ── 설정 화면 블러 ── */
      #screen-settings.reading-active .screen-header,
      #screen-settings.reading-active .section-label,
      #screen-settings.reading-active .setting-row:not(.reading-focused),
      #screen-settings.reading-active .time-btn:not(.reading-focused),
      #screen-settings.reading-active .sound-option:not(.reading-focused) {
        filter: blur(3px);
        opacity: 0.28;
      }

      /* ── 포커스된 항목 강조 (블러 해제) ── */
      .reading-focused {
        filter: none !important;
        opacity: 1 !important;
        position: relative;
        z-index: 2;
      }

      /* 확대 적용 (.timer-ring-wrap 제외 — pulse 애니메이션 유지) */
      .check-item.reading-focused,
      .chip.reading-focused,
      .add-task-btn.reading-focused,
      .demo-tab.reading-focused,
      .main-btn.reading-focused,
      .secondary-btn.reading-focused,
      .session-badge.reading-focused,
      .setting-row.reading-focused,
      .time-btn.reading-focused,
      .sound-option.reading-focused {
        transform: scale(1.018) !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ── 초기화 ────────────────────────────────────────────────
  function init() {
    _injectStyles();
    document.addEventListener('click', _onCapture, true);

    // 화면 전환 시 포커스된 화면이 비활성화되면 읽기 가이드 자동 해제
    document.querySelectorAll('.screen').forEach(screen => {
      new MutationObserver(() => {
        if (!focused) return;
        if (screen.classList.contains('active')) return;
        if (focused.closest('.screen') === screen) clearFocus();
      }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    });
  }

  init();

  window.ReadingGuide = {
    clearFocus,
    reapplyFocus,
    isEnabled: () => focused !== null,
  };
})();
