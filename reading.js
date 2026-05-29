/**
 * reading.js — 읽기 가이드 (포커스 블러)
 * 활성화 상태에서 체크리스트 항목을 클릭하면
 * 해당 항목만 선명하게 강조되고 나머지 화면은 블러 처리됩니다.
 */
(function () {
  'use strict';

  let enabled   = false;
  let focused   = null;
  let focusedId = null;

  // ── 포커스 핸들링 ────────────────────────────────────────
  function setFocus(item) {
    if (focused === item) {
      clearFocus();
      return;
    }
    if (focused) focused.classList.remove('reading-focused');
    focused   = item;
    focusedId = item.dataset.id || null;
    item.classList.add('reading-focused');
    _setScreenActive(true);
  }

  function clearFocus() {
    if (focused) { focused.classList.remove('reading-focused'); focused = null; }
    focusedId = null;
    _setScreenActive(false);
  }

  // 동적 렌더 후 DOM이 재생성되면 data-id로 포커스 재적용
  function reapplyFocus() {
    if (!focusedId) return;
    const item = document.querySelector('[data-id="' + focusedId + '"]');
    if (item) {
      focused = item;
      item.classList.add('reading-focused');
      _setScreenActive(true);
    } else {
      focused   = null;
      focusedId = null;
      _setScreenActive(false);
    }
  }

  function _setScreenActive(on) {
    const screen = document.getElementById('screen-checklist');
    if (screen) screen.classList.toggle('reading-active', on);
  }

  // ── 기능 켜기/끄기 ────────────────────────────────────────
  function enable() {
    enabled = true;
    _persist();
    _syncUI();
  }

  function disable() {
    enabled = false;
    clearFocus();
    _persist();
    _syncUI();
  }

  function toggle() { enabled ? disable() : enable(); }

  // ── 저장/불러오기 ─────────────────────────────────────────
  function _persist() {
    try { localStorage.setItem('readingGuide', enabled ? '1' : '0'); } catch (_) {}
  }

  // ── UI 동기화 ─────────────────────────────────────────────
  function _syncUI() {
    const sw   = document.getElementById('readingGuideSwitch');
    const desc = document.getElementById('readingGuideDesc');
    const icon = document.getElementById('readingGuideIcon');
    if (sw)   sw.classList.toggle('on', enabled);
    if (desc) desc.textContent = enabled ? '기능 끄기' : '항목을 클릭해 집중해보세요';
    if (icon) {
      icon.style.background = enabled ? 'var(--blue-focus)' : 'var(--blue-pale)';
      icon.style.color      = enabled ? '#fff'              : 'var(--blue-focus)';
    }
  }

  // ── 클릭 인터셉트 (캡처 페이즈 — toggleCheck 이전에 실행) ──
  function _onCapture(e) {
    if (!enabled) return;
    const item = e.target.closest('#screen-checklist .check-item');
    if (item) {
      e.stopPropagation(); // 캡처 페이즈에서 전파 중단 → toggleCheck 차단
      setFocus(item);
    }
  }

  // ── CSS 주입 ──────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('reading-guide-styles')) return;
    const s = document.createElement('style');
    s.id = 'reading-guide-styles';
    s.textContent = `
      /* 기본 전환 (항상 적용) */
      #screen-checklist .screen-header,
      #screen-checklist .progress-chips,
      #screen-checklist .checklist-wrap .check-item,
      #screen-checklist .add-task-btn,
      #screen-checklist .add-task-input-wrap,
      #screen-checklist .reading-guide-wrap {
        transition: filter 0.35s ease, opacity 0.35s ease,
                    transform 0.25s ease, box-shadow 0.25s ease;
      }

      /* reading-active: 헤더·칩 블러 */
      #screen-checklist.reading-active .screen-header,
      #screen-checklist.reading-active .progress-chips {
        filter: blur(3px);
        opacity: 0.28;
      }

      /* reading-active: 포커스 없는 항목 블러 */
      #screen-checklist.reading-active .checklist-wrap .check-item:not(.reading-focused) {
        filter: blur(3px);
        opacity: 0.28;
      }

      /* reading-active: 하단 버튼 살짝 블러 */
      #screen-checklist.reading-active .add-task-btn,
      #screen-checklist.reading-active .add-task-input-wrap,
      #screen-checklist.reading-active .reading-guide-wrap {
        filter: blur(2px);
        opacity: 0.35;
      }

      /* 포커스된 항목 강조 */
      #screen-checklist .check-item.reading-focused {
        filter: none !important;
        opacity: 1 !important;
        border-color: var(--blue-focus) !important;
        background: var(--bg-card) !important;
        box-shadow:
          0 0 0 2.5px rgba(155,111,208,0.55),
          0 8px 28px rgba(155,111,208,0.22) !important;
        transform: scale(1.018) !important;
        position: relative;
        z-index: 2;
      }

      /* 읽기 가이드 토글 버튼 영역 */
      .reading-guide-wrap {
        margin: 14px 24px 0;
      }

      .reading-guide-btn {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
        background: var(--bg-card);
        border: none;
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-card);
        cursor: pointer;
        font-family: var(--current-font);
        text-align: left;
        transition: background 0.2s ease, transform 0.15s ease;
      }
      .reading-guide-btn:active {
        background: var(--btn-secondary);
        transform: scale(0.985);
      }

      .reading-guide-icon-wrap {
        width: 38px; height: 38px;
        border-radius: 11px;
        background: var(--blue-pale);
        color: var(--blue-focus);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        transition: background 0.3s ease, color 0.3s ease;
      }

      .reading-guide-info { flex: 1; text-align: left; }

      .reading-guide-name {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .reading-guide-desc {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 2px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── 초기화 ────────────────────────────────────────────────
  function init() {
    _injectStyles();
    try { enabled = localStorage.getItem('readingGuide') === '1'; } catch (_) {}
    document.addEventListener('click', _onCapture, true);
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', _syncUI);
    } else {
      _syncUI();
    }
  }

  init();

  window.ReadingGuide = {
    toggle,
    enable,
    disable,
    clearFocus,
    reapplyFocus,
    isEnabled: () => enabled,
  };
})();
