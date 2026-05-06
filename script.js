const WEB_APP_VERSION = "1.2.6";
const DEFAULT_UPDATE_SERVER_URL =
  window.location.protocol.startsWith("http") && window.location.hostname.endsWith("vercel.app")
    ? window.location.origin
    : "https://timeralpha.vercel.app";
const LEGACY_UPDATE_SERVER_URLS = new Set([
  "",
  "http://127.0.0.1:8000",
  "http://192.168.1.6:8000",
  "https://pomotimer.vercel.app",
  "https://pomotimer-4dt.pages.dev"
]);
const MAX_ROUNDS = 4;
const MAX_GOALS = 12;
const HISTORY_STORAGE_KEY = "pomotimer-history";
const NOTES_STORAGE_KEY = "pomotimer-notes";
const TIMER_STATE_STORAGE_KEY = "pomotimer-timer-state";
const UPDATE_SERVER_STORAGE_KEY = "pomotimer-update-server";
const NATIVE_TIMER_NOTIFICATION_ID = 1001;
const NATIVE_NOTIFICATION_CHANNEL_ID = "pomotimer-reminders";

const minutesEl = document.getElementById("minutes");
const secondsEl = document.getElementById("seconds");
const sessionLabelEl = document.getElementById("sessionLabel");
const phaseBadge = document.getElementById("phaseBadge");
const roundCountEl = document.getElementById("roundCount");
const goalCountEl = document.getElementById("goalCount");
const toggleButton = document.getElementById("toggleTimer");
const resetTimerButton = document.getElementById("resetTimerButton");
const notifyButton = document.getElementById("notifyButton");
const presetButtons = document.querySelectorAll(".preset-button");
const progressRing = document.getElementById("progressRing");
const historyList = document.getElementById("historyList");
const historyTotal = document.getElementById("historyTotal");
const historyToday = document.getElementById("historyToday");
const notesForm = document.getElementById("notesForm");
const noteTitle = document.getElementById("noteTitle");
const noteStatus = document.getElementById("noteStatus");
const noteContent = document.getElementById("noteContent");
const notesFeedback = document.getElementById("notesFeedback");
const notesList = document.getElementById("notesList");
const navItems = document.querySelectorAll(".nav-item");
const timerView = document.getElementById("timerView");
const historyView = document.getElementById("historyView");
const notesView = document.getElementById("notesView");
const settingsView = document.getElementById("settingsView");
const startupSplash = document.getElementById("startupSplash");
const updateChip = document.getElementById("updateChip");
const updateBanner = document.getElementById("updateBanner");
const updateBannerText = document.getElementById("updateBannerText");
const openUpdateModalButton = document.getElementById("openUpdateModalButton");
const checkUpdateButton = document.getElementById("checkUpdateButton");
const downloadAppButton = document.getElementById("downloadAppButton");
const updateModal = document.getElementById("updateModal");
const updateModalTitle = document.getElementById("updateModalTitle");
const updateModalBody = document.getElementById("updateModalBody");
const updateNotesList = document.getElementById("updateNotesList");
const updateLaterButton = document.getElementById("updateLaterButton");
const updateNowButton = document.getElementById("updateNowButton");
const updateServerInput = document.getElementById("updateServerInput");
const saveUpdateServerButton = document.getElementById("saveUpdateServerButton");
const currentVersionValue = document.getElementById("currentVersionValue");
const latestVersionValue = document.getElementById("latestVersionValue");
const updateStatusText = document.getElementById("updateStatusText");
const toast = document.getElementById("toast");

const capacitor = window.Capacitor;
const isNativeCapacitor =
  typeof capacitor?.isNativePlatform === "function" && capacitor.isNativePlatform();
const plugins = capacitor?.Plugins ?? {};
const nativeLocalNotifications = plugins.LocalNotifications ?? null;
const appPlugin = plugins.App ?? null;
const browserPlugin = plugins.Browser ?? null;

let selectedMinutes = 20;
let breakMinutes = 5;
let phase = "focus";
let totalSeconds = selectedMinutes * 60;
let remainingSeconds = totalSeconds;
let isRunning = false;
let intervalId = null;
let endTime = null;
let rounds = 0;
let goals = 0;
let audioContext = null;
let sessionHistory = readStorage(HISTORY_STORAGE_KEY);
let notes = readStorage(NOTES_STORAGE_KEY);
let currentVersion = WEB_APP_VERSION;
let latestUpdate = null;
let updateServerUrl = "";
let activeTab = "timer";
let toastTimer = null;

