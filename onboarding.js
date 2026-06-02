(function () {
  'use strict';

  const KEY = 'onboardingShown_v1';
  if (localStorage.getItem(KEY)) return;

  function init() {
    const style = document.createElement('style');
    style.textContent = `
      #onboarding-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: #FDE4E4;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        animation: ob-in .4s ease;
        padding: env(safe-area-inset-top, 0)
                 env(safe-area-inset-right, 0)
                 env(safe-area-inset-bottom, 0)
                 env(safe-area-inset-left, 0);
        box-sizing: border-box;
      }
      #onboarding-overlay.ob-out {
        animation: ob-out .3s ease forwards;
        pointer-events: none;
      }
      #onboarding-overlay img {
        width: 100%;
        height: 100vh;
        height: 100dvh;
        object-fit: contain;
        display: block;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
        -webkit-touch-callout: none;
        draggable: false;
      }
      @keyframes ob-in  { from { opacity: 0; } to   { opacity: 1; } }
      @keyframes ob-out { from { opacity: 1; } to   { opacity: 0; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';

    const img = document.createElement('img');
    img.src = 'onboarding.png';
    img.alt = '읽기 가이드 사용법 — 두 번 탭하면 항목이 선명하게 표시됩니다';
    img.draggable = false;

    overlay.appendChild(img);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', dismiss);

    function dismiss() {
      overlay.removeEventListener('click', dismiss);
      overlay.classList.add('ob-out');
      localStorage.setItem(KEY, '1');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
