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

function drawBoardCardCanvas(row) {
  const W = 920;
  const pad = 28;
  const maxW = W - pad * 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const title = `${row.trainNo || ""} ${row.trainName || ""}`.trim() || "Train";
  ctx.font = 'bold 24px system-ui, "Segoe UI", Roboto, sans-serif';
  const titleLines = wrapIntoLines(ctx, title, maxW);

  const metaLines = [
    `Updated: ${formatDt(row.lastUpdatedAt)}`,
    `Reporter phone: ${row.updatedByPhone || "—"}`,
    `Station: ${row.stationCode || "—"}`,
    `Journey date: ${row.journeyDate || "—"}`,
  ];

  const seq = (row.selectedSequence || []).join(" ");
  ctx.font = 'bold 18px system-ui, "Segoe UI", Roboto, sans-serif';
  const seqLines = wrapIntoLines(ctx, seq || "—", maxW);

  const coachCount = `Coaches: ${(row.selectedSequence || []).length} positions`;
  const confLine = `Confidence: ${String(row.confidenceBand || "low").toUpperCase()}`;
  const footer = "Shared from the board — verify before announcing.";

  const lhTitle = 32;
  const lhMeta = 22;
  const lhSeq = 24;
  const lhSmall = 20;

  const H =
    pad +
    titleLines.length * lhTitle +
    12 +
    metaLines.length * lhMeta +
    16 +
    seqLines.length * lhSeq +
    lhSmall * 2 +
    36 +
    pad;

  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";

  let y = pad;
  ctx.fillStyle = "#1e3a5f";
  ctx.font = 'bold 24px system-ui, "Segoe UI", Roboto, sans-serif';
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += lhTitle;
  }
  y += 8;
  ctx.fillStyle = "#4a5568";
  ctx.font = '15px system-ui, "Segoe UI", Roboto, sans-serif';
  for (const line of metaLines) {
    ctx.fillText(line, pad, y);
    y += lhMeta;
  }
  y += 10;
  ctx.fillStyle = "#111827";
  ctx.font = 'bold 18px system-ui, "Segoe UI", Roboto, sans-serif';
  for (const line of seqLines) {
    ctx.fillText(line, pad, y);
    y += lhSeq;
  }
  y += 6;
  ctx.fillStyle = "#718096";
  ctx.font = '14px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(coachCount, pad, y);
  y += lhSmall;
  ctx.fillText(confLine, pad, y);
  y += lhSmall + 14;
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
  const shareText = `${row.trainNo || ""} ${row.trainName || ""}\n${(row.selectedSequence || []).join(" ")}`.trim();
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
        const seq = (row.selectedSequence || []).join(" ");
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
      <div class="board-card__head"><strong>${row.trainNo}</strong> <span class="meta">${row.trainName || ""}</span></div>
      <div class="board-meta-grid">
        <div class="meta"><strong>Updated</strong> ${formatDt(row.lastUpdatedAt)}</div>
        <div class="meta"><strong>Reporter phone</strong> ${row.updatedByPhone || "—"}</div>
        <div class="meta"><strong>Station</strong> ${row.stationCode || "—"}</div>
        <div class="meta"><strong>Journey date</strong> ${row.journeyDate || "—"}</div>
      </div>
      <div class="seq">${seq || "—"}</div>
      <div class="meta">Coaches: ${(row.selectedSequence || []).length} positions</div>
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