function readStorage(key) {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : [];
  } catch (error) {
    console.error(`Impossible de lire ${key}`, error);
    return [];
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Impossible d'ecrire ${key}`, error);
  }
}

function normalizeUpdateServerUrl(value) {
  const rawValue = String(value || "").trim().replace(/\/+$/, "");
  return rawValue || DEFAULT_UPDATE_SERVER_URL;
}

function resolveInitialUpdateServerUrl() {
  const storedValue = window.localStorage.getItem(UPDATE_SERVER_STORAGE_KEY);
  const normalizedStored = String(storedValue || "").trim().replace(/\/+$/, "");

  if (!normalizedStored || LEGACY_UPDATE_SERVER_URLS.has(normalizedStored)) {
    window.localStorage.setItem(UPDATE_SERVER_STORAGE_KEY, DEFAULT_UPDATE_SERVER_URL);
    return DEFAULT_UPDATE_SERVER_URL;
  }

  return normalizedStored;
}

function persistTimerState() {
  writeStorage(TIMER_STATE_STORAGE_KEY, {
    selectedMinutes,
    breakMinutes,
    phase,
    totalSeconds,
    remainingSeconds,
    isRunning,
    endTime,
    rounds,
    goals
  });
}

function restoreTimerState() {
  const savedState = readStorage(TIMER_STATE_STORAGE_KEY);
  if (!savedState || Array.isArray(savedState) || Object.keys(savedState).length === 0) {
    return;
  }

  selectedMinutes = Number(savedState.selectedMinutes) || selectedMinutes;
  breakMinutes = Number(savedState.breakMinutes) || breakMinutes;
  phase = savedState.phase === "break" ? "break" : "focus";
  rounds = Number(savedState.rounds) || 0;
  goals = Number(savedState.goals) || 0;
  totalSeconds = Number(savedState.totalSeconds) || currentPhaseMinutes() * 60;
  remainingSeconds = Number(savedState.remainingSeconds) || totalSeconds;

  if (savedState.isRunning && Number(savedState.endTime)) {
    endTime = Number(savedState.endTime);
    remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    isRunning = remainingSeconds > 0;
    if (!isRunning) {
      endTime = null;
    }
  }
}

function formatDateTime(dateValue) {
  return new Date(dateValue).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compareVersions(a, b) {
  const aParts = String(a).split(".").map((part) => Number(part) || 0);
  const bParts = String(b).split(".").map((part) => Number(part) || 0);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const aValue = aParts[index] || 0;
    const bValue = bParts[index] || 0;
    if (aValue > bValue) {
      return 1;
    }
    if (aValue < bValue) {
      return -1;
    }
  }

  return 0;
}

function currentPhaseMinutes() {
  return phase === "focus" ? selectedMinutes : breakMinutes;
}

function phaseLabelText() {
  return phase === "focus" ? "Focus" : "Pause";
}

function buildNotificationPayload() {
  const duration = currentPhaseMinutes();
  const progressText =
    phase === "focus"
      ? `Round ${rounds + 1}/${MAX_ROUNDS} · Goal ${goals}/${MAX_GOALS}`
      : `Prochaine session focus: ${selectedMinutes} min`;

  return {
    title: phase === "focus" ? "Session focus terminee" : "Pause terminee",
    body: `${phaseLabelText()} de ${duration} min terminee. ${progressText}`
  };
}

async function getCurrentAppVersion() {
  if (!appPlugin || typeof appPlugin.getInfo !== "function") {
    return WEB_APP_VERSION;
  }

  try {
    const info = await appPlugin.getInfo();
    return info.version || WEB_APP_VERSION;
  } catch (error) {
    console.error("Impossible de lire la version native.", error);
    return WEB_APP_VERSION;
  }
}

async function ensureNativeNotificationSupport() {
  if (!isNativeCapacitor || !nativeLocalNotifications) {
    return false;
  }

  try {
    if (typeof nativeLocalNotifications.createChannel === "function") {
      await nativeLocalNotifications.createChannel({
        id: NATIVE_NOTIFICATION_CHANNEL_ID,
        name: "Pomotimer",
        description: "Rappels de fin de session focus et pause",
        importance: 5,
        visibility: 1
      });
    }

    return true;
  } catch (error) {
    console.error("Impossible d'initialiser les notifications natives.", error);
    return false;
  }
}

