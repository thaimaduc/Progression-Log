/* ============================================================
   DATA MODEL  — the correct spine, kept.

     habits  -> [ {id, name} ]
     entries -> [ {id, habitId, action, trigger, time} ]

   Entries hold habitId (a POINTER), never the habit's name. Rename a
   habit -> name changes in ONE place -> every entry still resolves.
   Counts are DERIVED from entries at draw time. No stored counts.
   ============================================================ */

let habits   = JSON.parse(localStorage.getItem('habits')   || '[]');
let entries  = JSON.parse(localStorage.getItem('entries') || '[]');
let activeId = localStorage.getItem('activeId') || null;

let lastEntryId = null;   // the entry undo can remove
let pending     = null;   // entry waiting on an optional trigger / auto-commit
let modalMode    = null;   // 'add' or 'rename' — the modal is shared

function save() {
  localStorage.setItem('habits',   JSON.stringify(habits));
  localStorage.setItem('entries',  JSON.stringify(entries));
  localStorage.setItem('activeId', activeId || '');
}
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function activeHabit() { return habits.find(h => h.id === activeId) || null; }

/* ---------- habit chips ---------- */
function renderHabits() {
  const box = document.getElementById('habits');
  box.innerHTML = '';

  habits.forEach(h => {
    const chip = document.createElement('button');
    chip.className = 'habit-chip' + (h.id === activeId ? ' selected' : '');
    chip.textContent = h.name;
    // Tap a non-active chip = switch to it.
    // Tap the ALREADY-active chip = rename it (via modal).
    chip.onclick = () => {
      if (h.id === activeId) openModal('rename');
      else { activeId = h.id; save(); renderAll(); }
    };
    box.appendChild(chip);
  });

  const add = document.createElement('button');
  add.className = 'habit-chip add';
  add.textContent = '+ new';
  add.onclick = () => openModal('add');
  box.appendChild(add);

  // buttons only work once a habit is active
  const ready = activeHabit() !== null;
  document.getElementById('passBtn').disabled = !ready;
  document.getElementById('gaveBtn').disabled = !ready;
  document.getElementById('noHabitHint').style.display = habits.length === 0 ? 'block' : 'none';
}

/* ---------- modal: shared by add + rename ---------- */
function openModal(mode) {
  modalMode = mode;
  const input = document.getElementById('habitInput');
  if (mode === 'rename') {
    document.getElementById('modalTitle').textContent = 'Rename urge';
    document.getElementById('modalSub').textContent   = 'Past entries stay attached — they point to this by id, not name.';
    input.value = activeHabit() ? activeHabit().name : '';
  } else {
    document.getElementById('modalTitle').textContent = 'Name this urge';
    document.getElementById('modalSub').textContent   = "Keep it simple — you'll tap it next time.";
    input.value = '';
  }
  document.getElementById('modalOverlay').classList.add('visible');
  setTimeout(() => input.focus(), 50);
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('visible');
  modalMode = null;
}
function confirmModal() {
  const name = document.getElementById('habitInput').value.trim();
  if (!name) return;

  if (modalMode === 'rename') {
    const h = activeHabit();
    if (h) h.name = name;          // ONLY the name changes; ids/entries untouched
  } else {
    const h = { id: makeId(), name: name };
    habits.push(h);
    activeId = h.id;               // jump to the new habit
  }
  save();
  closeModal();
  renderAll();
}

/* ---------- logging ---------- */
function logEntry(action) {
  const h = activeHabit();
  if (!h) return;

  // build the entry now, but hold it as "pending" so a trigger chip can
  // attach before it's committed. Auto-commits after 8s if untouched.
  pending = { id: makeId(), habitId: h.id, action: action, trigger: null, time: Date.now() };

  document.getElementById('triggers').classList.add('visible');
  clearTimeout(window._commitTimer);
  window._commitTimer = setTimeout(commit, 8000);
}
function setTrigger(word) {
  if (!pending) return;
  pending.trigger = word;
  commit();
}
function commit() {
  clearTimeout(window._commitTimer);
  if (!pending) return;

  entries.push(pending);
  lastEntryId = pending.id;       // this is what undo targets
  pending = null;
  save();

  document.getElementById('triggers').classList.remove('visible');
  renderAll();
  toast(true);                    // show with undo
}

/* Undo: removes ONLY the just-logged entry, and cancels a pending
   auto-commit if one is mid-flight. Narrow on purpose — not a delete tool. */
function undoLast() {
  clearTimeout(window._commitTimer);
  if (pending) {                  // logged but not yet committed
    pending = null;
    document.getElementById('triggers').classList.remove('visible');
  } else if (lastEntryId) {       // already committed a moment ago
    entries = entries.filter(e => e.id !== lastEntryId);
    lastEntryId = null;
    save();
  }
  document.getElementById('toast').classList.remove('show');
  renderAll();
}

/* ---------- tally: ACTIVE habit only, derived from entries ---------- */
function renderTally() {
  const h = activeHabit();
  const body = document.getElementById('tallyBody');
  document.getElementById('tallyHeader').textContent =
    h ? 'This week · ' + h.name : 'This week';

  if (!h) { body.innerHTML = '<div class="tally-empty">Add an urge to begin</div>'; return; }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const mine = entries.filter(e => e.habitId === h.id && e.time >= weekAgo);
  const pass = mine.filter(e => e.action === 'pass').length;
  const gave = mine.filter(e => e.action === 'gave').length;

  body.innerHTML =
    '<div class="tally-nums">' +
      '<div><div class="tally-num">' + pass + '</div><div class="tally-cap">let it pass</div></div>' +
      '<div><div class="tally-num">' + gave + '</div><div class="tally-cap">gave in</div></div>' +
    '</div>';
}

/* ---------- entries: active habit only ---------- */
function renderEntries() {
  const box = document.getElementById('entries');
  const h = activeHabit();
  if (!h) { box.innerHTML = ''; return; }

  const mine = entries.filter(e => e.habitId === h.id).slice().reverse().slice(0, 10);
  if (mine.length === 0) {
    box.innerHTML = '<div class="tally-empty" style="padding:20px 2px;">Nothing logged yet for this one — this is just a place to notice.</div>';
    return;
  }
  box.innerHTML = mine.map(e => {
    const t = new Date(e.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const label = e.action === 'pass' ? 'Let it pass' : 'Gave in';
    // dot is the same calm tone for both actions on purpose (no grading)
    return '<div class="entry">' +
             '<span class="dot"></span>' +
             '<span class="what">' + label + '</span>' +
             '<span class="trig">' + (e.trigger || '') + '</span>' +
             '<span class="time">' + t + '</span>' +
           '</div>';
  }).join('');
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast() {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = 'logged';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 8000);  // long enough to catch a misfire
}

/* ---------- boot ---------- */
function renderAll() { renderHabits(); renderTally(); renderEntries(); }

document.getElementById('date').textContent =
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

// if activeId is stale (points to nothing), fall back to first habit
if (!activeHabit() && habits.length) { activeId = habits[0].id; save(); }

renderAll();

// modal keyboard niceties
document.getElementById('habitInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmModal();
  if (e.key === 'Escape') closeModal();
});
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});
