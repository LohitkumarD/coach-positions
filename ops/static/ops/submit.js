/**
 * Coach submit — Phase 6 three-screen UI, chips + Sortable, direction, scan, draft.
 * No inline handlers; dynamic UI via createElement + textContent.
 */
(function () {
  "use strict";

  const DRAFT_KEY = "coach_submit_draft_v2";
  const RECENT_KEY = "coach_submit_recent_v2";
  const COMPACT_STORAGE_KEY = "coach_submit_compact_v1";
  const QUICK_TOKENS = ["SLRD", "PC"];
  const SPEED_PREFIXES = ["GEN", "S", "B", "A", "LPR"];
  /** Show AI panel when scan confidence is below this (0–1 scale). */
  const AI_CONFIDENCE_SHOW_THRESHOLD = 0.72;

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
  const aiSection = document.getElementById("aiSection");
  const stickyPreview = document.getElementById("stickyPreview");
  const compactToggle = document.getElementById("compactToggle");
  const speedPrefixBar = document.getElementById("speedPrefixBar");
  const submitAppRoot = document.getElementById("submitAppRoot");
  const btnSaveDraft = document.getElementById("btnSaveDraft");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnEditBack = document.getElementById("btnEditBack");
  const submitResult = document.getElementById("submitResult");
  const sequenceInput = document.getElementById("sequenceInput");
  const lastKnownBlock = document.getElementById("lastKnownBlock");
  const lastKnownText = document.getElementById("lastKnownText");
  const lastKnownEmpty = document.getElementById("lastKnownEmpty");
  const btnApplyLastKnown = document.getElementById("btnApplyLastKnown");
  const patternSuggest = document.getElementById("patternSuggest");
  const coachHints = document.getElementById("coachHints");
  const defaultsStatus = document.getElementById("defaultsStatus");

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
    compactView: false,
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

  /** @returns {number | null} 0–1 or null */
  function confidenceToUnit(c) {
    if (c == null || c === "") return null;
    const n = Number(c);
    if (!Number.isFinite(n)) return null;
    if (n >= 0 && n <= 1) return n;
    if (n > 1 && n <= 100) return n / 100;
    return null;
  }

  function tokenSeriesKey(tok) {
    const u = String(tok).trim().toUpperCase();
    if (!u) return "";
    if (/^GEN\d*$/i.test(u)) return "GEN";
    if (/^S\d+$/i.test(u)) return "S";
    if (/^B\d+$/i.test(u)) return "B";
    if (/^A\d+$/i.test(u)) return "A";
    if (/^ENG$/i.test(u)) return "ENG";
    if (/^SLRD\d*$/i.test(u)) return "SLRD";
    if (/^PC\d*$/i.test(u)) return "PC";
    if (/^LPR\d*$/i.test(u)) return "LPR";
    return "OTHER";
  }

  /**
   * @param {string} key
   * @param {string[]} slice
   * @returns {{ main: string, sub: string }}
   */
  function formatGroupLabel(key, slice) {
    const n = slice.length;
    const u = slice.map((t) => String(t).trim().toUpperCase()).filter(Boolean);
    if (!key || key === "EMPTY") {
      return { main: `Empty rows ×${n}`, sub: n ? "Fill or remove" : "" };
    }
    if (key === "GEN") {
      return { main: `GEN ×${n}`, sub: "General (unreserved / second sitting)" };
    }
    if (key === "S") {
      const nums = u
        .map((t) => {
          const m = t.match(/^S(\d+)$/i);
          return m ? parseInt(m[1], 10) : NaN;
        })
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);
      const range =
        nums.length >= 2 ? `S${nums[0]}–S${nums[nums.length - 1]}` : u.join(" · ");
      return { main: `Sleeper · ${range}`, sub: `${n} coach${n > 1 ? "es" : ""}` };
    }
    if (key === "B") {
      const nums = u
        .map((t) => {
          const m = t.match(/^B(\d+)$/i);
          return m ? parseInt(m[1], 10) : NaN;
        })
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);
      const range =
        nums.length >= 2 ? `B${nums[0]}–B${nums[nums.length - 1]}` : u.join(" · ");
      return { main: `3AC · ${range}`, sub: `${n} coach${n > 1 ? "es" : ""}` };
    }
    if (key === "A") {
      const nums = u
        .map((t) => {
          const m = t.match(/^A(\d+)$/i);
          return m ? parseInt(m[1], 10) : NaN;
        })
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);
      const range =
        nums.length >= 2 ? `A${nums[0]}–A${nums[nums.length - 1]}` : u.join(" · ");
      return { main: `2AC · ${range}`, sub: `${n} coach${n > 1 ? "es" : ""}` };
    }
    if (key === "ENG") return { main: "Power car · ENG", sub: "Loco end" };
    if (key === "SLRD") return { main: `SLRD ×${n}`, sub: "Second sitting with pantry" };
    if (key === "PC") return { main: `Pantry · PC ×${n}`, sub: "" };
    if (key === "LPR") {
      const nums = u
        .map((t) => {
          const m = t.match(/^LPR(\d+)$/i);
          return m ? parseInt(m[1], 10) : NaN;
        })
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);
      const bare = u.some((t) => /^LPR$/i.test(t));
      const range =
        nums.length >= 2
          ? `LPR${nums[0]}–LPR${nums[nums.length - 1]}`
          : bare && nums.length
            ? `LPR · LPR${nums[0]}`
            : u.join(" · ");
      return { main: `LPR · ${range}`, sub: `${n} coach${n > 1 ? "es" : ""}` };
    }
    return { main: `Other · ${u.slice(0, 3).join(", ")}${u.length > 3 ? "…" : ""}`, sub: `${n} item${n > 1 ? "s" : ""}` };
  }

  function buildGroupLabelEl(key, slice) {
    const li = document.createElement("li");
    li.className = "chip-group-label";
    li.setAttribute("role", "presentation");
    const meta = formatGroupLabel(key, slice);
    const main = document.createElement("div");
    main.className = "chip-group-label__main";
    main.textContent = meta.main;
    li.appendChild(main);
    if (meta.sub) {
      const sub = document.createElement("div");
      sub.className = "chip-group-label__sub";
      sub.textContent = meta.sub;
      li.appendChild(sub);
    }
    return li;
  }

  function renderPatternSuggest() {
    if (!patternSuggest) return;
    patternSuggest.textContent = "";
    patternSuggest.hidden = true;
    if (state.editingChipIndex !== null) return;
    const toks = state.tokens.map((t) => String(t).trim());
    if (!toks.length) return;
    const last = toks[toks.length - 1];
    if (!last) return;
    const lu = last.toUpperCase();
    let suggestLabel = "";
    let suggestToken = "";

    if (/^GEN\d*$/i.test(lu)) {
      const nextG = nextTokenForPrefix("GEN");
      if (nextG === "GEN") {
        suggestLabel = "Continue with GEN?";
        suggestToken = "GEN";
      }
    } else {
      const mm = lu.match(/^(S|B|A|LPR)(\d+)$/i);
      if (mm) {
        const pref = mm[1].toUpperCase();
        const next = nextTokenForPrefix(pref);
        if (next && next !== last) {
          suggestLabel = `Add ${next}?`;
          suggestToken = next;
        }
      }
    }

    if (!suggestLabel || !suggestToken) return;

    patternSuggest.hidden = false;
    const wrap = document.createElement("div");
    wrap.className = "pattern-suggest__inner";
    const txt = document.createElement("span");
    txt.className = "pattern-suggest__text";
    txt.textContent = suggestLabel;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-inline pattern-suggest__btn";
    btn.textContent = `+ ${suggestToken}`;
    btn.addEventListener("click", () => {
      state.tokens.push(suggestToken);
      const idx = state.tokens.length - 1;
      renderChips();
      syncSequenceInput();
      renderIssues();
      saveDraft();
      flashChipRow(idx);
    });
    wrap.appendChild(txt);
    wrap.appendChild(btn);
    patternSuggest.appendChild(wrap);
  }

  function renderCoachHints() {
    if (!coachHints) return;
    coachHints.textContent = "";
    coachHints.hidden = true;
    const cleaned = state.tokens.map((t) => String(t).trim()).filter(Boolean);
    if (!cleaned.length) return;

    const hasS = cleaned.some((t) => /^S\d+$/i.test(t));
    const hasB = cleaned.some((t) => /^B\d+$/i.test(t));
    const hasA = cleaned.some((t) => /^A\d+$/i.test(t));
    const hasGen = cleaned.some((t) => /^GEN\d*$/i.test(t));
    const hasEng = cleaned.some((t) => /^ENG$/i.test(t));
    const lines = [];

    if (hasGen && (hasB || hasA) && !hasS) {
      lines.push({ kind: "warn", text: "AC coaches present but no S — confirm sleeper order if required." });
    }
    if (cleaned.length <= 2) {
      lines.push({ kind: "warn", text: "Short rake — confirm this is the full consist." });
    }
    const uniq = new Set(cleaned.map((t) => t.toUpperCase()));
    if (uniq.size < cleaned.length) {
      lines.push({ kind: "warn", text: "Duplicate coach codes — unusual unless intentional." });
    }
    if (hasEng && hasGen && cleaned.length >= 4 && (hasS || hasB)) {
      lines.push({ kind: "ok", text: "Looks like a typical coach mix." });
    }

    if (!lines.length) return;
    coachHints.hidden = false;
    for (const line of lines.slice(0, 3)) {
      const row = document.createElement("div");
      row.className = `coach-hints__row coach-hints__row--${line.kind}`;
      row.textContent = line.kind === "ok" ? `✔ ${line.text}` : `⚠ ${line.text}`;
      coachHints.appendChild(row);
    }
  }

  function updateDefaultsStatus() {
    if (!defaultsStatus) return;
    const phys = sourceType && sourceType.value === "physical_check";
    const eng = directionEngine && directionEngine.checked;
    if (phys && eng) {
      defaultsStatus.textContent = "Defaults: Physical check · Engine → tail";
      defaultsStatus.className = "defaults-status defaults-status--ok";
    } else {
      defaultsStatus.textContent = "Source or direction changed — see More options if needed.";
      defaultsStatus.className = "defaults-status defaults-status--muted";
    }
  }

  function bandToLevel(band) {
    const s = String(band == null ? "" : band).toLowerCase();
    if (s.includes("high")) return "HIGH";
    if (s.includes("low")) return "LOW";
    if (s.includes("medium") || s.includes("mid")) return "MEDIUM";
    const t = String(band || "—").trim();
    return t.length > 12 ? `${t.slice(0, 11)}…` : t.toUpperCase();
  }

  /**
   * Next token for speed keys: S→S1,S2… GEN→GEN (repeat), LPR→LPR1…
   * @param {string} prefix
   */
  function nextTokenForPrefix(prefix) {
    const p = String(prefix).trim().toUpperCase();
    if (p === "GEN") return "GEN";
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`, "i");
    let max = 0;
    let hasBare = false;
    for (const t of state.tokens) {
      const u = String(t).trim().toUpperCase();
      if (u === p) hasBare = true;
      const m = u.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    if (p === "LPR" || p === "S" || p === "B" || p === "A") {
      if (max === 0 && !hasBare) return `${p}1`;
      return `${p}${max + 1}`;
    }
    return p;
  }

  function applyCompactUi() {
    const on = Boolean(state.compactView);
    if (submitAppRoot) submitAppRoot.classList.toggle("submit-app--compact", on);
    if (compactToggle) compactToggle.checked = on;
    try {
      localStorage.setItem(COMPACT_STORAGE_KEY, on ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
  }

  function flashChipRow(index) {
    requestAnimationFrame(() => {
      const row = chipList && chipList.querySelector(`.chip-row[data-index="${index}"]`);
      if (!row) return;
      row.classList.add("chip-row--pop");
      row.addEventListener(
        "animationend",
        () => {
          row.classList.remove("chip-row--pop");
        },
        { once: true }
      );
    });
  }

  function syncAiSectionVisibility() {
    if (!aiSection) return;
    const hasDiff = aiChangeBlock && !aiChangeBlock.hidden;
    const unit = confidenceToUnit(state.aiConfidence);
    const confLow = unit != null && unit < AI_CONFIDENCE_SHOW_THRESHOLD;
    const show = Boolean(hasDiff || confLow);
    aiSection.hidden = !show;
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
    updateStickyPreview();
    renderPatternSuggest();
    renderCoachHints();
    updateDefaultsStatus();
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
      syncAiSectionVisibility();
      return;
    }
    const normBase = base.map((t) => String(t).trim()).filter(Boolean).join(" ");
    const normCur = state.tokens.map((t) => String(t).trim()).filter(Boolean).join(" ");
    if (normBase === normCur) {
      aiChangeBlock.hidden = true;
      syncAiSectionVisibility();
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
    syncAiSectionVisibility();
  }

  /** Digits-only train number for comparing typed number vs dropdown label. */
  function digitsOnlyTrainNo(s) {
    return String(s || "").replace(/[^\d]/g, "");
  }

  /** Train number from the current dropdown label (before "—"). */
  function listSelectionTrainNo() {
    const opt = trainOptions.options[trainOptions.selectedIndex];
    if (!opt || !opt.value) return "";
    const head = (opt.textContent || "").split("—")[0].trim();
    return digitsOnlyTrainNo(head);
  }

  /**
   * Bottom preview must follow Train No * (trainNoHint), not a stale optional service row.
   * Dropdown is only shown when it matches the typed number or when the number field is empty.
   */
  function updateStickyPreview() {
    if (!stickyPreview) return;
    const hint = trainNoHint.value.trim();
    const nameHint = trainNameHint.value.trim();
    const hintDigits = digitsOnlyTrainNo(hint);
    const listDigits = listSelectionTrainNo();
    const svcId = trainServiceIdInput.value.trim();
    const opt = trainOptions.options[trainOptions.selectedIndex];
    const optText = opt && opt.value ? String(opt.textContent || "").trim() : "";

    let trainPart = "—";
    if (hint) {
      if (svcId && hintDigits && listDigits && hintDigits === listDigits && optText) {
        trainPart = optText;
      } else if (nameHint) {
        trainPart = `${hint} — ${nameHint}`;
      } else {
        trainPart = hint;
      }
    } else {
      let fromList = optText || String(selectedTrainMeta.textContent || "").trim();
      fromList = fromList.replace(/^Selected train:\s*/i, "").trim();
      if (fromList && !fromList.includes("No train found") && !fromList.includes("Optional —")) {
        trainPart = fromList;
      } else {
        const search = trainSearchInput.value.trim();
        trainPart = search || "—";
      }
    }

    const seq = sequenceInput.value.trim() || "—";
    stickyPreview.textContent = "";
    const lineTrain = document.createElement("div");
    lineTrain.className = "sticky-preview__train";
    lineTrain.textContent = trainPart;
    const lineSeq = document.createElement("div");
    lineSeq.className = "sticky-preview__seq";
    lineSeq.textContent = seq;
    stickyPreview.appendChild(lineTrain);
    stickyPreview.appendChild(lineSeq);
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

  /** Clear linked TrainService so submit uses the number field, not a stale hidden id. */
  function resetTrainServicePickUi() {
    trainOptions.textContent = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Not linked — uses train number above";
    trainOptions.appendChild(opt);
    setTrainSelection("", "");
    if (emptyTrainHint) emptyTrainHint.hidden = true;
  }

  /**
   * @param {object[]} items
   * @param {string} [searchQuery] trimmed search box value — when empty, do not auto-pick first train (avoids wrong hidden id).
   */
  function renderTrainOptions(items, searchQuery) {
    const q = (searchQuery || "").trim();
    trainOptions.textContent = "";
    if (!items.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No train found for this search";
      trainOptions.appendChild(opt);
      setTrainSelection("", "");
      if (emptyTrainHint) emptyTrainHint.hidden = false;
      updateStickyPreview();
      return;
    }
    if (emptyTrainHint) emptyTrainHint.hidden = true;
    if (!q) {
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "Optional — pick a saved service…";
      trainOptions.appendChild(ph);
    }
    for (const t of items) {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      opt.textContent = `${t.trainNo} — ${t.trainName || "Unnamed"} (${t.targetStation || "—"})`;
      trainOptions.appendChild(opt);
    }
    const keepId = trainServiceIdInput.value.trim();
    const hasKeep = keepId && items.some((x) => String(x.id) === keepId);
    if (hasKeep) {
      trainOptions.value = keepId;
      const sel = trainOptions.options[trainOptions.selectedIndex];
      setTrainSelection(keepId, sel ? sel.textContent : "");
    } else if (q) {
      const first = items[0];
      trainOptions.value = String(first.id);
      setTrainSelection(String(first.id), `${first.trainNo} — ${first.trainName || "Unnamed"} (${first.targetStation || "—"})`);
    } else {
      trainOptions.value = "";
      setTrainSelection("", "");
    }
    const hdAfter = digitsOnlyTrainNo(trainNoHint.value.trim());
    const ldAfter = listSelectionTrainNo();
    if (trainServiceIdInput.value.trim() && hdAfter && ldAfter && hdAfter !== ldAfter) {
      resetTrainServicePickUi();
    }
    updateStickyPreview();
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
        renderTrainOptions([], q);
        return;
      }
      const rows = await res.json();
      renderTrainOptions(rows, q);
    } catch (e) {
      if (e.name === "AbortError") return;
      renderTrainOptions([], q);
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
    if (!issuesCard || !issuesList) return;
    issuesList.textContent = "";
    const local = [];
    state.tokens.forEach((tok, i) => {
      if (!String(tok).trim()) local.push(`Position ${i + 1}: empty coach token`);
    });
    const merged = [...state.lastValidationErrors, ...local];
    if (!merged.length) {
      issuesCard.hidden = true;
      syncAiSectionVisibility();
      return;
    }
    issuesCard.hidden = false;
    merged.forEach((msg, i) => {
      const li = document.createElement("li");
      li.id = `issue-${i}`;
      li.textContent = String(msg);
      issuesList.appendChild(li);
    });
    syncAiSectionVisibility();
  }

  function renderAiInfo() {
    if (!aiInfoBlock) return;
    aiInfoBlock.textContent = "";
    if (state.aiConfidence == null && !state.aiNotes) {
      aiInfoBlock.textContent = "";
      syncAiSectionVisibility();
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
      sum.textContent = "Scan notes";
      const body = document.createElement("div");
      body.className = "pro-details__body";
      body.textContent = String(state.aiNotes);
      det.appendChild(sum);
      det.appendChild(body);
      aiInfoBlock.appendChild(det);
    }
    syncAiSectionVisibility();
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
      draggable: ".chip-row",
      handle: ".chip-drag",
      delay: 120,
      delayOnTouchOnly: true,
      filter: ".chip-token, .chip-remove, .chip-token-input",
      preventOnFilter: false,
      animation: 200,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      forceFallback: true,
      fallbackTolerance: 8,
      scroll: true,
      scrollSensitivity: 100,
      scrollSpeed: 15,
      bubbleScroll: true,
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
        renderChips();
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
    renderIssues();
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
    renderPatternSuggest();

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

    const pos = index + 1;
    const idxEl = document.createElement("span");
    idxEl.className = "chip-index";
    idxEl.textContent = String(pos);
    idxEl.setAttribute("aria-hidden", "true");

    const dragBtn = document.createElement("button");
    dragBtn.type = "button";
    dragBtn.className = "chip-drag";
    dragBtn.setAttribute("aria-label", `Drag coach row ${pos} to reorder`);
    dragBtn.textContent = "⠿";

    const tokenBtn = document.createElement("button");
    tokenBtn.type = "button";
    tokenBtn.className = "chip-token";
    tokenBtn.setAttribute("aria-label", `Coach ${pos}: ${String(token).trim() || "empty"}`);
    const posBadge = document.createElement("span");
    posBadge.className = "chip-token__pos";
    posBadge.textContent = String(pos);
    posBadge.setAttribute("aria-hidden", "true");
    const codeSpan = document.createElement("span");
    codeSpan.className = "chip-token__code";
    codeSpan.textContent = String(token).trim() || " ";
    tokenBtn.appendChild(posBadge);
    tokenBtn.appendChild(codeSpan);
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

    li.appendChild(idxEl);
    li.appendChild(dragBtn);
    li.appendChild(tokenBtn);
    li.appendChild(removeBtn);

    return li;
  }

  function renderChips() {
    destroySortable();
    chipList.textContent = "";
    let i = 0;
    while (i < state.tokens.length) {
      const key = tokenSeriesKey(state.tokens[i]);
      let j = i + 1;
      while (j < state.tokens.length && tokenSeriesKey(state.tokens[j]) === key) j += 1;
      const slice = state.tokens.slice(i, j);
      chipList.appendChild(buildGroupLabelEl(key, slice));
      for (let k = i; k < j; k += 1) {
        chipList.appendChild(buildChipRow(state.tokens[k], k));
      }
      i = j;
    }
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
    updateDefaultsStatus();
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
        compactView: state.compactView,
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
      if (typeof d.compactView === "boolean") state.compactView = d.compactView;
      applyCompactUi();
      if (d.trainServiceId) trainServiceIdInput.value = d.trainServiceId;
      if (typeof d.enteredFromScan === "boolean") state.enteredFromScan = d.enteredFromScan;
      renderChips();
      syncSequenceInput();
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
          const hdT = digitsOnlyTrainNo(trainNoHint.value.trim());
          const ldT = listSelectionTrainNo();
          if (trainServiceIdInput.value.trim() && hdT && ldT && hdT !== ldT) {
            resetTrainServicePickUi();
          }
          syncSequenceInput();
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
    resetTrainServicePickUi();
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
        if (res.status === 503 && data.code === "missing_api_key") {
          showToast("Photo scan needs GEMINI_API_KEY on the server. Use Manual to enter coaches.", "error", 6500);
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

  async function consumeShareFromToken(token) {
    if (imageTypeSelect) imageTypeSelect.value = "unknown";
    const hadPrior = state.extractions.length > 0;
    async function postShare() {
      return fetch("/api/v1/submissions/scan-shared", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken") || "",
        },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
    }
    try {
      let res = await postShare();
      let data = await res.json().catch(() => ({}));
      if (!res.ok && res.status === 429) {
        showToast("Waiting a moment and retrying once…", "info", 2600);
        await new Promise((r) => setTimeout(r, 2800));
        res = await postShare();
        data = await res.json().catch(() => ({}));
      }
      if (res.status === 403) {
        showToast("Your account cannot use photo scan (contributor access required).", "error");
        return;
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
        if (res.status === 503 && data.code === "missing_api_key") {
          showToast("Photo scan needs GEMINI_API_KEY on the server. Use Manual to enter coaches.", "error", 6500);
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
    }
  }

  function initSpeedPrefixBar() {
    if (!speedPrefixBar) return;
    speedPrefixBar.textContent = "";
    for (const prefix of SPEED_PREFIXES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-inline btn-inline--speed";
      b.textContent = `+ ${prefix}`;
      b.setAttribute("aria-label", `Add next ${prefix} coach`);
      b.addEventListener("click", () => {
        const next = nextTokenForPrefix(prefix);
        state.tokens.push(next);
        const idx = state.tokens.length - 1;
        renderChips();
        syncSequenceInput();
        renderIssues();
        saveDraft();
        flashChipRow(idx);
      });
      speedPrefixBar.appendChild(b);
    }
  }

  function initQuickAdd() {
    if (!quickAddButtons) return;
    quickAddButtons.textContent = "";
    for (const tok of QUICK_TOKENS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-inline";
      b.textContent = `+ ${tok}`;
      b.addEventListener("click", () => {
        state.tokens.push(tok);
        const idx = state.tokens.length - 1;
        renderChips();
        syncSequenceInput();
        renderIssues();
        saveDraft();
        flashChipRow(idx);
      });
      quickAddButtons.appendChild(b);
    }
  }

  async function fetchLastKnown() {
    if (!lastKnownBlock || !lastKnownEmpty || !lastKnownText) return;
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
    renderAiInfo();
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
    resetTrainServicePickUi();
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
    const lastIndex = state.tokens.length - 1;
    renderChips();
    syncSequenceInput();
    flashChipRow(lastIndex);
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
    let tid = Number(trainServiceIdInput.value);
    const trainNoRaw = (trainNoHint.value || "").trim() || (trainSearchInput.value || "").trim();
    let useList = tid && !Number.isNaN(tid);
    const hintDigits = digitsOnlyTrainNo(trainNoRaw);
    const listDigits = listSelectionTrainNo();
    if (useList && hintDigits && listDigits && hintDigits !== listDigits) {
      useList = false;
      tid = NaN;
      resetTrainServicePickUi();
    }
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
    const submitStarted = performance.now();
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
      const level = bandToLevel(band);
      const elapsedSec = Math.max(0, (performance.now() - submitStarted) / 1000).toFixed(1);
      if (res.status === 202) {
        submitResult.textContent = `Submitted ✓ (confidence building). Order: ${sig} · ${elapsedSec}s`;
        flashSubmitResult();
        const extra = band && String(band) !== "—" ? ` · ${level}` : "";
        showToast(`Submitted ✓ · building confidence${extra} · ${elapsedSec}s`, "success", 5200);
      } else if (body.status === "deduplicated") {
        submitResult.textContent = `Already saved · ${elapsedSec}s`;
        flashSubmitResult();
        showToast(`Already recorded · ${elapsedSec}s`, "success", 3400);
      } else {
        submitResult.textContent = `Submitted ✓ · confidence ${level} · order ${sig} · ${elapsedSec}s`;
        flashSubmitResult();
        showToast(`Submitted ✓ · confidence ${level} · ${elapsedSec}s`, "success", 5200);
      }
      state.tokens = [];
      state.lastValidationErrors = [];
      state.aiBaselineTokens = null;
      state.aiConfidence = null;
      state.aiNotes = "";
      renderChips();
      syncSequenceInput();
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
    syncSequenceInput();
  });
  trainOptions.addEventListener("change", () => {
    const selected = trainOptions.options[trainOptions.selectedIndex];
    setTrainSelection(selected?.value || "", selected?.textContent || "");
    saveDraft();
    syncSequenceInput();
    fetchLastKnown();
  });

  sourceType.addEventListener("change", () => {
    saveDraft();
    updateDefaultsStatus();
  });
  trainNoHint.addEventListener("input", () => {
    const hint = trainNoHint.value.trim();
    const hd = digitsOnlyTrainNo(hint);
    const ld = listSelectionTrainNo();
    if (trainServiceIdInput.value.trim() && hd && ld && hd !== ld) {
      resetTrainServicePickUi();
    }
    saveDraft();
    syncSequenceInput();
  });
  trainNameHint.addEventListener("input", () => {
    saveDraft();
    syncSequenceInput();
  });
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

  try {
    const storedCompact = localStorage.getItem(COMPACT_STORAGE_KEY);
    if (storedCompact === "1" || storedCompact === "0") {
      state.compactView = storedCompact === "1";
    }
  } catch (_) {
    /* ignore */
  }
  applyCompactUi();
  if (compactToggle) {
    compactToggle.addEventListener("change", () => {
      state.compactView = Boolean(compactToggle.checked);
      applyCompactUi();
      saveDraft();
    });
  }

  initSpeedPrefixBar();
  initQuickAdd();
  renderChips();
  syncSequenceInput();
  renderIssues();
  renderAiInfo();
  renderRecentList();
  loadDraft();
  const params = new URLSearchParams(window.location.search);
  const qsTrain = (params.get("train") || "").trim();
  const qsJourney = (params.get("journey") || params.get("journeyDate") || "").trim();
  if (qsTrain) {
    trainNoHint.value = qsTrain;
    trainSearchInput.value = qsTrain;
    resetTrainServicePickUi();
  }
  if (qsJourney) {
    const j = qsJourney.slice(0, 10).replace(/[^\d-]/g, "");
    if (j) journeyHint.value = j;
  }
  syncSequenceInput();

  const qsStation = params.get("station");
  if (qsStation) reportStationInput.value = qsStation.toUpperCase();
  const shareTokenBoot = (params.get("share_token") || "").trim();
  const bootChain = loadTrainServices().then(fetchLastKnown);
  if (shareTokenBoot) {
    bootChain
      .then(() => consumeShareFromToken(shareTokenBoot))
      .finally(() => {
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("share_token");
          history.replaceState({}, "", u.pathname + u.search + u.hash);
        } catch (_) {
          /* ignore */
        }
      });
  }
})();
