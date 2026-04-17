const LS_TRAIN_QUERY = "coach_board_train_query_v1";

const boardCards = document.getElementById("boardCards");
const stationInput = document.getElementById("stationCode");
const loadBtn = document.getElementById("loadBtn");
const alertsPanel = document.getElementById("alertsPanel");
const networkState = document.getElementById("networkState");

const explainSheet = document.getElementById("explainSheet");
const explainBackdrop = document.getElementById("explainBackdrop");
const explainClose = document.getElementById("explainClose");
const explainBody = document.getElementById("explainBody");
const explainFooter = document.getElementById("explainFooter");
const explainConfirm = document.getElementById("explainConfirm");

let currentTrainQuery = "";
let lastAlertId = 0;
let explainTrainServiceId = null;

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const REASON_LABELS = {
  MAJORITY_MATCH: "Several independent reports pointed at this same coach order.",
  NEAR_STATION_SUPPORT: "Reports came from stations that are close on this train's route.",
  HIGH_RELIABILITY_SUPPORT: "People who usually report reliably supported this reading.",
  RUNNER_UP_GAP: "This order scored clearly ahead of the next-best alternative.",
};

const METRIC_LABELS = {
  freqScore: "Different reporters",
  sourceScore: "How trustworthy the report types are (field check, TTE, etc.)",
  freshnessScore: "How recent the sightings are",
  proximityScore: "How close the reporting station is on the route",
  contributorScore: "Reporter track record",
  penaltyScore: "Penalty if any line was marked invalid",
};

function explainBandCopy(band, score) {
  const b = String(band || "low").toLowerCase();
  const s = score != null && score !== "" ? Number(score) : NaN;
  const gap = Number.isFinite(s) ? `The gap between the top choice and the runner-up is ${s}.` : "";
  let title = "Confidence";
  let text = "";
  if (b === "high") {
    title = "High confidence";
    text =
      "Enough agreement and separation from other readings that you can normally rely on this list for operations. " +
      gap;
  } else if (b === "medium") {
    title = "Medium confidence";
    text =
      "Usually fine to use, but glance at the coach list once more before you announce it, especially if the train is about to arrive. " +
      gap;
  } else {
    title = "Low confidence";
    text =
      "There are not many matching reports, or another coach order is almost as likely. Treat this as a draft — verify with a second source or a fresh walk-through before you announce. " +
      gap;
  }
  return { title, text, bandClass: b === "high" ? "high" : b === "medium" ? "medium" : "low" };
}

function renderScoreTable(breakup) {
  if (!breakup || typeof breakup !== "object") return "";
  const rows = [];
  for (const [k, v] of Object.entries(breakup)) {
    const label = METRIC_LABELS[k] || k;
    const num = typeof v === "number" ? (Math.abs(v) < 30 && String(v).includes(".") ? v.toFixed(2) : String(v)) : escapeHtml(String(v));
    rows.push(`<tr><th scope="row">${escapeHtml(label)}</th><td>${num}</td></tr>`);
  }
  if (!rows.length) return "";
  return `<table class="explain-metrics"><tbody>${rows.join("")}</tbody></table>`;
}

