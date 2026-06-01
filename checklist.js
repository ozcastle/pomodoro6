 // ============================================================
  // TASK MANAGER
  // ============================================================
  const TaskManager = (function () {
    'use strict';

    const STORAGE_KEY = 'tasks_v1';
    const DEFAULT_TASKS = [
      { id: 't1', text: '리서치 정리', done: false },
      { id: 't2', text: '보고서 개요', done: false },
      { id: 't3', text: '이메일 답장', done: false },
      { id: 't4', text: '회의 노트',   done: true  },
      { id: 't5', text: '오전 루틴',   done: true  },
    ];

    let tasks     = [];
    let filter    = 'all';
    let _seq      = 0;
    let _targetId    = null;
    let _pressTimer  = null;
    let _pressEl     = null;
    let _pressStartX = 0;
    let _pressStartY = 0;
    let _longPressFired = false;

    function _genId() { return 'task_' + Date.now() + '_' + (++_seq); }

    function _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) { tasks = JSON.parse(raw); return; }
      } catch (_) {}
      tasks = DEFAULT_TASKS.map(t => Object.assign({}, t));
    }

    function _persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (_) {}
    }

    function _updateCounts() {
      const total   = tasks.length;
      const done    = tasks.filter(t => t.done).length;
      const pending = total - done;
      const elAll     = document.getElementById('count-all');
      const elDone    = document.getElementById('count-done');
      const elPending = document.getElementById('count-pending');
      if (elAll)     elAll.textContent     = total;
      if (elDone)    elDone.textContent    = done;
      if (elPending) elPending.textContent = pending;
      ['all', 'done', 'pending'].forEach(f => {
        const chip = document.getElementById('chip-' + f);
        if (chip) chip.classList.toggle('active', f === filter);
      });
    }

    function render() {
      const wrap = document.getElementById('checklistWrap');
      if (!wrap) return;

      const filtered = tasks.filter(t => {
        if (filter === 'done')    return t.done;
        if (filter === 'pending') return !t.done;
        return true;
      });

      wrap.innerHTML = '';

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'checklist-empty';
        empty.textContent = filter === 'done'    ? '완료한 작업이 없어요' :
                            filter === 'pending' ? '남은 작업이 없어요'   :
                                                   '작업을 추가해보세요';
        wrap.appendChild(empty);
      } else {
        filtered.forEach(t => {
          const item = document.createElement('div');
          item.className = 'check-item' + (t.done ? ' done-task' : '');
          item.dataset.id = t.id;

          const box = document.createElement('div');
          box.className = 'check-box' + (t.done ? ' checked' : '');
          box.innerHTML = '<i class="fa fa-check"></i>';

          const text = document.createElement('div');
          text.className = 'check-text';
          text.textContent = t.text;

          item.appendChild(box);
          item.appendChild(text);

          item.addEventListener('click', () => {
            if (_longPressFired) { _longPressFired = false; return; }
            _toggleTask(t.id);
          });
          item.addEventListener('contextmenu', e => e.preventDefault());

          item.addEventListener('pointerdown',   e  => _startPress(e, t.id, item));
          item.addEventListener('pointermove',   _cancelPress);
          item.addEventListener('pointerup',     _cancelPress);
          item.addEventListener('pointercancel', _cancelPress);

          wrap.appendChild(item);
        });
      }

      _updateCounts();

      if (typeof updateSessionBadge === 'function') updateSessionBadge();

      if (window.ReadingGuide && window.ReadingGuide.isEnabled()) {
        window.ReadingGuide.reapplyFocus();
      }
    }

    function getTopUnchecked() {
      const unchecked = tasks.filter(t => !t.done);
      return unchecked.length > 0 ? unchecked[0].text : null;
    }

    function setFilter(f) { filter = f; render(); }

    function _toggleTask(id) {
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      t.done = !t.done;
      _persist();
      render();
    }

    // ── 작업 추가 ─────────────────────────────────────────────
    function openAdd() {
      const wrap  = document.getElementById('addTaskWrap');
      const btn   = document.getElementById('addTaskBtn');
      const input = document.getElementById('addTaskInput');
      if (wrap)  wrap.classList.add('open');
      if (btn)   btn.style.display = 'none';
      if (input) { input.value = ''; input.focus(); }
    }

    function cancelAdd() {
      const wrap = document.getElementById('addTaskWrap');
      const btn  = document.getElementById('addTaskBtn');
      if (wrap) wrap.classList.remove('open');
      if (btn)  btn.style.display = '';
    }

    function confirmAdd() {
      const input = document.getElementById('addTaskInput');
      const text  = (input ? input.value : '').trim();
      if (!text) { cancelAdd(); return; }
      tasks.push({ id: _genId(), text, done: false });
      _persist();
      cancelAdd();
      if (filter === 'done') setFilter('all'); else render();
    }

    // ── 롱 프레스 (1.5초) ────────────────────────────────────
    function _startPress(e, id, el) {
      _cancelPress();
      _pressStartX = e.clientX;
      _pressStartY = e.clientY;
      _pressEl = el;
      el.classList.add('long-pressing');
      _pressTimer = setTimeout(() => {
        _targetId = id;
        _pressEl  = null;
        _longPressFired = true;
        el.classList.remove('long-pressing');
        _openActionModal();
      }, 1500);
    }

    function _cancelPress(e) {
      if (e && e.type === 'pointermove') {
        const dx = e.clientX - _pressStartX;
        const dy = e.clientY - _pressStartY;
        if (Math.sqrt(dx * dx + dy * dy) < 10) return;
      }
      if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
      if (_pressEl)    { _pressEl.classList.remove('long-pressing'); _pressEl = null; }
    }

    // ── 액션 모달 (수정 / 삭제) ───────────────────────────────
    function _openActionModal() {
      const t     = tasks.find(t => t.id === _targetId);
      const title = document.getElementById('taskActionTitle');
      if (title && t) title.textContent = t.text;
      const m = document.getElementById('modal-task-action');
      if (m) m.classList.add('show');
    }

    function closeActionModal() {
      const m = document.getElementById('modal-task-action');
      if (m) m.classList.remove('show');
      _targetId = null;
    }

    // ── 수정 ─────────────────────────────────────────────────
    function openEdit() {
      const t = tasks.find(t => t.id === _targetId);
      if (!t) return;
      // 액션 모달만 닫기 — _targetId는 saveEdit에서 필요하므로 유지
      const actionModal = document.getElementById('modal-task-action');
      if (actionModal) actionModal.classList.remove('show');
      const input = document.getElementById('taskEditInput');
      if (input) input.value = t.text;
      const m = document.getElementById('modal-task-edit');
      if (m) m.classList.add('show');
      if (input) setTimeout(() => input.focus(), 80);
    }

    function saveEdit() {
      const input = document.getElementById('taskEditInput');
      const text  = (input ? input.value : '').trim();
      if (!text) { closeEditModal(); return; }
      const t = tasks.find(t => t.id === _targetId);
      if (t) { t.text = text; _persist(); }
      _targetId = null;
      closeEditModal();
      render();
    }

    function closeEditModal() {
      const m = document.getElementById('modal-task-edit');
      if (m) m.classList.remove('show');
    }

    // ── 삭제 ─────────────────────────────────────────────────
    function deleteTask() {
      tasks = tasks.filter(t => t.id !== _targetId);
      _persist();
      closeActionModal();
      render();
    }

    function init() { _load(); render(); }

    return {
      init,
      render,
      setFilter,
      openAdd,
      cancelAdd,
      confirmAdd,
      openEdit,
      saveEdit,
      closeEditModal,
      closeActionModal,
      deleteTask,
      getTopUnchecked,
    };
  })();

  window.addEventListener('DOMContentLoaded', () => TaskManager.init());