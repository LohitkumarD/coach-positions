const LS_TRAIN_QUERY = "coach_board_train_query_v1";

const boardCards = document.getElementById("boardCards");
const stationInput = document.getElementById("stationCode");
const loadBtn = document.getElementById("loadBtn");
const alertsPanel = document.getElementById("alertsPanel");
const networkState = document.getElementById("networkState");

let currentTrainQuery = "";
let lastAlertId = 0;
/** Latest rows from composition-search (for share lookup by train id). */
let lastBoardRows = [];

function boardToast(message, variant, durationMs) {
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

function confidenceClass(conf) {
  if (conf === "high") return "high";
  if (conf === "medium") return "medium";
  return "low";
}

function escapeHtmlBoard(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** CSS modifier class for coach colour (Indian coaching stock). */
function boardCoachStyleClass(tok) {
  const t = String(tok).trim().toUpperCase();
  if (!t) return "board-coach--other";
  if (t === "ENG" || t === "LP") return "board-coach--eng";
  if (/^SLRD/.test(t)) return "board-coach--slrd";
  if (/^PC/.test(t)) return "board-coach--pc";
  if (/^GEN|^GS|^UR|^EOG/.test(t)) return "board-coach--gen";
  if (/^H\d|^HA\d/.test(t)) return "board-coach--first";
  if (/^A\d/.test(t)) return "board-coach--a";
  if (/^B\d/.test(t)) return "board-coach--b";
  if (/^D\d/.test(t)) return "board-coach--d";
  if (/^C\d|^EC\d/.test(t)) return "board-coach--chair";
  if (/^M\d/.test(t)) return "board-coach--m";
  if (/^S\d/.test(t)) return "board-coach--s";
  if (/^LPR/.test(t)) return "board-coach--lpr";
  return "board-coach--other";
}

/** Same grouping as HTML strip; used by canvas export. */
function buildCoachRuns(tokens) {
  const arr = Array.isArray(tokens) ? tokens.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!arr.length) return [];
  const runs = [];
  let currentClass = null;
  let current = [];
  arr.forEach((tok, idx) => {
    const pos = idx + 1;
    const cls = boardCoachStyleClass(tok);
    if (current.length && cls !== currentClass) {
      runs.push({ cls: currentClass, items: current });
      current = [];
    }
    currentClass = cls;
    current.push({ pos, tok });
  });
  if (current.length) runs.push({ cls: currentClass, items: current });
  return runs;
}

/** Canvas / PNG colours — keep in sync with mobile.css `.board-coach--*`. */
const BOARD_COACH_PNG_PALETTE = {
  eng: { fill: "#1d4ed8", stroke: "#1e40af", text: "#f8fafc", numFill: "rgba(255,255,255,0.28)", numText: "#ffffff" },
  slrd: { fill: "#ede9fe", stroke: "#c4b5fd", text: "#5b21b6", numFill: "rgba(91,33,182,0.15)", numText: "#5b21b6" },
  pc: { fill: "#ccfbf1", stroke: "#5eead4", text: "#0f766e", numFill: "rgba(15,118,110,0.12)", numText: "#0f766e" },
  gen: { fill: "#e2e8f0", stroke: "#cbd5e1", text: "#334155", numFill: "rgba(51,65,85,0.12)", numText: "#334155" },
  first: { fill: "#fce7f3", stroke: "#f9a8d4", text: "#9d174d", numFill: "rgba(157,23,77,0.12)", numText: "#9d174d" },
  a: { fill: "#dcfce7", stroke: "#86efac", text: "#14532d", numFill: "rgba(20,83,45,0.12)", numText: "#14532d" },
  b: { fill: "#dbeafe", stroke: "#93c5fd", text: "#1e3a8a", numFill: "rgba(30,58,138,0.12)", numText: "#1e3a8a" },
  d: { fill: "#e0f2fe", stroke: "#7dd3fc", text: "#075985", numFill: "rgba(7,89,133,0.12)", numText: "#075985" },
  chair: { fill: "#cffafe", stroke: "#67e8f9", text: "#0e7490", numFill: "rgba(14,116,144,0.12)", numText: "#0e7490" },
  m: { fill: "#fef3c7", stroke: "#fcd34d", text: "#92400e", numFill: "rgba(146,64,14,0.12)", numText: "#92400e" },
  s: { fill: "#f3e8ff", stroke: "#d8b4fe", text: "#6b21a8", numFill: "rgba(107,33,168,0.12)", numText: "#6b21a8" },
  lpr: { fill: "#ffedd5", stroke: "#fdba74", text: "#9a3412", numFill: "rgba(154,52,18,0.12)", numText: "#9a3412" },
  other: { fill: "#f1f5f9", stroke: "#e2e8f0", text: "#475569", numFill: "rgba(71,85,105,0.12)", numText: "#475569" },
};

function coachClassToPaletteKey(cls) {
  return String(cls || "").replace(/^board-coach--/, "") || "other";
}

function canvasRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

/**
 * Measure vertical space needed for coach chips (same wrapping as draw).
 */
function measureCoachStripHeight(ctx, pad, maxW, tokens) {
  const runs = buildCoachRuns(tokens);
  if (!runs.length) return 28;
  const gapChip = 5;
  const gapRun = 8;
  const lineGap = 8;
  const chipFont = 'bold 13px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.font = chipFont;
  let x = pad;
  let y = 0;
  let rowH = 0;
  function newLine() {
    x = pad;
    y += rowH + lineGap;
    rowH = 0;
  }
  for (let ri = 0; ri < runs.length; ri += 1) {
    const run = runs[ri];
    if (ri > 0) {
      if (x > pad && x + gapRun + 40 > pad + maxW) newLine();
      else x += gapRun;
    }
    for (const { tok } of run.items) {
      const codeW = ctx.measureText(tok).width;
      const numW = 22;
      const chipW = 5 + numW + 6 + codeW + 9;
      const chipH = 30;
      if (x > pad && x + chipW > pad + maxW) newLine();
      x += chipW + gapChip;
      rowH = Math.max(rowH, chipH);
    }
  }
  return y + rowH + 12;
}

/**
 * Draw coach chips (matches board CSS). Returns bottom Y (exclusive padding below strip).
 */
function drawCoachStripCanvas(ctx, pad, maxW, yStart, tokens) {
  const runs = buildCoachRuns(tokens);
  if (!runs.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = '16px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("—", pad, yStart);
    return yStart + 22;
  }

  const gapChip = 5;
  const gapRun = 8;
  const lineGap = 8;
  const chipR = 8;
  const numR = 5;
  const chipFont = 'bold 13px system-ui, "Segoe UI", Roboto, sans-serif';
  const numFont = 'bold 10px system-ui, "Segoe UI", Roboto, sans-serif';

  let x = pad;
  let y = yStart;
  let rowH = 0;

  function newLine() {
    x = pad;
    y += rowH + lineGap;
    rowH = 0;
  }

  for (let ri = 0; ri < runs.length; ri += 1) {
    const run = runs[ri];
    if (ri > 0) {
      if (x > pad && x + gapRun + 40 > pad + maxW) newLine();
      else x += gapRun;
    }
    for (const { pos, tok } of run.items) {
      const key = coachClassToPaletteKey(run.cls);
      const pal = BOARD_COACH_PNG_PALETTE[key] || BOARD_COACH_PNG_PALETTE.other;

      ctx.font = chipFont;
      const codeW = ctx.measureText(tok).width;
      const numW = 22;
      const chipW = 5 + numW + 6 + codeW + 9;
      const chipH = 30;

      if (x > pad && x + chipW > pad + maxW) newLine();

      const drawX = x;
      const drawY = y;

      ctx.fillStyle = pal.fill;
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 1;
      canvasRoundRect(ctx, drawX, drawY, chipW, chipH, chipR);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.numFill;
      canvasRoundRect(ctx, drawX + 5, drawY + 5, numW, chipH - 10, numR);
      ctx.fill();

      ctx.fillStyle = pal.numText;
      ctx.font = numFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(pos), drawX + 5 + numW / 2, drawY + chipH / 2);

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = pal.text;
      ctx.font = chipFont;
      ctx.fillText(tok, drawX + 5 + numW + 6, drawY + 7);

      x += chipW + gapChip;
      rowH = Math.max(rowH, chipH);
    }
  }

  return y + rowH;
}

