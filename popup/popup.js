let timerInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  await refreshAll();
  setupTabs();
  setupLogTab();
  setupTimerTab();
  setupTopicsTab();
});

async function refreshAll() {
  const stats = await DataManager.getStats();

  // Header
  document.getElementById("curStreak").textContent  = stats.streak.current;
  document.getElementById("bestStreak").textContent = stats.streak.longest;
  document.getElementById("todayH").textContent     = stats.daily.hours.toFixed(1) + "h";
  document.getElementById("weekH").textContent      = stats.weekly.hours.toFixed(1) + "h";
  document.getElementById("monthH").textContent     = stats.monthly.hours.toFixed(1) + "h";

  // Daily bar
  const pct = Math.min((stats.daily.hours / stats.goals.daily) * 100, 100);
  document.getElementById("dpBar").style.width = pct + "%";
  document.getElementById("dpPct").textContent = pct.toFixed(0) + "%";

  // Populate subject dropdowns
  populateSubjectDropdowns(stats.subjects);

  // Timer recovery
  if (stats.activeTimer) {
    resumeTimerUI(stats.activeTimer, stats.subjects);
  }
}

function populateSubjectDropdowns(subjects) {
  ["logSubject", "timerSubject", "topicSubject"].forEach(id => {
    const sel = document.getElementById(id);
    const val = sel.value;
    sel.innerHTML = `<option value="">— Select —</option>`;
    subjects.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if (val) sel.value = val;
  });
}

// ── Tabs ──────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
      if (btn.dataset.tab === "topics") renderTopicsPane();
    });
  });
}

// ── Log Tab ───────────────────────────────────────────────────
function setupLogTab() {
  document.getElementById("saveLogBtn").addEventListener("click", async () => {
    const subjectId = document.getElementById("logSubject").value;
    const hours     = parseFloat(document.getElementById("logHours").value);
    const note      = document.getElementById("logNote").value.trim();

    if (!subjectId) { showMsg("logMsg", "Please select a subject.", "error"); return; }
    if (!hours || hours <= 0) { showMsg("logMsg", "Enter valid hours.", "error"); return; }

    await DataManager.logSession(subjectId, hours, note);
    showMsg("logMsg", "Session saved! 🎉", "success");
    document.getElementById("logHours").value = "";
    document.getElementById("logNote").value  = "";
    await refreshAll();
  });
}

// ── Timer Tab ─────────────────────────────────────────────────
function setupTimerTab() {
  document.getElementById("startTimerBtn").addEventListener("click", async () => {
    const subjectId = document.getElementById("timerSubject").value;
    if (!subjectId) { showMsg("timerMsg", "Select a subject first.", "error"); return; }

    await DataManager.startTimer(subjectId);
    const stats = await DataManager.getStats();
    resumeTimerUI(stats.activeTimer, stats.subjects);
  });

  document.getElementById("stopTimerBtn").addEventListener("click", async () => {
    clearInterval(timerInterval);
    timerInterval = null;
    const result = await DataManager.stopTimer();
    document.getElementById("startTimerBtn").classList.remove("hidden");
    document.getElementById("stopTimerBtn").classList.add("hidden");
    document.getElementById("timerDisplay").textContent = "00:00:00";
    document.getElementById("timerSub").textContent = "No active session";
    document.getElementById("timerSubject").disabled = false;
    if (result) {
      showMsg("timerMsg", `Saved ${result.hours.toFixed(2)}h ✓`, "success");
      await refreshAll();
    }
  });
}

function resumeTimerUI(activeTimer, subjects) {
  if (!activeTimer) return;
  const sub = subjects.find(s => s.id === activeTimer.subjectId);
  document.getElementById("startTimerBtn").classList.add("hidden");
  document.getElementById("stopTimerBtn").classList.remove("hidden");
  document.getElementById("timerSubject").value    = activeTimer.subjectId;
  document.getElementById("timerSubject").disabled = true;
  document.getElementById("timerSub").textContent  = sub ? `Studying: ${sub.name}` : "Active session";

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - activeTimer.startTime;
    document.getElementById("timerDisplay").textContent = formatElapsed(elapsed);
  }, 1000);
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, "0")).join(":");
}

// ── Topics Tab ────────────────────────────────────────────────
function setupTopicsTab() {
  document.getElementById("topicSubject").addEventListener("change", renderTopicsPane);
}

async function renderTopicsPane() {
  const subjectId = document.getElementById("topicSubject").value;
  const list = document.getElementById("topicsList");
  list.innerHTML = "";

  if (!subjectId) {
    list.innerHTML = `<div class="topics-empty">Select a subject to see topics.</div>`;
    return;
  }

  const data = await DataManager.getData();
  const sub  = data.subjects.find(s => s.id === subjectId);
  if (!sub || sub.topics.length === 0) {
    list.innerHTML = `<div class="topics-empty">No topics yet — add them in the Dashboard.</div>`;
    return;
  }

  sub.topics.forEach(topic => {
    const row = document.createElement("div");
    row.className = "topic-row" + (topic.done ? " done" : "");
    row.style.setProperty("--c", sub.color || "#6366f1");
    row.innerHTML = `
      <div class="topic-check">
        <span class="topic-check-inner">✓</span>
      </div>
      <span class="topic-name">${topic.name}</span>
    `;
    row.addEventListener("click", async () => {
      await DataManager.markTopicDone(subjectId, topic.id, !topic.done);
      await renderTopicsPane();
    });
    list.appendChild(row);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `msg ${type}`;
  setTimeout(() => { el.className = "msg hidden"; }, 3000);
}