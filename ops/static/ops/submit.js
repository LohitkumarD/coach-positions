/**
 * Coach submit — Phase 6 three-screen UI, chips + Sortable, direction, scan, draft.
 * No inline handlers; dynamic UI via createElement + textContent.
 */
(function () {
  "use strict";

  const DRAFT_KEY = "coach_submit_draft_v2";
  const RECENT_KEY = "coach_submit_recent_v2";
  const QUICK_TOKENS = ["GEN", "SLRD", "PC", "S1"];

  const screenHome = document.getElementById("screenHome");
  const screenScan = document.getElementById("screenScan");
  const screenEdit = document.getElementById("screenEdit");
  const fileScanInput = document.getElementById("fileScanInput");
  const btnScanImage = document.getElementById("btnScanImage");
  const btnManualEntry = document.getElementById("btnManualEntry");
  const imageTypeSelect = document.getElementById("imageTypeSelect");
  const recentList = document.getElementById("recentList");
  const recentEmpty = document.getElementById("recentEmpty");
  const scanResultsContainer = document.getElementById("scanResultsContainer");
  const scanStaleWarning = document.getElementById("scanStaleWarning");
  const homeStaleWarning = document.getElementById("homeStaleWarning");
  const btnScanBack = document.getElementById("btnScanBack");
  const reportStationInput = document.getElementById("reportStation");
  const trainSearchInput = document.getElementById("trainSearch");
  const trainOptions = document.getElementById("trainOptions");
  const trainServiceIdInput = document.getElementById("trainServiceId");
  const selectedTrainMeta = document.getElementById("selectedTrainMeta");
  const emptyTrainHint = document.getElementById("emptyTrainHint");
  const openAddTrainBtn = document.getElementById("openAddTrainBtn");
  const addTrainPanel = document.getElementById("addTrainPanel");
  const createTrainBtn = document.getElementById("createTrainBtn");
  const createTrainResult = document.getElementById("createTrainResult");
  const sourceType = document.getElementById("sourceType");
  const trainNoHint = document.getElementById("trainNoHint");
  const trainNameHint = document.getElementById("trainNameHint");
  const journeyHint = document.getElementById("journeyHint");
  const btnApplyTrainSearch = document.getElementById("btnApplyTrainSearch");
  const directionEngine = document.getElementById("directionEngine");
  const directionTail = document.getElementById("directionTail");
  const btnReverseOrder = document.getElementById("btnReverseOrder");
  const directionHelpDynamic = document.getElementById("directionHelpDynamic");
  const chipList = document.getElementById("chipList");
  const chipEmptyState = document.getElementById("chipEmptyState");
  const aiChangeBlock = document.getElementById("aiChangeBlock");
  const btnAddCoach = document.getElementById("btnAddCoach");
  const quickAddButtons = document.getElementById("quickAddButtons");
  const issuesList = document.getElementById("issuesList");
  const issuesCard = document.getElementById("issuesCard");
  const aiInfoBlock = document.getElementById("aiInfoBlock");
  const reviewSummary = document.getElementById("reviewSummary");
  const btnSaveDraft = document.getElementById("btnSaveDraft");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnEditBack = document.getElementById("btnEditBack");
  const submitResult = document.getElementById("submitResult");
  const sequenceInput = document.getElementById("sequenceInput");
  const lastKnownBlock = document.getElementById("lastKnownBlock");
  const lastKnownText = document.getElementById("lastKnownText");
  const lastKnownEmpty = document.getElementById("lastKnownEmpty");
  const btnApplyLastKnown = document.getElementById("btnApplyLastKnown");

  const state = {
    screen: "home",
    enteredFromScan: false,
    extractions: [],
    /** True when the latest scan request failed but older extractions are still shown. */
    stalePreviousScan: false,
    lastScanError: "",
    tokens: [],
    directionRadio: "engine",
    orientationLocked: false,
    editingChipIndex: null,
    aiConfidence: null,
    aiNotes: "",
    lastValidationErrors: [],
    lastKnownSequences: [],
    /** Snapshot after scan apply; used for AI vs user diff. */
    aiBaselineTokens: null,
  };

  const DEFAULT_SCAN_BTN_LABEL = btnScanImage ? btnScanImage.textContent : "Scan image";

  function formatConfidence(c) {
    if (c == null || c === "") return "—";
    const n = Number(c);
    if (!Number.isFinite(n)) return String(c);
    if (n >= 0 && n <= 1) return `${Math.round(n * 100)}%`;
    if (n > 1 && n <= 100) return `${Math.round(n)}%`;
    return String(c);
  }

  function flashSubmitResult() {
    if (!submitResult) return;
    submitResult.classList.remove("submit-result--animate");
    void submitResult.offsetWidth;
    submitResult.classList.add("submit-result--animate");
  }

  function syncStaleBanners() {
    const show = state.stalePreviousScan && state.lastScanError;
    const text = show ? state.lastScanError : "";
    if (scanStaleWarning) {
      scanStaleWarning.hidden = !show;
      scanStaleWarning.textContent = text;
    }
    if (homeStaleWarning) {
      homeStaleWarning.hidden = !show;
      homeStaleWarning.textContent = text;
    }
  }

  let sortableInstance = null;
  let trainSearchAbort = null;
  let debounceTimer = null;
  let lastKnownFetchAbort = null;

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
  }

  function showToast(message, variant, durationMs) {
    const root = document.getElementById("toastRoot");
    if (!root) return;
    const ms = typeof durationMs === "number" && durationMs > 0 ? durationMs : 4200;
    const el = document.createElement("div");
    el.className = `toast toast--${variant || "info"}`;
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("toast--show"));
    setTimeout(() => {
      el.classList.remove("toast--show");
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  function makeIdempotencyKey() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function toIsoOrNull(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function showScreen(name) {
    state.screen = name;
    screenHome.hidden = name !== "home";
    screenScan.hidden = name !== "scan";
    screenEdit.hidden = name !== "edit";
    window.scrollTo(0, 0);
    saveDraft();
  }

  function syncSequenceInput() {
    sequenceInput.value = state.tokens.map((t) => String(t).trim()).filter(Boolean).join(" ");
    updateReviewSummary();
  }

  function updateReverseButtonState() {
    if (btnReverseOrder) btnReverseOrder.disabled = state.orientationLocked;
    if (directionHelpDynamic) {
      directionHelpDynamic.textContent = state.orientationLocked
        ? "Tail correction is on. Choose Engine → tail to undo. Reverse is disabled until then."
        : "Use radios if the photo was read wrong. Reverse is separate.";
    }
  }

  function renderAiChangeBlock() {
    if (!aiChangeBlock) return;
    aiChangeBlock.textContent = "";
    const base = state.aiBaselineTokens;
    if (!base || !base.length) {
      aiChangeBlock.hidden = true;
      return;
    }
    const normBase = base.map((t) => String(t).trim()).filter(Boolean).join(" ");
    const normCur = state.tokens.map((t) => String(t).trim()).filter(Boolean).join(" ");
    if (normBase === normCur) {
      aiChangeBlock.hidden = true;
      return;
    }
    aiChangeBlock.hidden = false;
    const one = document.createElement("p");
    one.className = "ai-change-one";
    one.textContent = "Differs from scan — see details.";
    const det = document.createElement("details");
    det.className = "pro-details pro-details--block";
    const sum = document.createElement("summary");
    sum.className = "pro-details__summary";
    sum.textContent = "Compare";
    const body = document.createElement("div");
    body.className = "pro-details__body pro-details__body--stack";
    const b0 = document.createElement("div");
    b0.textContent = `Scan: ${normBase}`;
    const b1 = document.createElement("div");
    b1.textContent = `Yours: ${state.tokens.map((t) => String(t).trim()).filter(Boolean).join(" ") || "—"}`;
    body.appendChild(b0);
    body.appendChild(b1);
    det.appendChild(sum);
    det.appendChild(body);
    aiChangeBlock.appendChild(one);
    aiChangeBlock.appendChild(det);
  }

  function updateReviewSummary() {
    let trainPart =
      trainOptions.options[trainOptions.selectedIndex]?.textContent ||
      selectedTrainMeta.textContent ||
      "";
    trainPart = trainPart.replace(/^Selected train:\s*/i, "").trim();
    if (!trainPart || trainPart.includes("No train found")) {
      const hint = trainNoHint.value.trim() || trainSearchInput.value.trim();
      trainPart = hint || "—";
    }
    const seq = sequenceInput.value.trim() || "—";
    reviewSummary.textContent = "";
    const lineTrain = document.createElement("div");
    lineTrain.className = "review-compact__train";
    lineTrain.textContent = `Train ${trainPart}`;
    const lineSeq = document.createElement("div");
    lineSeq.className = "review-compact__seq";
    lineSeq.textContent = seq;
    reviewSummary.appendChild(lineTrain);
    reviewSummary.appendChild(lineSeq);
  }

  function setTrainSelection(id, label) {
    trainServiceIdInput.value = id ? String(id) : "";
    if (!label || label === "—") {
      selectedTrainMeta.textContent = "";
      return;
    }
    const t = String(label);
    selectedTrainMeta.textContent = t.length > 64 ? `${t.slice(0, 61)}…` : t;
  }

  function renderTrainOptions(items) {
    trainOptions.textContent = "";
    if (!items.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No train found for this search";
      trainOptions.appendChild(opt);
      setTrainSelection("", "");
      if (emptyTrainHint) emptyTrainHint.hidden = false;
      return;
    }
    if (emptyTrainHint) emptyTrainHint.hidden = true;
    for (const t of items) {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      opt.textContent = `${t.trainNo} — ${t.trainName || "Unnamed"} (${t.targetStation || "—"})`;
      trainOptions.appendChild(opt);
    }
    const first = trainOptions.options[0];
    setTrainSelection(first.value, first.textContent);
  }

  async function loadTrainServices() {
    const q = trainSearchInput.value.trim();
    const station = reportStationInput.value.trim().toUpperCase();
    if (trainSearchAbort) trainSearchAbort.abort();
    trainSearchAbort = new AbortController();
    const url = `/api/v1/train-services?q=${encodeURIComponent(q)}&station=${encodeURIComponent(station)}`;
    try {
      const res = await fetch(url, { signal: trainSearchAbort.signal });
      if (!res.ok) {
        renderTrainOptions([]);
        return;
      }
      const rows = await res.json();
      renderTrainOptions(rows);
    } catch (e) {
      if (e.name === "AbortError") return;
      renderTrainOptions([]);
    }
  }

  function scheduleLoadTrainServices() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadTrainServices, 280);
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function chipHasError(token, index) {
    if (!String(token).trim()) return true;
    const errs = state.lastValidationErrors || [];
    if (!errs.length) return false;
    const t = String(token).trim().toUpperCase();
    const pos1 = index + 1;
    for (const err of errs) {
      const s = String(err);
      const su = s.toUpperCase();
      const posMatch = su.match(/\b(?:POSITION|COACH|SLOT)\s*[#:]?\s*(\d+)\b/);
      if (posMatch && Number(posMatch[1]) === pos1) return true;
      const leadNum = su.match(/^\s*(\d+)\s*[.:)\-]/);
      if (leadNum && Number(leadNum[1]) === pos1) return true;
      if (t) {
        const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, "i");
        if (re.test(s)) return true;
      }
    }
    return false;
  }

  function renderIssues() {
    issuesList.textContent = "";
    const local = [];
    state.tokens.forEach((tok, i) => {
      if (!String(tok).trim()) local.push(`Position ${i + 1}: empty coach token`);
    });
    const merged = [...state.lastValidationErrors, ...local];
    if (!merged.length) {
      issuesCard.hidden = true;
      return;
    }
    issuesCard.hidden = false;
    merged.forEach((msg, i) => {
      const li = document.createElement("li");
      li.id = `issue-${i}`;
      li.textContent = String(msg);
      issuesList.appendChild(li);
    });
  }

  function renderAiInfo() {
    aiInfoBlock.textContent = "";
    if (state.aiConfidence == null && !state.aiNotes) {
      aiInfoBlock.textContent = "—";
      return;
    }
    const row = document.createElement("div");
    row.className = "ai-info-row";
    if (state.aiConfidence != null) {
      const conf = document.createElement("span");
      conf.className = "ai-confidence-pill";
      conf.textContent = `Confidence ${formatConfidence(state.aiConfidence)}`;
      row.appendChild(conf);
    }
    aiInfoBlock.appendChild(row);
    if (state.aiNotes) {
      const det = document.createElement("details");
      det.className = "pro-details pro-details--block";
      const sum = document.createElement("summary");
      sum.className = "pro-details__summary";
      sum.textContent = "Why?";
      const body = document.createElement("div");
      body.className = "pro-details__body";
      body.textContent = String(state.aiNotes);
      det.appendChild(sum);
      det.appendChild(body);
      aiInfoBlock.appendChild(det);
    }
  }

  function destroySortable() {
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
  }

  function readTokensFromDom() {
    const rows = chipList.querySelectorAll(".chip-row");
    state.tokens = Array.from(rows).map((li) => li.dataset.token || "");
    rows.forEach((li, i) => {
      li.dataset.index = String(i);
    });
  }

  function initSortable() {
    destroySortable();
    if (typeof Sortable === "undefined") return;
    sortableInstance = Sortable.create(chipList, {
      handle: ".chip-drag",
      delay: 120,
      delayOnTouchOnly: true,
      filter: ".chip-token, .chip-remove, .chip-token-input",
      preventOnFilter: false,
      animation: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      forceFallback: true,
      fallbackTolerance: 8,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onStart(evt) {
        evt.item.setAttribute("aria-grabbed", "true");
        evt.item.classList.add("chip-row--dragging");
      },
      onEnd(evt) {
        evt.item.removeAttribute("aria-grabbed");
        evt.item.classList.remove("chip-row--dragging");
        readTokensFromDom();
        syncSequenceInput();
        renderIssues();
        renderAiChangeBlock();
        saveDraft();
      },
    });
  }

  function commitChipEdit(input) {
    const li = input.closest(".chip-row");
    if (!li || !input.isConnected) return;
    const index = Number(li.dataset.index);
    if (Number.isNaN(index)) return;
    const val = input.value.trim().toUpperCase();
    state.tokens[index] = val;
    state.editingChipIndex = null;
    renderChips();
    syncSequenceInput();
    renderIssues();
    saveDraft();
  }

  function cancelChipEdit(index, previous) {
    state.tokens[index] = previous;
    state.editingChipIndex = null;
    renderChips();
    syncSequenceInput();
  }

  function startChipEdit(index) {
    if (state.editingChipIndex !== null) return;
    state.editingChipIndex = index;
    const li = chipList.querySelector(`.chip-row[data-index="${index}"]`);
    if (!li) return;
    const prev = state.tokens[index];
    const tokenBtn = li.querySelector(".chip-token");
    if (!tokenBtn) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "chip-token-input";
    input.value = state.tokens[index] || "";
    input.setAttribute("aria-label", "Edit coach code");
    tokenBtn.replaceWith(input);
    input.focus();
    input.select();

    let blurCancelTimer = null;
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (blurCancelTimer) {
          clearTimeout(blurCancelTimer);
          blurCancelTimer = null;
        }
        commitChipEdit(input);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        if (blurCancelTimer) {
          clearTimeout(blurCancelTimer);
          blurCancelTimer = null;
        }
        cancelChipEdit(index, prev);
      } else if (ev.key === "Backspace" && input.value === "") {
        ev.preventDefault();
        if (blurCancelTimer) {
          clearTimeout(blurCancelTimer);
          blurCancelTimer = null;
        }
        const idx = Number(li.dataset.index);
        if (!Number.isNaN(idx)) state.tokens.splice(idx, 1);
        state.editingChipIndex = null;
        renderChips();
        syncSequenceInput();
        renderIssues();
        saveDraft();
      }
    });
    input.addEventListener("blur", () => {
      blurCancelTimer = setTimeout(() => {
        blurCancelTimer = null;
        if (state.editingChipIndex === index && input.isConnected) {
          cancelChipEdit(index, prev);
        }
      }, 150);
    });
  }

  function buildChipRow(token, index) {
    const li = document.createElement("li");
    li.className = "chip-row";
    li.dataset.index = String(index);
    li.dataset.token = String(token);
    li.setAttribute("role", "listitem");

    const dragBtn = document.createElement("button");
    dragBtn.type = "button";
    dragBtn.className = "chip-drag";
    dragBtn.setAttribute("aria-label", "Drag row to reorder coaches");
    dragBtn.textContent = "⠿";

    const tokenBtn = document.createElement("button");
    tokenBtn.type = "button";
    tokenBtn.className = "chip-token";
    tokenBtn.textContent = token || " ";
    const err = chipHasError(token, index) || !String(token).trim();
    if (err) {
      tokenBtn.classList.add("chip-token--error");
      tokenBtn.setAttribute("aria-invalid", "true");
      tokenBtn.setAttribute("aria-describedby", "issuesRegion");
    }
    tokenBtn.addEventListener("click", () => startChipEdit(index));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chip-remove";
    removeBtn.setAttribute("aria-label", "Remove coach");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      const idx = Number(li.dataset.index);
      if (!Number.isNaN(idx)) state.tokens.splice(idx, 1);
      renderChips();
      syncSequenceInput();
      renderIssues();
      saveDraft();
    });

    li.appendChild(dragBtn);
    li.appendChild(tokenBtn);
    li.appendChild(removeBtn);

    return li;
  }

  function renderChips() {
    destroySortable();
    chipList.textContent = "";
    state.tokens.forEach((tok, i) => {
      chipList.appendChild(buildChipRow(tok, i));
    });
    if (chipEmptyState) chipEmptyState.hidden = state.tokens.length > 0;
    initSortable();
    updateReverseButtonState();
    renderAiChangeBlock();
  }

  function onDirectionChange() {
    const next = directionTail.checked ? "tail" : "engine";
    const prev = state.directionRadio;
    if (prev === "engine" && next === "tail") {
      if (!state.orientationLocked) {
        state.tokens.reverse();
        state.orientationLocked = true;
      }
    } else if (prev === "tail" && next === "engine") {
      if (state.orientationLocked) {
        state.tokens.reverse();
        state.orientationLocked = false;
      }
    }
    state.directionRadio = next;
    renderChips();
    syncSequenceInput();
    renderIssues();
    saveDraft();
  }

  function onReverseOrder() {
    state.tokens.reverse();
    renderChips();
    syncSequenceInput();
    renderIssues();
    saveDraft();
  }

  function _migrateRecentStorage() {
    try {
      const v2 = localStorage.getItem(RECENT_KEY);
      if (v2) return;
      const legacy = sessionStorage.getItem("coach_submit_recent_v1");
      if (legacy) {
        localStorage.setItem(RECENT_KEY, legacy);
        sessionStorage.removeItem("coach_submit_recent_v1");
      }
    } catch (_) {
      /* ignore */
    }
  }

  function pushRecent(id, label) {
    try {
      _migrateRecentStorage();
      const raw = localStorage.getItem(RECENT_KEY);
      let arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      const sid = String(id).trim();
      if (!sid || sid === "NaN" || sid === "undefined") return;
      arr = arr.filter((x) => String(x.id) !== sid);
      arr.unshift({ id: sid, label: String(label) });
      arr = arr.slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
    } catch (_) {
      /* ignore */
    }
    renderRecentList();
  }

  function renderRecentList() {
    recentList.textContent = "";
    _migrateRecentStorage();
    let arr = [];
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
    } catch (_) {
      arr = [];
    }
    recentEmpty.hidden = arr.length > 0;
    for (const row of arr.slice(0, 3)) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Edit";
      btn.setAttribute("aria-label", `Edit ${row.label}`);
      btn.addEventListener("click", () => {
        trainServiceIdInput.value = row.id;
        trainSearchInput.value = row.label.split("—")[0].trim();
        loadTrainServices().then(() => {
          trainOptions.value = row.id;
          const opt = trainOptions.options[trainOptions.selectedIndex];
          setTrainSelection(row.id, opt ? opt.textContent : row.label);
          state.enteredFromScan = false;
          showScreen("edit");
          document.getElementById("chipList")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      li.appendChild(btn);
      recentList.appendChild(li);
    }
  }

  function saveDraft() {
    try {
      const payload = {
        version: 2,
        screen: state.screen,
        enteredFromScan: state.enteredFromScan,
        tokens: state.tokens,
        directionRadio: state.directionRadio,
        orientationLocked: state.orientationLocked,
        reportStation: reportStationInput.value,
        trainSearch: trainSearchInput.value,
        trainServiceId: trainServiceIdInput.value,
        sourceType: sourceType.value,
        trainNoHint: trainNoHint.value,
        trainNameHint: trainNameHint.value,
        journeyHint: journeyHint.value,
        imageType: imageTypeSelect.value,
        aiConfidence: state.aiConfidence,
        aiNotes: state.aiNotes,
        lastValidationErrors: state.lastValidationErrors,
        extractions: state.extractions,
        stalePreviousScan: state.stalePreviousScan,
        lastScanError: state.lastScanError,
        aiBaselineTokens: state.aiBaselineTokens,
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (_) {
      /* ignore */
    }
  }

  function loadDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.version !== 2) return;
      if (d.reportStation) reportStationInput.value = d.reportStation;
      if (d.trainSearch) trainSearchInput.value = d.trainSearch;
      if (d.sourceType) sourceType.value = d.sourceType;
      if (d.trainNoHint != null) trainNoHint.value = d.trainNoHint;
      if (d.trainNameHint != null) trainNameHint.value = d.trainNameHint;
      if (d.journeyHint != null) journeyHint.value = d.journeyHint;
      if (d.imageType) imageTypeSelect.value = d.imageType;
      if (Array.isArray(d.tokens)) state.tokens = d.tokens.map((x) => String(x));
      if (d.directionRadio) {
        state.directionRadio = d.directionRadio;
        directionEngine.checked = d.directionRadio === "engine";
        directionTail.checked = d.directionRadio === "tail";
      }
      if (typeof d.orientationLocked === "boolean") state.orientationLocked = d.orientationLocked;
      if (d.aiConfidence != null) state.aiConfidence = d.aiConfidence;
      if (d.aiNotes != null) state.aiNotes = d.aiNotes;
      if (Array.isArray(d.lastValidationErrors)) state.lastValidationErrors = d.lastValidationErrors.map(String);
      if (Array.isArray(d.extractions)) state.extractions = d.extractions;
      if (typeof d.stalePreviousScan === "boolean") state.stalePreviousScan = d.stalePreviousScan;
      if (typeof d.lastScanError === "string") state.lastScanError = d.lastScanError;
      if (Array.isArray(d.aiBaselineTokens)) state.aiBaselineTokens = d.aiBaselineTokens.map((x) => String(x));
      else if (d.aiBaselineTokens === null) state.aiBaselineTokens = null;
      if (d.trainServiceId) trainServiceIdInput.value = d.trainServiceId;
      if (typeof d.enteredFromScan === "boolean") state.enteredFromScan = d.enteredFromScan;
      syncSequenceInput();
      renderChips();
      renderIssues();
      renderAiInfo();
      if (d.screen === "edit" || d.screen === "scan" || d.screen === "home") {
        state.screen = d.screen;
        screenHome.hidden = d.screen !== "home";
        screenScan.hidden = d.screen !== "scan";
        screenEdit.hidden = d.screen !== "edit";
        if (d.screen === "scan" && state.extractions.length) renderScanResults();
        else syncStaleBanners();
      }
      const tid = d.trainServiceId;
      if (tid) {
        loadTrainServices().then(() => {
          for (let i = 0; i < trainOptions.options.length; i++) {
            if (trainOptions.options[i].value === String(tid)) {
              trainOptions.selectedIndex = i;
              break;
            }
          }
          const sel = trainOptions.options[trainOptions.selectedIndex];
          setTrainSelection(String(tid), sel ? sel.textContent : "");
          fetchLastKnown();
          saveDraft();
        });
      } else {
        saveDraft();
      }
    } catch (_) {
      /* ignore */
    }
  }

  function renderScanResults() {
    syncStaleBanners();
    scanResultsContainer.textContent = "";
    state.extractions.forEach((ext, idx) => {
      const card = document.createElement("div");
      card.className = "card scan-card";
      const title = document.createElement("div");
      title.className = "scan-card__meta";
      const tn = ext.train_number != null ? String(ext.train_number) : "?";
      title.textContent = `Train ${tn}`;
      const conf = document.createElement("div");
      conf.className = "scan-card__meta";
      conf.textContent = `Confidence: ${formatConfidence(ext.confidence)}`;
      const seq = Array.isArray(ext.normalized_sequence) ? ext.normalized_sequence : [];
      const preview = document.createElement("div");
      preview.className = "scan-card__meta";
      const n = seq.length;
      const head = seq.slice(0, 14).join(" ");
      const tail = n > 14 ? " …" : "";
      preview.textContent = n ? `${n} coaches · ${head}${tail}` : "No coaches — open to type.";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-primary";
      btn.textContent = "Open";
      btn.addEventListener("click", () => {
        applyExtraction(idx);
      });
      card.appendChild(title);
      card.appendChild(conf);
      card.appendChild(preview);
      const verr = ext.validation_errors;
      if (Array.isArray(verr) && verr.length) {
        const issues = document.createElement("div");
        issues.className = "scan-card__meta";
        issues.textContent = verr.slice(0, 2).join(" · ");
        card.appendChild(issues);
      }
      card.appendChild(btn);
      scanResultsContainer.appendChild(card);
    });
  }

  function applyExtraction(index) {
    const ext = state.extractions[index];
    if (!ext) return;
    const seq = ext.normalized_sequence;
    state.tokens = Array.isArray(seq) ? seq.map((x) => String(x)) : [];
    state.aiBaselineTokens = state.tokens.slice();
    state.aiConfidence = ext.confidence != null ? ext.confidence : null;
    state.aiNotes = ext.notes != null ? String(ext.notes) : "";
    state.lastValidationErrors = Array.isArray(ext.validation_errors) ? ext.validation_errors.map(String) : [];
    if (ext.train_number != null) trainNoHint.value = String(ext.train_number);
    if (ext.train_name != null) trainNameHint.value = String(ext.train_name);
    if (ext.journey_date) journeyHint.value = String(ext.journey_date).slice(0, 10);
    directionEngine.checked = true;
    directionTail.checked = false;
    state.directionRadio = "engine";
    state.orientationLocked = false;
    renderChips();
    syncSequenceInput();
    renderIssues();
    renderAiInfo();
    showScreen("edit");
    state.enteredFromScan = true;
    requestAnimationFrame(() => {
      chipList.scrollIntoView({ behavior: "smooth", block: "start" });
      const risky = chipList.querySelector(".chip-token--error");
      if (risky) risky.focus();
    });
    saveDraft();
  }

  async function runScan(file) {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("image_type", imageTypeSelect.value);
    if (btnScanImage) {
      btnScanImage.disabled = true;
      btnScanImage.textContent = "Scanning…";
    }
    const hadPrior = state.extractions.length > 0;

    async function postScan() {
      return fetch("/api/v1/submissions/scan-image", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
        credentials: "same-origin",
        body: formData,
      });
    }

    try {
      let res = await postScan();
      let data = await res.json().catch(() => ({}));
      if (!res.ok && res.status === 429) {
        showToast("Waiting a moment and retrying once…", "info", 2600);
        await new Promise((r) => setTimeout(r, 2800));
        res = await postScan();
        data = await res.json().catch(() => ({}));
      }

      if (!res.ok) {
        const msg429 =
          data.code === "quota_exceeded"
            ? "Latest scan hit Google AI quota or model limits."
            : "Latest scan was rate-limited.";
        const detail = data.detail ? String(data.detail) : "";
        if (res.status === 429) {
          const head =
            data.code === "quota_exceeded"
              ? "Google AI quota or model limit (try another GEMINI_MODEL or wait a few minutes)."
              : "Too many requests — try again shortly.";
          const body =
            detail.length > 260 ? `${detail.slice(0, 240).trim()}…` : detail;
          showToast(body ? `${head} ${body}` : head, "error");
          if (hadPrior) {
            state.stalePreviousScan = true;
            state.lastScanError = `${msg429} The cards below are from an earlier successful scan, not this photo.`;
            syncStaleBanners();
            if (state.screen === "scan") renderScanResults();
          }
          return;
        }
        let shortDetail = detail;
        if (shortDetail.length > 320) {
          shortDetail = `${shortDetail.slice(0, 300)}…`;
        }
        const parts = [data.error, shortDetail].filter(Boolean);
        showToast(parts.length ? parts.join(" — ") : `Scan failed (${res.status})`, "error");
        if (hadPrior) {
          state.stalePreviousScan = true;
          state.lastScanError = `Latest scan failed. The cards below are from an earlier successful scan, not this photo.`;
          syncStaleBanners();
          if (state.screen === "scan") renderScanResults();
        }
        return;
      }
      if (!data.extractions || !data.extractions.length) {
        showToast("No extractions returned.", "error");
        return;
      }
      state.stalePreviousScan = false;
      state.lastScanError = "";
      syncStaleBanners();
      state.extractions = data.extractions;
      renderScanResults();
      showScreen("scan");
      saveDraft();
    } catch (e) {
      showToast("Network error during scan.", "error");
      if (hadPrior) {
        state.stalePreviousScan = true;
        state.lastScanError =
          "Latest scan had a network error. The cards below are from an earlier successful scan.";
        syncStaleBanners();
        if (state.screen === "scan") renderScanResults();
      }
    } finally {
      if (btnScanImage) {
        btnScanImage.disabled = false;
        btnScanImage.textContent = DEFAULT_SCAN_BTN_LABEL;
      }
    }
  }

  function initQuickAdd() {
    quickAddButtons.textContent = "";
    for (const tok of QUICK_TOKENS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-inline";
      b.textContent = `+ ${tok}`;
      b.addEventListener("click", () => {
        state.tokens.push(tok);
        renderChips();
        syncSequenceInput();
        renderIssues();
        saveDraft();
      });
      quickAddButtons.appendChild(b);
    }
  }

  async function fetchLastKnown() {
    const tid = Number(trainServiceIdInput.value);
    if (!tid || Number.isNaN(tid)) {
      lastKnownBlock.hidden = true;
      lastKnownEmpty.hidden = false;
      state.lastKnownSequences = [];
      return;
    }
    if (lastKnownFetchAbort) lastKnownFetchAbort.abort();
    lastKnownFetchAbort = new AbortController();
    try {
      const res = await fetch(`/api/v1/train-services/${tid}/recent-sequences?limit=3`, {
        credentials: "same-origin",
        signal: lastKnownFetchAbort.signal,
      });
      if (!res.ok) {
        lastKnownBlock.hidden = true;
        lastKnownEmpty.hidden = false;
        return;
      }
      const rows = await res.json();
      state.lastKnownSequences = Array.isArray(rows) ? rows : [];
      if (!state.lastKnownSequences.length) {
        lastKnownBlock.hidden = true;
        lastKnownEmpty.hidden = false;
        return;
      }
      lastKnownEmpty.hidden = true;
      lastKnownBlock.hidden = false;
      const first = state.lastKnownSequences[0];
      const seqArr = first.normalized_sequence || first.normalizedSequence || [];
      const seq = (Array.isArray(seqArr) ? seqArr : []).join(" ");
      lastKnownText.textContent = seq || "—";
    } catch (e) {
      if (e.name === "AbortError") return;
      lastKnownBlock.hidden = true;
      lastKnownEmpty.hidden = false;
    }
  }

  function applyLastKnown() {
    const first = state.lastKnownSequences[0];
    const seqArr = first && (first.normalized_sequence || first.normalizedSequence);
    if (!first || !Array.isArray(seqArr)) return;
    state.tokens = seqArr.map((x) => String(x));
    state.aiBaselineTokens = null;
    state.lastValidationErrors = [];
    renderChips();
    syncSequenceInput();
    renderIssues();
    saveDraft();
    showToast("Applied.", "success");
  }

  btnScanImage.addEventListener("click", () => fileScanInput.click());
  fileScanInput.addEventListener("change", () => {
    const f = fileScanInput.files && fileScanInput.files[0];
    fileScanInput.value = "";
    if (f) runScan(f);
  });

  btnManualEntry.addEventListener("click", () => {
    state.enteredFromScan = false;
    state.extractions = [];
    state.stalePreviousScan = false;
    state.lastScanError = "";
    syncStaleBanners();
    state.aiBaselineTokens = null;
    state.aiConfidence = null;
    state.aiNotes = "";
    state.lastValidationErrors = [];
    if (!state.tokens.length) state.tokens = [];
    directionEngine.checked = true;
    directionTail.checked = false;
    state.directionRadio = "engine";
    state.orientationLocked = false;
    renderChips();
    renderIssues();
    renderAiInfo();
    showScreen("edit");
  });

  btnScanBack.addEventListener("click", () => showScreen("home"));

  btnEditBack.addEventListener("click", () => {
    if (state.enteredFromScan) {
      showScreen("scan");
    } else {
      showScreen("home");
    }
  });

  directionEngine.addEventListener("change", onDirectionChange);
  directionTail.addEventListener("change", onDirectionChange);
  btnReverseOrder.addEventListener("click", onReverseOrder);

  btnAddCoach.addEventListener("click", () => {
    state.tokens.push("");
    renderChips();
    syncSequenceInput();
    const lastIndex = state.tokens.length - 1;
    startChipEdit(lastIndex);
    saveDraft();
  });

  btnApplyTrainSearch.addEventListener("click", () => {
    if (trainNoHint.value.trim()) trainSearchInput.value = trainNoHint.value.trim();
    scheduleLoadTrainServices();
    loadTrainServices();
  });

  btnSaveDraft.addEventListener("click", () => {
    saveDraft();
    const tid = Number(trainServiceIdInput.value);
    const hasTrainNo = Boolean(
      (trainNoHint.value && trainNoHint.value.trim()) || (trainSearchInput.value && trainSearchInput.value.trim())
    );
    if (!tid || Number.isNaN(tid)) {
      showToast(
        hasTrainNo ? "Saved. You can submit without picking from the list." : "Saved. Add train number before submit.",
        "success",
        4000
      );
    } else {
      showToast("Saved.", "success");
    }
  });

  btnSubmit.addEventListener("click", async () => {
    submitResult.textContent = "";
    const tid = Number(trainServiceIdInput.value);
    const trainNoRaw = (trainNoHint.value || "").trim() || (trainSearchInput.value || "").trim();
    const useList = tid && !Number.isNaN(tid);
    if (!useList && !trainNoRaw) {
      showToast("Enter train number and coaches.", "error", 5000);
      return;
    }
    const cleaned = state.tokens.map((t) => String(t).trim()).filter(Boolean);
    if (!cleaned.length) {
      showToast("Add at least one coach.", "error");
      return;
    }
    if (cleaned.length !== state.tokens.length) {
      showToast("Remove empty coach rows.", "error");
      return;
    }
    btnSubmit.disabled = true;
    try {
      const rs = reportStationInput.value.trim().toUpperCase();
      const payload = {
        source_type: sourceType.value,
        sequence_input: cleaned.join(" "),
        idempotency_key: makeIdempotencyKey(),
      };
      if (useList) {
        payload.train_service_id = tid;
      } else {
        const digits = trainNoRaw.replace(/[^\d]/g, "");
        payload.train_no = digits || trainNoRaw;
        if (trainNameHint.value.trim()) payload.train_name = trainNameHint.value.trim();
        if (journeyHint.value) payload.journey_date = journeyHint.value;
      }
      if (rs) payload.report_station_code = rs;
      const res = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await res.json() : { detail: await res.text() };
      if (!res.ok) {
        const msg = body.errors ? body.errors.join("; ") : JSON.stringify(body);
        submitResult.textContent = `Failed (${res.status}): ${msg}`;
        flashSubmitResult();
        if (Array.isArray(body.errors)) {
          state.lastValidationErrors = body.errors.map(String);
          renderIssues();
        }
        showToast(`Submit failed (${res.status})`, "error");
        return;
      }
      const sig = body.sequenceSignature || "—";
      const band = body.confidenceBand != null ? body.confidenceBand : "—";
      if (res.status === 202) {
        submitResult.textContent = `Saved (building confidence). Order: ${sig}`;
        flashSubmitResult();
        showToast("Submitted (confidence building).", "success", 4800);
      } else if (body.status === "deduplicated") {
        submitResult.textContent = "Already saved (duplicate request).";
        flashSubmitResult();
        showToast("Already recorded.", "success", 3200);
      } else {
        submitResult.textContent = `Saved. Confidence: ${band}. Order: ${sig}`;
        flashSubmitResult();
        showToast("Submitted.", "success", 4000);
      }
      state.tokens = [];
      state.lastValidationErrors = [];
      state.aiBaselineTokens = null;
      state.aiConfidence = null;
      state.aiNotes = "";
      syncSequenceInput();
      renderChips();
      renderIssues();
      renderAiInfo();
      sessionStorage.removeItem(DRAFT_KEY);
      let svcId =
        body.trainServiceId != null && body.trainServiceId !== undefined
          ? String(body.trainServiceId)
          : "";
      if (!svcId && useList && tid && !Number.isNaN(tid)) svcId = String(tid);
      const label =
        trainOptions.options[trainOptions.selectedIndex]?.textContent ||
        `${trainNoRaw || "Train"} — submitted`;
      if (svcId && svcId !== "undefined" && svcId !== "NaN") pushRecent(svcId, label);
      showScreen("home");
    } catch (err) {
      submitResult.textContent = `Failed: ${err && err.message ? err.message : "error"}`;
      flashSubmitResult();
      showToast("Network error — try again.", "error");
    } finally {
      btnSubmit.disabled = false;
    }
  });

  openAddTrainBtn.addEventListener("click", () => {
    addTrainPanel.hidden = false;
    document.getElementById("newTrainNo").value =
      document.getElementById("newTrainNo").value || trainSearchInput.value.trim();
    document.getElementById("newTargetCode").value =
      document.getElementById("newTargetCode").value || reportStationInput.value.trim().toUpperCase();
  });

  createTrainBtn.addEventListener("click", async () => {
    createTrainBtn.disabled = true;
    createTrainResult.textContent = "Creating train…";
    try {
      const payload = {
        train_no: document.getElementById("newTrainNo").value.trim(),
        train_name: document.getElementById("newTrainName").value.trim(),
        journey_date: document.getElementById("newJourneyDate").value || undefined,
        origin_station_code: document.getElementById("newOriginCode").value.trim().toUpperCase() || undefined,
        destination_station_code: document.getElementById("newDestinationCode").value.trim().toUpperCase() || undefined,
        target_station_code: document.getElementById("newTargetCode").value.trim().toUpperCase() || undefined,
        scheduled_arrival: toIsoOrNull(document.getElementById("newScheduledArrival").value),
        scheduled_departure: toIsoOrNull(document.getElementById("newScheduledDeparture").value),
        route_station_codes: (document.getElementById("newRouteCodes").value || "")
          .split(",")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean),
      };
      if (!payload.train_no) {
        createTrainResult.textContent = "Train number is required.";
        showToast("Train number is required.", "error");
        return;
      }
      const res = await fetch("/api/v1/train-services/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(payload),
      });
      const resBody = (res.headers.get("content-type") || "").includes("application/json")
        ? await res.json()
        : await res.text();
      if (!res.ok) {
        createTrainResult.textContent = `Failed (${res.status}): ${typeof resBody === "string" ? resBody : JSON.stringify(resBody)}`;
        showToast(`Create train failed (${res.status})`, "error");
        return;
      }
      createTrainResult.textContent = `Created ${resBody.trainNo} (${resBody.targetStation || "—"})`;
      showToast("Train created.", "success");
      trainSearchInput.value = resBody.trainNo;
      if (resBody.targetStation) reportStationInput.value = resBody.targetStation;
      await loadTrainServices();
      trainOptions.value = String(resBody.id);
      const selected = trainOptions.options[trainOptions.selectedIndex];
      setTrainSelection(selected?.value || String(resBody.id), selected?.textContent || "");
    } catch (err) {
      createTrainResult.textContent = `Failed: ${err && err.message ? err.message : "error"}`;
      showToast("Network error creating train.", "error");
    } finally {
      createTrainBtn.disabled = false;
    }
  });

  reportStationInput.addEventListener("input", () => {
    scheduleLoadTrainServices();
    saveDraft();
  });
  trainSearchInput.addEventListener("input", () => {
    scheduleLoadTrainServices();
    saveDraft();
  });
  trainOptions.addEventListener("change", () => {
    const selected = trainOptions.options[trainOptions.selectedIndex];
    setTrainSelection(selected?.value || "", selected?.textContent || "");
    saveDraft();
    fetchLastKnown();
  });

  sourceType.addEventListener("change", saveDraft);
  trainNoHint.addEventListener("input", saveDraft);
  trainNameHint.addEventListener("input", saveDraft);
  journeyHint.addEventListener("change", saveDraft);

  btnApplyLastKnown.addEventListener("click", applyLastKnown);

  document.addEventListener("keydown", (ev) => {
    if (!ev.altKey || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
    const li = ev.target && ev.target.closest ? ev.target.closest(".chip-row") : null;
    if (!li || !chipList.contains(li)) return;
    const rows = [...chipList.querySelectorAll(".chip-row")];
    const idx = rows.indexOf(li);
    if (idx < 0) return;
    if (ev.key === "ArrowLeft" && idx > 0) {
      ev.preventDefault();
      const tmp = state.tokens[idx - 1];
      state.tokens[idx - 1] = state.tokens[idx];
      state.tokens[idx] = tmp;
      renderChips();
      syncSequenceInput();
      saveDraft();
    } else if (ev.key === "ArrowRight" && idx < state.tokens.length - 1) {
      ev.preventDefault();
      const tmp = state.tokens[idx + 1];
      state.tokens[idx + 1] = state.tokens[idx];
      state.tokens[idx] = tmp;
      renderChips();
      syncSequenceInput();
      saveDraft();
    }
  });

  initQuickAdd();
  renderChips();
  renderIssues();
  renderAiInfo();
  renderRecentList();
  loadDraft();
  updateReviewSummary();

  const params = new URLSearchParams(window.location.search);
  const qsStation = params.get("station");
  if (qsStation) reportStationInput.value = qsStation.toUpperCase();
  loadTrainServices().then(fetchLastKnown);
})();