/**
 * Visual coach strip: numbered positions, colour by type, consecutive same-type in one group.
 */
function buildBoardSequenceHtml(tokens) {
  const arr = Array.isArray(tokens) ? tokens.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!arr.length) {
    return '<div class="board-coach-strip board-coach-strip--empty" aria-label="Coach order"><span class="seq seq--plain">—</span></div>';
  }
  const runs = buildCoachRuns(tokens);

  const inner = runs
    .map((run) => {
      const chips = run.items
        .map(
          ({ pos, tok }) =>
            `<span class="board-coach ${run.cls}"><span class="board-coach__num">${pos}</span><span class="board-coach__code">${escapeHtmlBoard(tok)}</span></span>`
        )
        .join("");
      return `<div class="board-coach-run" role="group">${chips}</div>`;
    })
    .join("");
  return `<div class="board-coach-strip" aria-label="Coach order from engine to tail">${inner}</div>`;
}

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso;
  }
}

/** Split text into lines that fit `maxWidth` using the current `ctx.font`. */
function wrapIntoLines(ctx, text, maxWidth) {
  const t = String(text || "").trim();
  if (!t) return ["—"];
  const words = t.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (ctx.measureText(cur).width > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          const t2 = chunk + ch;
          if (ctx.measureText(t2).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t2;
          }
        }
        cur = chunk;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["—"];
}