function buildExplainHtml(d) {
  const seq = Array.isArray(d.selected_sequence) ? d.selected_sequence.join(" ") : "";
  const band = explainBandCopy(d.confidence_band, d.confidence_score);
  const codes = Array.isArray(d.reason_codes) ? d.reason_codes : [];
  const bullets = codes
    .map((c) => {
      const label = REASON_LABELS[c];
      return label ? `<li>${escapeHtml(label)}</li>` : `<li><code>${escapeHtml(c)}</code></li>`;
    })
    .join("");
  const top = d.reason_details && d.reason_details.topScoreBreakup;
  const runner = d.reason_details && d.reason_details.runnerUpScoreBreakup;
  const support = typeof d.support_count === "number" ? d.support_count : null;
  const supportLine =
    support != null
      ? `<p class="meta" style="margin:0 0 10px"><strong>Matching reports</strong> ${support}</p>`
      : "";
  const technicalJson =
    d.reason_details && typeof d.reason_details === "object"
      ? JSON.stringify(d.reason_details, null, 2)
      : String(d.reason_details || "—");
  const runnerBlock =
    runner && typeof runner === "object" && Object.keys(runner).length
      ? `<h3 class="explain-band__title" style="margin:14px 0 6px;font-size:15px">Runner-up (for supervisors)</h3>${renderScoreTable(runner)}`
      : "";
  return `
    <div class="explain-band explain-band--${band.bandClass}">
      <h3 class="explain-band__title">${escapeHtml(band.title)}</h3>
      <p class="explain-band__text">${escapeHtml(band.text)}</p>
    </div>
    ${supportLine}
    <p class="meta" style="margin:0 0 6px"><strong>Coach order shown on the board</strong></p>
    <p class="explain-seq">${escapeHtml(seq || "—")}</p>
    ${
      bullets
        ? `<p class="meta" style="margin:0 0 6px"><strong>Why the system leaned this way</strong></p><ul class="explain-bullets">${bullets}</ul>`
        : `<p class="meta">No extra reason flags beyond the scores below.</p>`
    }
    <h3 class="explain-band__title" style="margin:14px 0 6px;font-size:15px">How the score was built</h3>
    ${renderScoreTable(top)}
    ${runnerBlock}
    <details class="explain-technical">
      <summary>Technical details (JSON)</summary>
      <pre class="explain-pre">${escapeHtml(technicalJson)}</pre>
    </details>
    <p class="meta" style="margin:12px 0 0">Effective: ${d.effective_at ? escapeHtml(new Date(d.effective_at).toLocaleString()) : "—"}</p>
  `;
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

function renderTrainSearchResults(rows, options) {
  const isFiltered = options && options.filtered;
  const totalAll = options && typeof options.totalCount === "number" ? options.totalCount : null;
  if (!rows || rows.length === 0) {
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
          ? `<p class="confidence-banner confidence-banner--low">Verify before announcing — confidence is low.</p>`
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
        <button type="button" class="btn-link why-btn" data-train-id="${row.id}">Why?</button>
      </div>
    </article>
  `;
      })
      .join("");

  boardCards.querySelectorAll(".why-btn").forEach((btn) => {
    btn.addEventListener("click", () => openExplain(Number(btn.getAttribute("data-train-id"))));
  });
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

async function openExplain(trainServiceId) {
  if (!explainSheet || !explainBody) return;
  explainTrainServiceId = trainServiceId;
  if (explainFooter) explainFooter.hidden = true;
  explainBody.textContent = "Loading…";
  explainSheet.hidden = false;
  try {
    const res = await fetch(`/api/v1/decisions/${trainServiceId}/explain`);
    if (!res.ok) {
      explainBody.textContent = res.status === 404 ? "No decision data yet for this train." : `Error ${res.status}`;
      return;
    }
    const d = await res.json();
    explainBody.innerHTML = buildExplainHtml(d);
    if (explainFooter) {
      explainFooter.hidden = false;
      explainFooter.dataset.trainServiceId = String(trainServiceId);
      explainFooter.dataset.snapshotId = String(d.id != null ? d.id : "");
    }
  } catch (e) {
    explainBody.textContent = e.message || "Could not load explanation.";
  }
}

function closeExplain() {
  if (explainSheet) explainSheet.hidden = true;
  if (explainFooter) explainFooter.hidden = true;
}

if (explainBackdrop) explainBackdrop.addEventListener("click", closeExplain);
if (explainClose) explainClose.addEventListener("click", closeExplain);

if (explainConfirm && explainFooter) {
  explainConfirm.addEventListener("click", () => {
    const tid = explainFooter.dataset.trainServiceId;
    const sid = explainFooter.dataset.snapshotId;
    if (tid && sid) {
      try {
        sessionStorage.setItem(`coach_board_explain_ack_${tid}_${sid}`, new Date().toISOString());
      } catch (_) {
        /* ignore */
      }
    }
    closeExplain();
    boardToast("Recorded — you confirmed you read this summary. It does not change the published composition.", "success", 4500);
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
