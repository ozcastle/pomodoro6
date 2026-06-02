(function () {
  'use strict';

  // ── 선택자 ──────────────────────────────────────────────────
  // 인터랙티브 요소: 요소 전체 강조 + 내부 한글 텍스트 1.2×
  // slider-row 제외
  const INTERACTIVE_SELECTOR = [
    '.check-item', '.chip', '.add-task-btn',
    '.demo-tab', '.main-btn', '.secondary-btn',
    '.setting-row', '.time-btn', '.sound-option', '.color-row',
    '.session-badge', '.timer-ring-wrap',
  ].join(', ');

  // 순수 텍스트 블록: 텍스트 1.2×만 (클릭 동작 없음)
  const TEXT_ONLY_SELECTOR = '.modal-title, .modal-body, .session-label, .section-label, .slider-label';

  const READABLE_SELECTOR = INTERACTIVE_SELECTOR + ', ' + TEXT_ONLY_SELECTOR;

  const DOUBLE_TAP_MS = 300;

  // 한글 또는 숫자 포함 여부 확인
  const KOREAN_OR_NUM_RE = /[가-힯ᄀ-ᇿ㄰-㆏0-9]/;
  function _hasKoreanOrNumber(el) {
    return KOREAN_OR_NUM_RE.test(el.textContent);
  }

  // ── 상태 ─────────────────────────────────────────────────────
  let focused        = null;
  let focusedId      = null;
  let _lastTapKey    = null;
  let _lastTapTime   = 0;
  let _approvedClick = null;
  const _pending     = new Map();

  // ── 요소 식별 키 ─────────────────────────────────────────────
  function _getKey(el) {
    if (el.dataset.id) return 'data:' + el.dataset.id;
    if (el.id)         return 'id:'   + el.id;
    const ctx  = (el.closest('.screen, .modal-overlay') || {}).id || '';
    const cls  = [...el.classList].sort().join('|');
    const text = el.textContent.trim().slice(0, 30);
    return ctx + ':' + cls + ':' + text;
  }

  // ── 보류 중 싱글탭 관리 ──────────────────────────────────────
  function _clearPending(key) {
    const p = _pending.get(key);
    if (p) { clearTimeout(p.timer); _pending.delete(key); }
  }

  function _scheduleAction(key, target, clientX, clientY) {
    _clearPending(key);
    const timer = setTimeout(() => {
      _pending.delete(key);
      if (!document.contains(target)) return;
      const syn = new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY });
      _approvedClick = syn;
      target.dispatchEvent(syn);
      _approvedClick = null;
    }, DOUBLE_TAP_MS);
    _pending.set(key, { timer, target });
  }

  // ── 포커스 설정 / 해제 ───────────────────────────────────────
  function setFocus(el) {
    if (!_hasKoreanOrNumber(el)) return;
    if (focused === el) { clearFocus(); return; }
    if (focused) focused.classList.remove('reading-focused');

    document.querySelectorAll('.reading-active, .modal-reading-active')
            .forEach(s => s.classList.remove('reading-active', 'modal-reading-active'));

    focused   = el;
    focusedId = el.dataset.id || null;
    el.classList.add('reading-focused');

    const modal  = el.closest('.modal-overlay');
    const screen = el.closest('.screen');
    if (modal)       modal.classList.add('modal-reading-active');
    else if (screen) screen.classList.add('reading-active');
    document.body.classList.add('reading-guide-active');
  }

  function clearFocus() {
    if (focused) { focused.classList.remove('reading-focused'); focused = null; }
    focusedId    = null;
    _lastTapKey  = null;
    _lastTapTime = 0;
    document.querySelectorAll('.reading-active, .modal-reading-active')
            .forEach(s => s.classList.remove('reading-active', 'modal-reading-active'));
    document.body.classList.remove('reading-guide-active');
  }

  // 동적 재렌더 후 data-id로 포커스 재적용 (checklist.js에서 호출)
  function reapplyFocus() {
    if (!focusedId) return;
    const el = document.querySelector('[data-id="' + focusedId + '"]');
    if (el) {
      focused = el;
      el.classList.add('reading-focused');
      const modal  = el.closest('.modal-overlay');
      const screen = el.closest('.screen');
      if (modal)       modal.classList.add('modal-reading-active');
      else if (screen) screen.classList.add('reading-active');
      document.body.classList.add('reading-guide-active');
    } else {
      clearFocus();
    }
  }

  // ── 클릭 인터셉트 (캡처 페이즈) ─────────────────────────────
  function _onCapture(e) {
    // 승인된 합성 클릭은 통과
    if (e === _approvedClick) return;

    // 삭제 버튼 즉시 통과
    if (e.target.closest('.sound-delete')) { clearFocus(); return; }

    const el  = e.target.closest(READABLE_SELECTOR);
    const now = Date.now();

    if (!el) {
      // 빈 공간 클릭 → 포커스 해제 (모달 닫기 등은 그대로 진행)
      if (focused) clearFocus();
      return;
    }

    e.stopPropagation();

    // 포커스 중 다른 요소 탭 → 포커스만 해제, 동작 실행 안 함
    if (focused && el !== focused) {
      clearFocus();
      return;
    }

    const key      = _getKey(el);
    const isDouble = (key === _lastTapKey) && (now - _lastTapTime) < DOUBLE_TAP_MS;
    const isText   = el.matches(TEXT_ONLY_SELECTOR);

    if (isDouble) {
      _clearPending(key);
      _lastTapKey  = null;
      _lastTapTime = 0;
      setFocus(el);
    } else {
      _lastTapKey  = key;
      _lastTapTime = now;
      if (isText) {
        // 순수 텍스트: 싱글탭 동작 없음, 더블탭 감지용으로만 사용
        const t = setTimeout(() => _pending.delete(key), DOUBLE_TAP_MS);
        _pending.set(key, { timer: t, target: e.target });
      } else {
        // 인터랙티브: 싱글탭 → 300ms 후 클릭 실행
        _scheduleAction(key, e.target, e.clientX, e.clientY);
      }
    }
  }

  // ── CSS 주입 ─────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('reading-guide-styles')) return;
    const s = document.createElement('style');
    s.id = 'reading-guide-styles';
    s.textContent = `
      /* ── 블러 전환 대상 ── */
      .setting-row, .time-btn, .sound-option, .color-row,
      .session-badge, .timer-ring-wrap, .session-dots, .bottom-nav,
      .section-label, .slider-label {
        transition: filter .35s ease, opacity .35s ease;
      }
      .modal-overlay .main-btn, .modal-overlay .secondary-btn,
      .modal-overlay .modal-title, .modal-overlay .modal-body,
      .modal-overlay .sound-option, .modal-overlay .modal-icon-wrap {
        transition: filter .35s ease, opacity .35s ease;
      }

      /* ── 하단 네비게이션 블러 ── */
      .reading-guide-active .bottom-nav { filter: blur(3px); opacity: .28; }

      /* ── 타이머 화면 블러 ── */
      #screen-timer.reading-active .demo-tab:not(.reading-focused),
      #screen-timer.reading-active .session-badge:not(.reading-focused),
      #screen-timer.reading-active .timer-ring-wrap:not(.reading-focused),
      #screen-timer.reading-active .main-btn:not(.reading-focused),
      #screen-timer.reading-active .secondary-btn:not(.reading-focused),
      #screen-timer.reading-active .session-dots { filter: blur(3px); opacity: .28; }

      /* ── 체크리스트 화면 블러 ── */
      #screen-checklist.reading-active .screen-header,
      #screen-checklist.reading-active .chip:not(.reading-focused),
      #screen-checklist.reading-active .check-item:not(.reading-focused),
      #screen-checklist.reading-active .add-task-btn:not(.reading-focused),
      #screen-checklist.reading-active .add-task-input-wrap { filter: blur(3px); opacity: .28; }

      /* ── 설정 화면 블러 ── */
      #screen-settings.reading-active .screen-header,
      #screen-settings.reading-active .section-label:not(.reading-focused),
      #screen-settings.reading-active .setting-row:not(.reading-focused),
      #screen-settings.reading-active .time-btn:not(.reading-focused),
      #screen-settings.reading-active .sound-option:not(.reading-focused),
      #screen-settings.reading-active .slider-row:not(:has(.reading-focused)),
      #screen-settings.reading-active .color-row:not(.reading-focused) { filter: blur(3px); opacity: .28; }

      /* ── 범용 모달 블러 ── */
      .modal-overlay.modal-reading-active .main-btn:not(.reading-focused),
      .modal-overlay.modal-reading-active .secondary-btn:not(.reading-focused),
      .modal-overlay.modal-reading-active .modal-title:not(.reading-focused),
      .modal-overlay.modal-reading-active .modal-body:not(.reading-focused),
      .modal-overlay.modal-reading-active .sound-option:not(.reading-focused),
      .modal-overlay.modal-reading-active .modal-handle,
      .modal-overlay.modal-reading-active .modal-icon-wrap { filter: blur(3px); opacity: .28; }

      /* ── 포커스 요소 강조 ── */
      .reading-focused {
        filter: none !important;
        opacity: 1 !important;
        position: relative;
        z-index: 2;
      }

      /* ── 인터랙티브 요소: 미세 scale ── */
      .check-item.reading-focused, .chip.reading-focused, .add-task-btn.reading-focused,
      .demo-tab.reading-focused, .main-btn.reading-focused, .secondary-btn.reading-focused,
      .session-badge.reading-focused, .setting-row.reading-focused, .time-btn.reading-focused,
      .sound-option.reading-focused, .color-row.reading-focused {
        transform: scale(1.018) !important;
      }

      /* ── 한글 텍스트 1.2× ── */
      .check-item.reading-focused .check-text {
        font-size: calc(16px * var(--font-scale) * 1.2) !important;
      }
      /* time-btn: 한글 레이블만 확대, 숫자(val/unit)는 원래 크기 유지 */
      .time-btn.reading-focused .time-btn-label {
        font-size: calc(13px * var(--font-scale) * 1.2) !important;
      }
      .time-btn.reading-focused .time-btn-val {
        font-size: calc(30px * var(--font-scale)) !important;
      }
      .time-btn.reading-focused .time-btn-unit {
        font-size: calc(14px * var(--font-scale)) !important;
      }
      .setting-row.reading-focused .setting-name {
        font-size: calc(16px * var(--font-scale) * 1.2) !important;
      }
      .setting-row.reading-focused .setting-desc,
      .setting-row.reading-focused .setting-pick-row {
        font-size: calc(13px * var(--font-scale) * 1.2) !important;
      }
      .sound-option.reading-focused .sound-name {
        font-size: calc(16px * var(--font-scale) * 1.2) !important;
      }
      .chip.reading-focused { font-size: calc(13px * var(--font-scale) * 1.2) !important; }
      .demo-tab.reading-focused { font-size: calc(14px * var(--font-scale) * 1.2) !important; }
      .add-task-btn.reading-focused { font-size: calc(15px * var(--font-scale) * 1.2) !important; }
      .session-badge.reading-focused { font-size: calc(14px * var(--font-scale) * 1.2) !important; }
      /* 버튼: 텍스트 1.2×, 아이콘은 원래 크기 유지 */
      .main-btn.reading-focused {
        font-size: calc(17px * var(--font-scale) * 1.2) !important;
      }
      .main-btn.reading-focused i,
      .main-btn.reading-focused [class*="fa-"] {
        font-size: calc(17px * var(--font-scale)) !important;
      }
      .secondary-btn.reading-focused {
        font-size: calc(15px * var(--font-scale) * 1.2) !important;
      }
      .secondary-btn.reading-focused i,
      .secondary-btn.reading-focused [class*="fa-"] {
        font-size: calc(15px * var(--font-scale)) !important;
      }

      /* ── 순수 텍스트 블록 1.2× (transform 없음) ── */
      .modal-title.reading-focused {
        font-size: calc(22px * var(--font-scale) * 1.2) !important;
        transform: none !important;
      }
      .modal-body.reading-focused {
        font-size: calc(16px * var(--font-scale) * 1.2) !important;
        transform: none !important;
      }
      .session-label.reading-focused {
        font-size: calc(15px * var(--font-scale) * 1.2) !important;
        transform: none !important;
      }
      /* 섹션 레이블 (세션 / 배경 / 글자) */
      .section-label.reading-focused {
        font-size: calc(12px * var(--font-scale) * 1.2) !important;
        transform: none !important;
      }
      /* 슬라이더 텍스트 레이블 (자간 / 단어 간격 / 글자 크기) — 슬라이더 본체는 원래 크기 유지 */
      .slider-label.reading-focused {
        font-size: calc(15px * var(--font-scale) * 1.2) !important;
        transform: none !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ── 초기화 ───────────────────────────────────────────────────
  function init() {
    _injectStyles();
    document.addEventListener('click', _onCapture, true);

    // 화면 전환 시 비활성 화면의 포커스 자동 해제
    document.querySelectorAll('.screen').forEach(screen => {
      new MutationObserver(() => {
        if (!focused || screen.classList.contains('active')) return;
        if (focused.closest('.screen') === screen) clearFocus();
      }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    });

    // 모달 닫힐 때 포커스 자동 해제
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      new MutationObserver(() => {
        if (!focused || modal.classList.contains('show')) return;
        if (focused.closest('.modal-overlay') === modal) clearFocus();
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
  }

  init();

  window.ReadingGuide = {
    clearFocus,
    clearModalFocus: clearFocus,   // 하위 호환 (closeAlarmSheet에서 호출)
    reapplyFocus,
    isEnabled: () => focused !== null,
  };
})();