/** Highlighted train number + name for PNG (matches board card). Returns Y below block. */
function drawTrainTitleCanvas(ctx, pad, maxW, yStart, trainNo, trainName) {
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const no = String(trainNo || "").trim();
  const nm = String(trainName || "").trim();
  let y = yStart;

  if (no) {
    const noFont = 'bold 30px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.font = noFont;
    const nw = ctx.measureText(no).width;
    const boxH = 36;
    ctx.fillStyle = "rgba(37, 99, 235, 0.16)";
    canvasRoundRect(ctx, pad - 6, y - 2, nw + 14, boxH + 6, 10);
    ctx.fill();
    ctx.fillStyle = "#1d4ed8";
    ctx.fillText(no, pad, y);
    if (nm) {
      const nmFont = 'bold 22px system-ui, "Segoe UI", Roboto, sans-serif';
      ctx.font = nmFont;
      const gap = 14;
      const nx = pad + nw + gap;
      const nmW = ctx.measureText(nm).width;
      if (nx + nmW <= pad + maxW) {
        ctx.fillStyle = "#0f172a";
        ctx.fillText(nm, nx, y + 5);
      } else {
        y += boxH + 10;
        ctx.fillStyle = "#0f172a";
        const lines = wrapIntoLines(ctx, nm, maxW);
        for (const line of lines) {
          ctx.fillText(line, pad, y);
          y += 26;
        }
        return y + 6;
      }
    }
    y += boxH + 10;
    return y;
  }
  if (nm) {
    ctx.font = 'bold 22px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = "#0f172a";
    const lines = wrapIntoLines(ctx, nm, maxW);
    for (const line of lines) {
      ctx.fillText(line, pad, y);
      y += 28;
    }
    return y + 6;
  }
  ctx.font = 'bold 26px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = "#64748b";
  ctx.fillText("Train", pad, y);
  return y + 34;
}