async function requestNativeNotificationPermission() {
  if (!(await ensureNativeNotificationSupport())) {
    return false;
  }

  try {
    const permissions = await nativeLocalNotifications.checkPermissions();
    if (permissions.display === "granted") {
      return true;
    }

    const requested = await nativeLocalNotifications.requestPermissions();
    return requested.display === "granted";
  } catch (error) {
    console.error("Impossible de demander la permission des notifications natives.", error);
    return false;
  }
}

async function cancelNativeTimerNotification() {
  if (!(await ensureNativeNotificationSupport())) {
    return;
  }

  try {
    await nativeLocalNotifications.cancel({
      notifications: [{ id: NATIVE_TIMER_NOTIFICATION_ID }]
    });
  } catch (error) {
    console.error("Impossible d'annuler la notification native.", error);
  }
}

async function scheduleNativeTimerNotification() {
  if (!(await requestNativeNotificationPermission()) || !endTime) {
    return;
  }

  const { title, body } = buildNotificationPayload();

  try {
    await cancelNativeTimerNotification();
    await nativeLocalNotifications.schedule({
      notifications: [
        {
          id: NATIVE_TIMER_NOTIFICATION_ID,
          title,
          body,
          schedule: {
            at: new Date(endTime),
            allowWhileIdle: true
          },
          channelId: NATIVE_NOTIFICATION_CHANNEL_ID,
          smallIcon: "ic_stat_pomotimer"
        }
      ]
    });
  } catch (error) {
    console.error("Impossible de planifier la notification native.", error);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function notificationsSupported() {
  return "Notification" in window;
}

function updateNotificationButton() {
  if (isNativeCapacitor) {
    notifyButton.textContent = "Activer les notifications natives";
    return;
  }

  if (!notificationsSupported()) {
    notifyButton.textContent = "Notifications non supportees";
    notifyButton.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    notifyButton.textContent = "Notifications actives";
    return;
  }

  if (Notification.permission === "denied") {
    notifyButton.textContent = "Notifications bloquees";
    return;
  }

  notifyButton.textContent = "Activer les notifications";
}

async function requestNotifications() {
  if (isNativeCapacitor) {
    const granted = await requestNativeNotificationPermission();
    notifyButton.textContent = granted
      ? "Notifications natives actives"
      : "Notifications natives bloquees";
    showToast(
      granted
        ? "Notifications natives actives."
        : "Les notifications natives restent bloquees."
    );
    return;
  }

  if (!notificationsSupported()) {
    showToast("Notifications non supportees.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    new Notification("Pomotimer pret", {
      body: "Les notifications personnalisees sont activees.",
      icon: "icons/icon.svg"
    });
    showToast("Notifications activees.");
  } else {
    showToast("Notifications refusees.");
  }

  updateNotificationButton();
}

function beep() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.04;
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);
}

function notifyCompletion() {
  beep();
  const { title, body } = buildNotificationPayload();
  document.title = title;

  window.setTimeout(() => {
    document.title = "Pomotimer";
  }, 3500);

  if (isNativeCapacitor) {
    showToast(body);
    return;
  }

  if (notificationsSupported() && Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "icons/icon.svg",
      badge: "icons/icon.svg"
    });
    return;
  }

  window.alert(body);
}

function formatTimeUnit(value) {
  return String(value).padStart(2, "0");
}

function renderTime() {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  minutesEl.textContent = formatTimeUnit(minutes);
  secondsEl.textContent = formatTimeUnit(seconds);
  sessionLabelEl.textContent =
    phase === "focus" ? "Session de focus" : `Pause de ${breakMinutes} min`;
}

function renderStats() {
  roundCountEl.textContent = `${rounds}/${MAX_ROUNDS}`;
  goalCountEl.textContent = `${goals}/${MAX_GOALS}`;
}

function renderPhase() {
  phaseBadge.textContent = phase === "focus" ? "FOCUS" : "PAUSE";
  phaseBadge.classList.toggle("is-break", phase === "break");
}

function renderProgress() {
  const progress = totalSeconds === 0 ? 0 : 1 - remainingSeconds / totalSeconds;
  progressRing.style.setProperty("--progress", `${Math.max(0, progress)}`);
}

function syncTimerButtons() {
  toggleButton.textContent = isRunning ? "Pause" : "Demarrer";
}

