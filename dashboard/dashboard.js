document.addEventListener("DOMContentLoaded", async () => {
  await loadAll();
  setupNav();
  setupSubjectModal();
  setupAddTopicModal();
  setupGoals();
  setupClear();
});

async function loadAll() {
  const stats = await DataManager.getStats();
  renderOverview(stats);
  renderSubjects(stats);
  renderTopicLog(stats);
  prefillGoals(stats);
}

// ── Navigation ────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(t => {
        t.classList.remove("active");
        t.classList.add("hidden");
      });
      link.classList.add("active");
      const tab = document.getElementById("tab-" + link.dataset.tab);
      tab.classList.remove("hidden");
      tab.classList.add("active");
    });
  });
}

// ── Overview ──────────────────────────────────────────────────
function renderOverview(stats) {
  document.getElementById("ov-streak").textContent = stats.streak.current;
  document.getElementById("ov-best").textContent   = stats.streak.longest;
  document.getElementById("ov-total").textContent  = stats.semester.hours.toFixed(1) + "h";
  document.getElementById("ov-topics").textContent = stats.topicLog.length;

  setBar("daily",    stats.daily.hours,    stats.goals.daily);
  setBar("weekly",   stats.weekly.hours,   stats.goals.weekly);
  setBar("monthly",  stats.monthly.hours,  stats.goals.monthly);
  setBar("semester", stats.semester.hours, stats.goals.semester);
}

function setBar(id, cur, goal) {
  const pct = Math.min((cur / goal) * 100, 100);
  document.getElementById("fill-" + id).style.width = pct + "%";
  document.getElementById("pct-"  + id).textContent = pct.toFixed(1) + "%";
  document.getElementById("lbl-"  + id).textContent = `${cur.toFixed(1)} / ${goal}h`;
}