function drawBoardCardCanvas(row) {
  const W = 920;
  const pad = 28;
  const maxW = W - pad * 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const trainNo = row.trainNo || "";
  const trainName = row.trainName || "";
  const metaLines = [
    `Updated: ${formatDt(row.lastUpdatedAt)}`,
    `Reporter phone: ${row.updatedByPhone || "—"}`,
    `Station: ${row.stationCode || "—"}`,
    `Journey date: ${row.journeyDate || "—"}`,
  ];

  const coachCount = trainNo
    ? `Train ${trainNo} · ${(row.selectedSequence || []).length} positions`
    : `Coaches: ${(row.selectedSequence || []).length} positions`;
  const confLine = `Confidence: ${String(row.confidenceBand || "low").toUpperCase()}`;
  const footer = "Shared from the board — verify before announcing.";

  const lhMeta = 22;
  const lhSmall = 20;

  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = W;
  measureCanvas.height = 800;
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas not supported");
  const titleBlockH = drawTrainTitleCanvas(mctx, pad, maxW, 0, trainNo, trainName);
  const coachH = measureCoachStripHeight(mctx, pad, maxW, row.selectedSequence || []);

  const H =
    pad +
    titleBlockH +
    10 +
    metaLines.length * lhMeta +
    10 +
    coachH +
    8 +
    lhSmall * 2 +
    28 +
    pad;

  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";

  let y = pad;
  y = drawTrainTitleCanvas(ctx, pad, maxW, y, trainNo, trainName);
  y += 8;
  ctx.fillStyle = "#4a5568";
  ctx.font = '15px system-ui, "Segoe UI", Roboto, sans-serif';
  for (const line of metaLines) {
    ctx.fillText(line, pad, y);
    y += lhMeta;
  }
  y += 10;
  y = drawCoachStripCanvas(ctx, pad, maxW, y, row.selectedSequence || []);
  y += 8;
  ctx.font = '14px system-ui, "Segoe UI", Roboto, sans-serif';
  if (trainNo) {
    const prefix = `Train ${trainNo} · `;
    const rest = `${(row.selectedSequence || []).length} positions`;
    ctx.fillStyle = "#1d4ed8";
    ctx.font = '600 14px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(prefix, pad, y);
    ctx.fillStyle = "#718096";
    ctx.font = '14px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(rest, pad + ctx.measureText(prefix).width, y);
  } else {
    ctx.fillStyle = "#718096";
    ctx.fillText(coachCount, pad, y);
  }
  y += lhSmall;
  ctx.fillText(confLine, pad, y);
  y += lhSmall + 12;
  ctx.fillStyle = "#a0aec0";
  ctx.font = '12px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(footer, pad, y);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/png");
  });
}

async function shareBoardCardAsImage(trainServiceId) {
  const row = lastBoardRows.find((r) => Number(r.id) === Number(trainServiceId));
  if (!row) {
    boardToast("Could not find this train. Tap Load and try again.", "warning");
    return;
  }
  let blob;
  try {
    blob = await canvasToBlob(drawBoardCardCanvas(row));
  } catch (e) {
    boardToast(e.message || "Could not build image.", "warning");
    return;
  }
  const rawName = `coach-board-${row.trainNo || "train"}-${row.journeyDate || "date"}.png`;
  const fileName = rawName.replace(/[^\w.-]+/g, "_");
  const file = new File([blob], fileName, { type: "image/png" });
  const tn = String(row.trainNo || "").trim();
  const shareText = [
    tn ? `Train ${tn}${row.trainName ? ` — ${row.trainName}` : ""}` : (row.trainName || "").trim(),
    (row.selectedSequence || []).join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName, text: shareText });
      boardToast("Share sheet opened.", "success", 2800);
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  boardToast("Image downloaded — attach it from your gallery or files app.", "info", 4500);
}