function updatePresetState() {
  presetButtons.forEach((button) => {
    const buttonType = button.dataset.type;
    const buttonMinutes = Number(button.dataset.minutes);
    const isActive =
      (buttonType === "focus" && buttonMinutes === selectedMinutes) ||
      (buttonType === "break" && buttonMinutes === breakMinutes);

    button.classList.toggle("is-active", isActive);
  });
}

function countTodaySessions(items) {
  const todayKey = new Date().toDateString();
  return items.filter((item) => new Date(item.completedAt).toDateString() === todayKey).length;
}

function renderHistory() {
  historyTotal.textContent = String(sessionHistory.length);
  historyToday.textContent = String(countTodaySessions(sessionHistory));

  if (sessionHistory.length === 0) {
    historyList.innerHTML = '<li class="empty-state">Aucune session terminee.</li>';
    return;
  }

  historyList.innerHTML = sessionHistory
    .slice()
    .reverse()
    .map((item, reversedIndex) => {
      const originalIndex = sessionHistory.length - 1 - reversedIndex;
      return `
        <li class="history-item">
          <div class="history-top">
            <span class="history-duration">${item.minutes} min focus</span>
            <div class="history-actions">
              <span class="history-date">${formatDateTime(item.completedAt)}</span>
              <button class="history-delete" type="button" data-history-index="${originalIndex}">
                Supprimer
              </button>
            </div>
          </div>
          <div class="history-meta">
            <span class="history-chip">Round ${item.roundAfter}/${MAX_ROUNDS}</span>
            <span class="history-chip">Goal ${item.goalAfter}/${MAX_GOALS}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function statusClass(status) {
  return status === "En validation" ? "is-review" : "is-progress";
}

function renderNotes() {
  if (notes.length === 0) {
    notesList.innerHTML = '<li class="empty-state">Aucune note enregistree.</li>';
    return;
  }

  notesList.innerHTML = notes
    .slice()
    .reverse()
    .map((note, reversedIndex) => {
      const originalIndex = notes.length - 1 - reversedIndex;
      return `
        <li class="note-item">
          <div class="note-top">
            <span class="note-title">${escapeHtml(note.title)}</span>
            <div class="history-actions">
              <span class="status-pill ${statusClass(note.status)}">${escapeHtml(note.status)}</span>
              <button class="note-delete" type="button" data-note-index="${originalIndex}">
                Supprimer
              </button>
            </div>
          </div>
          <div class="note-content">${escapeHtml(note.content)}</div>
          <div class="note-date">${formatDateTime(note.createdAt)}</div>
        </li>
      `;
    })
    .join("");
}

function recordSession() {
  const upcomingRounds = rounds + 1;
  const nextRound = upcomingRounds >= MAX_ROUNDS ? 0 : upcomingRounds;
  const nextGoal = upcomingRounds >= MAX_ROUNDS ? Math.min(goals + 1, MAX_GOALS) : goals;

  sessionHistory.push({
    minutes: selectedMinutes,
    completedAt: new Date().toISOString(),
    roundAfter: nextRound,
    goalAfter: nextGoal
  });

  writeStorage(HISTORY_STORAGE_KEY, sessionHistory);
  renderHistory();
}

function deleteHistoryItem(index) {
  sessionHistory.splice(index, 1);
  writeStorage(HISTORY_STORAGE_KEY, sessionHistory);
  renderHistory();
}

function deleteNoteItem(index) {
  notes.splice(index, 1);
  writeStorage(NOTES_STORAGE_KEY, notes);
  renderNotes();
}

function switchTab(target) {
  activeTab = target;
  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.tab === target);
  });
  timerView.classList.toggle("is-active", target === "timer");
  historyView.classList.toggle("is-active", target === "history");
  notesView.classList.toggle("is-active", target === "notes");
  settingsView.classList.toggle("is-active", target === "settings");
}

function renderUpdateState() {
  currentVersionValue.textContent = currentVersion;
  latestVersionValue.textContent = latestUpdate?.latestVersion || "-";
  updateServerInput.value = updateServerUrl;

  if (!latestUpdate) {
    updateChip.classList.add("is-hidden");
    updateBanner.classList.add("is-hidden");
    return;
  }

  const needsUpdate = compareVersions(latestUpdate.latestVersion, currentVersion) > 0;
  updateChip.classList.toggle("is-hidden", !needsUpdate);
  updateBanner.classList.toggle("is-hidden", !needsUpdate);

  if (needsUpdate) {
    updateBannerText.textContent = `Version ${latestUpdate.latestVersion} disponible. Installation recommandee.`;
    updateStatusText.textContent = `Version ${latestUpdate.latestVersion} disponible.`;
  } else {
    latestVersionValue.textContent = currentVersion;
    updateStatusText.textContent = `Pomotimer est a jour en version ${currentVersion}.`;
  }
}

function openUpdateModal() {
  if (!latestUpdate) {
    return;
  }

  updateModalTitle.textContent = `Veuillez mettre a jour Pomotimer vers ${latestUpdate.latestVersion}`;
  updateModalBody.textContent =
    latestUpdate.message || `Version ${latestUpdate.latestVersion} disponible pour installation.`;
  updateNotesList.innerHTML = "";

  (latestUpdate.notes || []).forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    updateNotesList.appendChild(item);
  });

  updateModal.classList.remove("is-hidden");
}

async function openDownloadPage() {
  const downloadUrl = `${updateServerUrl.replace(/\/+$/, "")}/download`;

  try {
    if (isNativeCapacitor && browserPlugin?.open) {
      await browserPlugin.open({ url: downloadUrl });
      return;
    }

    window.location.href = downloadUrl;
  } catch (error) {
    console.error("Impossible d'ouvrir la page de telechargement.", error);
    showToast("Impossible d'ouvrir la page de telechargement.");
  }
}

function closeUpdateModal() {
  updateModal.classList.add("is-hidden");
}

async function openUpdateInstaller() {
  if (!latestUpdate?.apkUrl) {
    showToast("Aucun lien de mise a jour disponible.");
    return;
  }

  closeUpdateModal();
  showToast(`Preparation de Pomotimer ${latestUpdate.latestVersion}...`);

  try {
    if (isNativeCapacitor && browserPlugin?.open) {
      await browserPlugin.open({ url: latestUpdate.apkUrl });
      return;
    }

    window.location.href = latestUpdate.apkUrl;
  } catch (error) {
    console.error("Impossible d'ouvrir le lien de mise a jour.", error);
    showToast("Impossible d'ouvrir le lien de mise a jour.");
  }
}

async function checkForUpdates({ manual = false } = {}) {
  const serverUrl = updateServerUrl.trim().replace(/\/+$/, "");

  if (!serverUrl) {
    updateStatusText.textContent = "Aucun serveur de mise a jour defini.";
    if (manual) {
      showToast("Definis d'abord un serveur de mise a jour.");
    }
    return;
  }

  const manifestUrl = `${serverUrl}/update-manifest.json?ts=${Date.now()}`;
  updateStatusText.textContent = "Verification en cours...";

  try {
    const response = await fetch(manifestUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    latestUpdate = {
      latestVersion: manifest.latestVersion,
      versionCode: manifest.versionCode,
      message: manifest.message,
      notes: manifest.notes || [],
      apkUrl: manifest.apkUrl
        ? manifest.apkUrl
        : new URL(manifest.apkPath || "/downloads/pomotimer-release.apk", serverUrl).toString()
    };

    renderUpdateState();

    if (compareVersions(latestUpdate.latestVersion, currentVersion) > 0) {
      updateStatusText.textContent = `Mise a jour detectee vers ${latestUpdate.latestVersion}.`;
      if (manual) {
        openUpdateModal();
      }
      return;
    }

    updateStatusText.textContent = `Aucune mise a jour disponible.`;
    if (manual) {
      showToast("Pomotimer est deja a jour.");
    }
  } catch (error) {
    console.error("Impossible de verifier les mises a jour.", error);
    updateStatusText.textContent = "Echec de verification du serveur de mise a jour.";
    if (manual) {
      showToast("Impossible de verifier la mise a jour.");
    }
  }
}

function saveUpdateServer() {
  updateServerUrl = normalizeUpdateServerUrl(updateServerInput.value);
  window.localStorage.setItem(UPDATE_SERVER_STORAGE_KEY, updateServerUrl);
  updateStatusText.textContent = `Serveur enregistre: ${updateServerUrl}`;
  showToast("Serveur de mise a jour enregistre.");
}

function resetTimer(nextPhase = phase) {
  phase = nextPhase;
  totalSeconds = currentPhaseMinutes() * 60;
  remainingSeconds = totalSeconds;
  endTime = null;
  stopTimer();
  renderAll();
  persistTimerState();
  cancelNativeTimerNotification();
}

function completeSession() {
  notifyCompletion();

  if (phase === "focus") {
    recordSession();
    rounds += 1;

    if (rounds >= MAX_ROUNDS) {
      rounds = 0;
      goals = Math.min(goals + 1, MAX_GOALS);
    }

    resetTimer("break");
    renderStats();
    persistTimerState();
    return;
  }

  resetTimer("focus");
  persistTimerState();
}

function tick() {
  if (!isRunning || !endTime) {
    return;
  }

  remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  renderTime();
  renderProgress();
  persistTimerState();

  if (remainingSeconds === 0) {
    completeSession();
  }
}

function startTimer() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  endTime = Date.now() + remainingSeconds * 1000;
  syncTimerButtons();
  persistTimerState();
  scheduleNativeTimerNotification();
  tick();
  intervalId = window.setInterval(tick, 250);
}

function stopTimer() {
  isRunning = false;
  endTime = null;
  syncTimerButtons();
  persistTimerState();
  cancelNativeTimerNotification();

  if (intervalId) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

function resumeRunningTimer() {
  if (!isRunning || !endTime) {
    return;
  }

  tick();
  intervalId = window.setInterval(tick, 250);
}

function toggleTimer() {
  if (isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function renderAll() {
  renderTime();
  renderStats();
  renderPhase();
  renderProgress();
  updatePresetState();
  syncTimerButtons();
  renderUpdateState();
}

function saveNote(event) {
  event.preventDefault();

  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();
  const status = noteStatus.value;

  if (!title || !content) {
    notesFeedback.textContent = "Le titre et le contenu sont obligatoires.";
    return;
  }

  notes.push({
    title,
    content,
    status,
    createdAt: new Date().toISOString()
  });

  writeStorage(NOTES_STORAGE_KEY, notes);
  notesForm.reset();
  noteStatus.value = "En cours";
  notesFeedback.textContent = "Note enregistree.";
  renderNotes();
}

function dismissStartupSplash() {
  window.setTimeout(() => {
    startupSplash.classList.add("is-hidden");
  }, 820);
}

function attachEvents() {
  toggleButton.addEventListener("click", toggleTimer);
  resetTimerButton.addEventListener("click", () => resetTimer(phase));
  notifyButton.addEventListener("click", requestNotifications);
  checkUpdateButton.addEventListener("click", () => checkForUpdates({ manual: true }));
  downloadAppButton.addEventListener("click", openDownloadPage);
  updateChip.addEventListener("click", openUpdateModal);
  openUpdateModalButton.addEventListener("click", openUpdateModal);
  updateLaterButton.addEventListener("click", closeUpdateModal);
  updateNowButton.addEventListener("click", openUpdateInstaller);
  saveUpdateServerButton.addEventListener("click", saveUpdateServer);
  notesForm.addEventListener("submit", saveNote);

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const minutes = Number(button.dataset.minutes);
      const type = button.dataset.type;

      if (type === "focus") {
        selectedMinutes = minutes;
        if (phase === "focus") {
          resetTimer("focus");
        } else {
          renderAll();
          persistTimerState();
        }
        return;
      }

      breakMinutes = minutes;
      if (phase === "break") {
        resetTimer("break");
      } else {
        renderAll();
        persistTimerState();
      }
    });
  });

  navItems.forEach((item) => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });

  historyList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const deleteButton = target.closest(".history-delete");
    if (!deleteButton) {
      return;
    }
    deleteHistoryItem(Number(deleteButton.dataset.historyIndex));
  });

  notesList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const deleteButton = target.closest(".note-delete");
    if (!deleteButton) {
      return;
    }
    deleteNoteItem(Number(deleteButton.dataset.noteIndex));
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tick();
    }
  });

  window.addEventListener("focus", () => {
    tick();
    checkForUpdates();
  });

  window.addEventListener("pageshow", tick);
}

async function init() {
  currentVersion = await getCurrentAppVersion();
  updateServerUrl = resolveInitialUpdateServerUrl();
  restoreTimerState();
  await ensureNativeNotificationSupport();
  renderHistory();
  renderNotes();
  updateNotificationButton();
  renderAll();
  switchTab(activeTab);
  attachEvents();
  resumeRunningTimer();
  dismissStartupSplash();
  checkForUpdates();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.error("Impossible d'enregistrer le service worker.", error);
    });
  });
}

init();