// ── Subjects ──────────────────────────────────────────────────
function renderSubjects(stats) {
  const container = document.getElementById("subjectCards");
  container.innerHTML = "";

  if (stats.subjects.length === 0) {
    container.innerHTML = `<p style="color:#4b5563;font-size:14px;">No subjects yet. Click "+ Add Subject" to get started.</p>`;
    return;
  }

  stats.subjects.forEach(sub => {
    const hours = stats.subjectHours[sub.id] || 0;
    const topicsDone  = sub.topics.filter(t => t.done).length;
    const topicsTotal = sub.topics.length;
    const topicPct    = topicsTotal ? (topicsDone / topicsTotal) * 100 : 0;
    const hourPct     = sub.targetHours ? Math.min((hours / sub.targetHours) * 100, 100) : 0;

    // Deadline info
    let deadlineHtml = "";
    if (sub.deadlineDays) {
      const created  = new Date(sub.createdAt);
      const deadline = new Date(created);
      deadline.setDate(deadline.getDate() + sub.deadlineDays);
      const daysLeft = Math.ceil((deadline - new Date()) / 86400000);
      const urgency  = daysLeft <= 3 ? "color:#f87171" : daysLeft <= 7 ? "color:#fbbf24" : "color:#6b7280";
      deadlineHtml = `<span class="meta-chip" style="${urgency}">📅 ${daysLeft > 0 ? daysLeft + "d left" : "Overdue"}</span>`;
    }

    const card = document.createElement("div");
    card.className = "subject-card";
    card.innerHTML = `
      <div class="subject-card-header">
        <div class="subject-card-top">
          <div class="subject-title-row">
            <div class="subject-dot" style="background:${sub.color}"></div>
            <span class="subject-name">${sub.name}</span>
          </div>
          <div class="subject-actions">
            <button class="icon-btn" title="Edit" data-edit="${sub.id}">✏️</button>
            <button class="icon-btn" title="Delete" data-del="${sub.id}">🗑️</button>
          </div>
        </div>
        <div class="subject-meta">
          <span class="meta-chip">⏱ ${hours.toFixed(1)}h${sub.targetHours ? " / " + sub.targetHours + "h" : ""}</span>
          <span class="meta-chip">✅ ${topicsDone}/${topicsTotal} topics</span>
          ${deadlineHtml}
        </div>
      </div>

      ${sub.targetHours ? `
      <div class="subject-progress">
        <div class="sp-label"><span>Hours Progress</span><span>${hourPct.toFixed(0)}%</span></div>
        <div class="sp-track">
          <div class="sp-fill" style="width:${hourPct}%;background:${sub.color}"></div>
        </div>
      </div>` : ""}

      <div class="subject-topics">
        <div class="topics-header">
          <span class="topics-header-lbl">Topics (${topicsDone}/${topicsTotal})</span>
          <button class="add-topic-btn" data-addtopic="${sub.id}">+ Add Topic</button>
        </div>
        <div class="topics-inner">
          ${sub.topics.length === 0
            ? `<div class="no-topics">No topics added yet.</div>`
            : sub.topics.map(t => `
              <div class="topic-item ${t.done ? "done" : ""}" 
                   style="--tc:${sub.color}"
                   data-marktopic="${sub.id}" data-topicid="${t.id}" data-done="${t.done}">
                <div class="topic-checkbox"><span class="tc-check">✓</span></div>
                <span class="topic-item-name">${t.name}</span>
              </div>`).join("")
          }
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Bind topic toggle
  document.querySelectorAll("[data-marktopic]").forEach(el => {
    el.addEventListener("click", async () => {
      const subId   = el.dataset.marktopic;
      const topicId = el.dataset.topicid;
      const isDone  = el.dataset.done === "true";
      await DataManager.markTopicDone(subId, topicId, !isDone);
      await loadAll();
    });
  });

  // Bind edit
  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditSubject(btn.dataset.edit, stats.subjects));
  });

  // Bind delete
  document.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this subject and all its topics?")) {
        await DataManager.deleteSubject(btn.dataset.del);
        await loadAll();
      }
    });
  });

  // Bind add-topic
  document.querySelectorAll("[data-addtopic]").forEach(btn => {
    btn.addEventListener("click", () => openAddTopicModal(btn.dataset.addtopic));
  });
}

// ── Subject Modal ─────────────────────────────────────────────
function setupSubjectModal() {
  document.getElementById("openAddSubject").addEventListener("click", () => {
    document.getElementById("modalTitle").textContent = "Add Subject";
    document.getElementById("editSubjectId").value = "";
    document.getElementById("sName").value         = "";
    document.getElementById("sColor").value        = "#6366f1";
    document.getElementById("sTargetHours").value  = "";
    document.getElementById("sDeadlineDays").value = "";
    document.getElementById("sTopics").value       = "";
    document.getElementById("subjectModal").classList.remove("hidden");
  });

  document.getElementById("cancelSubject").addEventListener("click", () => {
    document.getElementById("subjectModal").classList.add("hidden");
  });

  document.getElementById("saveSubjectBtn").addEventListener("click", async () => {
    const name         = document.getElementById("sName").value.trim();
    const color        = document.getElementById("sColor").value;
    const targetHours  = document.getElementById("sTargetHours").value;
    const deadlineDays = document.getElementById("sDeadlineDays").value;
    const topicsRaw    = document.getElementById("sTopics").value;
    const editId       = document.getElementById("editSubjectId").value;

    if (!name) { alert("Subject name is required."); return; }

    const topics = topicsRaw.split("\n").map(t => t.trim()).filter(Boolean);

    if (editId) {
      // Update existing — only update fields, not topics (topics managed separately)
      await DataManager.updateSubject(editId, { name, color, targetHours: parseFloat(targetHours)||0, deadlineDays: parseInt(deadlineDays)||0 });
    } else {
      await DataManager.addSubject({ name, color, targetHours, deadlineDays, topics });
    }

    document.getElementById("subjectModal").classList.add("hidden");
    await loadAll();
  });
}

function openEditSubject(id, subjects) {
  const sub = subjects.find(s => s.id === id);
  if (!sub) return;
  document.getElementById("modalTitle").textContent  = "Edit Subject";
  document.getElementById("editSubjectId").value     = sub.id;
  document.getElementById("sName").value             = sub.name;
  document.getElementById("sColor").value            = sub.color;
  document.getElementById("sTargetHours").value      = sub.targetHours || "";
  document.getElementById("sDeadlineDays").value     = sub.deadlineDays || "";
  document.getElementById("sTopics").value           = ""; // topics edited in-place on card
  document.getElementById("subjectModal").classList.remove("hidden");
}

// ── Add Topic Modal ───────────────────────────────────────────
function setupAddTopicModal() {
  document.getElementById("cancelAddTopic").addEventListener("click", () => {
    document.getElementById("addTopicModal").classList.add("hidden");
  });

  document.getElementById("saveTopicBtn").addEventListener("click", async () => {
    const subId = document.getElementById("addTopicSubjectId").value;
    const name  = document.getElementById("newTopicName").value.trim();
    if (!name) { alert("Topic name required."); return; }
    await DataManager.addTopicToSubject(subId, name);
    document.getElementById("addTopicModal").classList.add("hidden");
    document.getElementById("newTopicName").value = "";
    await loadAll();
  });
}

function openAddTopicModal(subjectId) {
  document.getElementById("addTopicSubjectId").value = subjectId;
  document.getElementById("newTopicName").value = "";
  document.getElementById("addTopicModal").classList.remove("hidden");
}

// ── Topic Log ─────────────────────────────────────────────────
function renderTopicLog(stats) {
  const tbody = document.getElementById("topicLogBody");
  tbody.innerHTML = "";

  if (stats.topicLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#4b5563;padding:24px;">No topics completed yet.</td></tr>`;
    return;
  }

  // Build color map
  const colorMap = {};
  stats.subjects.forEach(s => { colorMap[s.id] = s.color; });

  stats.topicLog.forEach(({ topicName, subjectName, subjectId, completedAt }) => {
    const color = colorMap[subjectId] || "#6366f1";
    const date  = completedAt ? new Date(completedAt).toLocaleDateString() : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${topicName}</td>
      <td><span class="badge" style="background:${color}22;color:${color}">${subjectName || "—"}</span></td>
      <td>${date}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Goals ─────────────────────────────────────────────────────
function prefillGoals(stats) {
  document.getElementById("g-daily").value    = stats.goals.daily;
  document.getElementById("g-weekly").value   = stats.goals.weekly;
  document.getElementById("g-monthly").value  = stats.goals.monthly;
  document.getElementById("g-semester").value = stats.goals.semester;
}

function setupGoals() {
  document.getElementById("saveGoalsBtn").addEventListener("click", async () => {
    await DataManager.updateGoals({
      daily:    parseFloat(document.getElementById("g-daily").value)    || 4,
      weekly:   parseFloat(document.getElementById("g-weekly").value)   || 25,
      monthly:  parseFloat(document.getElementById("g-monthly").value)  || 100,
      semester: parseFloat(document.getElementById("g-semester").value) || 500
    });
    const msg = document.getElementById("goalMsg");
    msg.textContent = "Goals saved! ✓";
    msg.className = "msg success";
    setTimeout(() => msg.className = "msg hidden", 3000);
    await loadAll();
  });
}

// ── Clear ─────────────────────────────────────────────────────
function setupClear() {
  document.getElementById("clearDataBtn").addEventListener("click", async () => {
    if (confirm("Erase ALL data permanently?")) {
      await DataManager.clearAllData();
      await loadAll();
    }
  });
}