function renderTrainSearchResults(rows, options) {
  const isFiltered = options && options.filtered;
  const totalAll = options && typeof options.totalCount === "number" ? options.totalCount : null;
  if (!rows || rows.length === 0) {
    lastBoardRows = [];
    boardCards.innerHTML = `
      <article class="card">
        <div><strong>No trains found</strong></div>
        <div class="meta">${
          isFiltered
            ? "Try another number or clear the box and tap Load to see all trains again."
            : "No train services in the system yet — add one from the Submit tab."
        }</div>
      </article>
    `;
    return;
  }
  lastBoardRows = rows;
  let heading;
  if (isFiltered) {
    if (totalAll != null && totalAll > rows.length) {
      heading = `<p class="meta board-list-caption"><strong>${rows.length}</strong> matching of <strong>${totalAll}</strong> train journey(s). Tap Load after clearing the box to see the full list.</p>`;
    } else {
      heading = `<p class="meta board-list-caption"><strong>${rows.length}</strong> matching train journey(s).</p>`;
    }
  } else if (totalAll != null && totalAll > rows.length) {
    heading = `<p class="meta board-list-caption">Showing <strong>${rows.length}</strong> of <strong>${totalAll}</strong> train journey(s), most recently updated first. Each row is one train (same number + journey + station stays merged).</p>`;
  } else {
    heading = `<p class="meta board-list-caption">Showing <strong>${rows.length}</strong> train journey(s), most recently updated first. Each row is one train — multiple submits for the same journey update that row.</p>`;
  }
  boardCards.innerHTML =
    heading +
    rows
      .map((row) => {
        const seqHtml = buildBoardSequenceHtml(row.selectedSequence);
        const band = row.confidenceBand || "low";
        const low = band === "low";
        const warn = low
          ? `<p class="confidence-banner confidence-banner--low">Verify before announcing — confidence is low. Use <strong>Update</strong> to resubmit coaches, or <strong>Remove my report</strong> if this row was your mistake.</p>`
          : "";
        const journeyEnc = encodeURIComponent(row.journeyDate || "");
        const trainEnc = encodeURIComponent(row.trainNo || "");
        const updateHref = `/submit?train=${trainEnc}&journey=${journeyEnc}`;
        const retractBtn =
          row.canRetractLatest === true
            ? `<button type="button" class="board-retract-btn" data-train-id="${row.id}">Remove my report</button>`
            : "";
        return `
    <article class="card board-card" data-train-id="${row.id}">
      <div class="board-card__head"><span class="board-card__train-no">${escapeHtmlBoard(String(row.trainNo || ""))}</span> <span class="meta board-card__train-name">${escapeHtmlBoard(String(row.trainName || ""))}</span></div>
      <div class="board-meta-grid">
        <div class="meta"><strong>Updated</strong> ${formatDt(row.lastUpdatedAt)}</div>
        <div class="meta"><strong>Reporter phone</strong> ${row.updatedByPhone || "—"}</div>
        <div class="meta"><strong>Station</strong> ${row.stationCode || "—"}</div>
        <div class="meta"><strong>Journey date</strong> ${row.journeyDate || "—"}</div>
      </div>
      ${seqHtml}
      <div class="meta board-coach-count">Train <span class="board-card__train-no board-card__train-no--compact">${escapeHtmlBoard(String(row.trainNo || "—"))}</span> · Coaches: ${(row.selectedSequence || []).length} positions</div>
      ${warn}
      <div class="board-card__row">
        <span class="badge ${confidenceClass(band)}">${String(band).toUpperCase()}</span>
        <button type="button" class="board-share-btn" data-train-id="${row.id}">Share as image</button>
      </div>
      <div class="board-card-actions">
        <a class="board-card-action" href="${updateHref}">Update / fix</a>
        ${retractBtn}
      </div>
    </article>
  `;
      })
      .join("");
}

