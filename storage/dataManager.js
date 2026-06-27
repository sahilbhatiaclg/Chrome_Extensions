const DataManager = {

  defaultData: {
    goals: {
      daily: 4,
      weekly: 25,
      monthly: 100,
      semester: 500
    },
    subjects: [],        // [{ id, name, color, targetHours, deadlineDays, createdAt, topics:[] }]
    studyLog: {},        // { "YYYY-MM-DD": { totalHours, sessions:[{subjectId,hours,note,timestamp}] } }
    topicLog: [],        // [{ subjectId, topicId, topicName, completedAt }]
    streak: {
      current: 0,
      longest: 0,
      lastStudyDate: null
    },
    activeTimer: null    // { subjectId, startTime } — persisted so timer survives popup close
  },

  async getData() {
    return new Promise((resolve) => {
      chrome.storage.local.get("studyTracker", (result) => {
        if (result.studyTracker) {
          const data = result.studyTracker;
          // Ensure all keys exist
          if (!data.subjects)   data.subjects  = [];
          if (!data.studyLog)   data.studyLog  = {};
          if (!data.topicLog)   data.topicLog  = [];
          if (!data.streak)     data.streak    = this.defaultData.streak;
          if (!data.goals)      data.goals     = this.defaultData.goals;
          if (data.activeTimer === undefined) data.activeTimer = null;
          resolve(data);
        } else {
          resolve(JSON.parse(JSON.stringify(this.defaultData)));
        }
      });
    });
  },

  async saveData(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ studyTracker: data }, resolve);
    });
  },

  getTodayKey() {
    return new Date().toISOString().split("T")[0];
  },

  // ─── Subjects ───────────────────────────────────────────────
  async addSubject({ name, color, targetHours, deadlineDays, topics }) {
    const data = await this.getData();
    const subject = {
      id: "sub_" + Date.now(),
      name,
      color: color || "#6366f1",
      targetHours: parseFloat(targetHours) || 0,
      deadlineDays: parseInt(deadlineDays) || 0,
      createdAt: this.getTodayKey(),
      topics: (topics || []).map((t, i) => ({
        id: "t_" + Date.now() + "_" + i,
        name: t,
        done: false,
        completedAt: null
      }))
    };
    data.subjects.push(subject);
    await this.saveData(data);
    return subject;
  },

  async updateSubject(id, updates) {
    const data = await this.getData();
    const idx = data.subjects.findIndex(s => s.id === id);
    if (idx === -1) return;
    data.subjects[idx] = { ...data.subjects[idx], ...updates };
    await this.saveData(data);
  },

  async deleteSubject(id) {
    const data = await this.getData();
    data.subjects = data.subjects.filter(s => s.id !== id);
    await this.saveData(data);
  },

  async addTopicToSubject(subjectId, topicName) {
    const data = await this.getData();
    const sub = data.subjects.find(s => s.id === subjectId);
    if (!sub) return;
    sub.topics.push({
      id: "t_" + Date.now(),
      name: topicName,
      done: false,
      completedAt: null
    });
    await this.saveData(data);
  },

  async markTopicDone(subjectId, topicId, done) {
    const data = await this.getData();
    const sub = data.subjects.find(s => s.id === subjectId);
    if (!sub) return;
    const topic = sub.topics.find(t => t.id === topicId);
    if (!topic) return;
    topic.done = done;
    topic.completedAt = done ? new Date().toISOString() : null;
    if (done) {
      data.topicLog.unshift({
        subjectId,
        topicId,
        topicName: topic.name,
        subjectName: sub.name,
        completedAt: topic.completedAt
      });
    } else {
      data.topicLog = data.topicLog.filter(l => l.topicId !== topicId);
    }
    await this.saveData(data);
  },

  // ─── Study Sessions ──────────────────────────────────────────
  async logSession(subjectId, hours, note) {
    const data = await this.getData();
    const today = this.getTodayKey();

    if (!data.studyLog[today]) {
      data.studyLog[today] = { totalHours: 0, sessions: [] };
    }
    data.studyLog[today].totalHours += hours;
    data.studyLog[today].sessions.push({
      subjectId,
      hours,
      note: note || "",
      timestamp: new Date().toISOString()
    });

    // Update streak
    data.streak = this._calcStreak(data.streak, today);
    await this.saveData(data);
  },

  _calcStreak(streak, today) {
    if (streak.lastStudyDate === today) return streak;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().split("T")[0];
    streak.current = streak.lastStudyDate === yKey ? streak.current + 1 : 1;
    streak.longest = Math.max(streak.longest, streak.current);
    streak.lastStudyDate = today;
    return streak;
  },

  // ─── Timer ───────────────────────────────────────────────────
  async startTimer(subjectId) {
    const data = await this.getData();
    data.activeTimer = { subjectId, startTime: Date.now() };
    await this.saveData(data);
  },

  async stopTimer() {
    const data = await this.getData();
    if (!data.activeTimer) return null;
    const elapsed = (Date.now() - data.activeTimer.startTime) / 3600000; // hours
    const subjectId = data.activeTimer.subjectId;
    data.activeTimer = null;
    await this.saveData(data);
    if (elapsed > 0.01) {
      await this.logSession(subjectId, Math.round(elapsed * 100) / 100, "Timer session");
    }
    return { subjectId, hours: elapsed };
  },

  // ─── Stats ───────────────────────────────────────────────────
  async getStats() {
    const data = await this.getData();
    const today = this.getTodayKey();

    // hours per subject (all time)
    const subjectHours = {};
    Object.values(data.studyLog).forEach(day => {
      (day.sessions || []).forEach(s => {
        subjectHours[s.subjectId] = (subjectHours[s.subjectId] || 0) + s.hours;
      });
    });

    // daily / weekly / monthly totals
    const todayLog = data.studyLog[today] || { totalHours: 0 };
    const weekDates = this._getWeekDates();
    const weeklyHours = weekDates.reduce((s, d) => s + (data.studyLog[d]?.totalHours || 0), 0);
    const monthPrefix = today.slice(0, 7);
    const monthlyHours = Object.keys(data.studyLog)
      .filter(d => d.startsWith(monthPrefix))
      .reduce((s, d) => s + data.studyLog[d].totalHours, 0);
    const semesterHours = Object.values(data.studyLog).reduce((s, d) => s + (d.totalHours || 0), 0);

    return {
      goals: data.goals,
      daily:    { hours: todayLog.totalHours },
      weekly:   { hours: weeklyHours },
      monthly:  { hours: monthlyHours },
      semester: { hours: semesterHours },
      subjects: data.subjects,
      subjectHours,
      topicLog: data.topicLog,
      streak: data.streak,
      activeTimer: data.activeTimer
    };
  },

  _getWeekDates() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split("T")[0];
    });
  },

  async updateGoals(goals) {
    const data = await this.getData();
    data.goals = { ...data.goals, ...goals };
    await this.saveData(data);
  },

  async clearAllData() {
    await this.saveData(JSON.parse(JSON.stringify(this.defaultData)));
  }
};