async function fetchTrainBoard() {
  let url = "/api/v1/trains/composition-search?limit=500";
  if (currentTrainQuery.length > 0) {
    url += `&q=${encodeURIComponent(currentTrainQuery)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  const tcRaw = res.headers.get("X-Total-Count");
  const totalCount = tcRaw != null && tcRaw !== "" ? Number(tcRaw) : NaN;
  renderTrainSearchResults(rows, {
    filtered: currentTrainQuery.length > 0,
    totalCount: Number.isFinite(totalCount) ? totalCount : null,
  });
}

async function fetchAlerts() {
  const res = await fetch(`/api/v1/alerts?cursor=${lastAlertId}`);
  if (!res.ok) return;
  const rows = await res.json();
  if (!rows.length) return;
  lastAlertId = Math.max(...rows.map((x) => x.id), lastAlertId);
  const critical = rows.filter((x) => x.priority === "critical");
  if (critical.length) {
    const alert = critical[0];
    alertsPanel.innerHTML = `
      <article class="card alert-card">
        <div class="badge low">Critical alert</div>
        <div class="meta">Train ${alert.train_service} composition may have changed. Refresh the board.</div>
        <div class="actions">
          <button type="button" id="ackAlertBtn">Acknowledge</button>
        </div>
      </article>
    `;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const btn = document.getElementById("ackAlertBtn");
    if (btn) {
      btn.addEventListener("click", async () => {
        await fetch(`/api/v1/alerts/${alert.id}/ack`, {
          method: "POST",
          headers: { "X-CSRFToken": getCookie("csrftoken") },
        });
        alertsPanel.innerHTML = "";
      });
    }
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return "";
}

function persistTrainQuery(q) {
  try {
    localStorage.setItem(LS_TRAIN_QUERY, q);
  } catch (_) {
    /* ignore */
  }
}

function loadTrainQueryPreference() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("train");
  if (q) return q.trim();
  try {
    return (localStorage.getItem(LS_TRAIN_QUERY) || "").trim();
  } catch (_) {
    return "";
  }
}

async function retractBoardLatestSubmission(trainServiceId) {
  if (
    !window.confirm(
      "Remove your latest submission for this train? The board will recalculate from remaining reports."
    )
  ) {
    return;
  }
  try {
    const res = await fetch(`/api/v1/train-services/${trainServiceId}/retract-latest-submission`, {
      method: "DELETE",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
      credentials: "same-origin",
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) {
      boardToast(body.detail || "You can only remove your own latest report.", "warning", 5000);
      return;
    }
    if (!res.ok) {
      boardToast(body.detail || `Could not remove (${res.status})`, "warning", 5000);
      return;
    }
    boardToast("Your report was removed. Refreshing the board…", "success", 3500);
    await fetchTrainBoard();
  } catch (e) {
    boardToast(e.message || "Network error.", "error");
  }
}

if (boardCards) {
  boardCards.addEventListener("click", (ev) => {
    const share = ev.target.closest(".board-share-btn");
    if (share) {
      const id = share.getAttribute("data-train-id");
      if (id) shareBoardCardAsImage(Number(id));
      return;
    }
    const retract = ev.target.closest(".board-retract-btn");
    if (retract) {
      const id = retract.getAttribute("data-train-id");
      if (id) retractBoardLatestSubmission(Number(id));
    }
  });
}

loadBtn.addEventListener("click", async () => {
  currentTrainQuery = stationInput.value.replace(/\s+/g, "").trim();
  persistTrainQuery(currentTrainQuery);
  const url = new URL(window.location.href);
  if (currentTrainQuery) url.searchParams.set("train", currentTrainQuery);
  else url.searchParams.delete("train");
  window.history.replaceState({}, "", url);
  if (networkState) {
    networkState.textContent = "Loading";
    networkState.className = "badge neutral";
  }
  try {
    await fetchTrainBoard();
    if (networkState) {
      networkState.textContent = currentTrainQuery ? "Filtered" : "Live";
      networkState.className = "badge high";
    }
  } catch (_) {
    if (networkState) {
      networkState.textContent = "Offline";
      networkState.className = "badge warning";
    }
  }
});

setInterval(fetchAlerts, 12000);

/** Refresh the train list periodically so new journeys appear without tapping Load. */
setInterval(() => {
  fetchTrainBoard().catch(() => {
    /* ignore */
  });
}, 75000);

(async function initBoard() {
  const initial = loadTrainQueryPreference();
  if (stationInput && initial) {
    stationInput.value = initial;
    currentTrainQuery = initial.replace(/\s+/g, "").trim();
  }
  if (networkState) {
    networkState.textContent = "Loading";
    networkState.className = "badge neutral";
  }
  try {
    await fetchTrainBoard();
    if (networkState) {
      networkState.textContent = "Live";
      networkState.className = "badge high";
    }
  } catch (_) {
    if (networkState) {
      networkState.textContent = "Offline";
      networkState.className = "badge warning";
    }
  }
})();
