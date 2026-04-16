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

let currentTrainQuery = "";
let lastAlertId = 0;

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
  const heading = isFiltered
    ? `<p class="meta board-list-caption"><strong>${rows.length}</strong> matching train(s)</p>`
    : `<p class="meta board-list-caption">Showing up to <strong>${rows.length}</strong> train(s), newest journey first. Use the box to filter.</p>`;
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
  let url = "/api/v1/trains/composition-search?limit=100";
  if (currentTrainQuery.length > 0) {
    url += `&q=${encodeURIComponent(currentTrainQuery)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  renderTrainSearchResults(rows, { filtered: currentTrainQuery.length > 0 });
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
  explainBody.textContent = "Loading…";
  explainSheet.hidden = false;
  try {
    const res = await fetch(`/api/v1/decisions/${trainServiceId}/explain`);
    if (!res.ok) {
      explainBody.textContent = res.status === 404 ? "No decision data yet for this train." : `Error ${res.status}`;
      return;
    }
    const d = await res.json();
    const seq = (d.selected_sequence || []).join(" ");
    const reasons = (d.reason_codes || []).join(", ") || "—";
    const details =
      d.reason_details && typeof d.reason_details === "object"
        ? JSON.stringify(d.reason_details, null, 2)
        : d.reason_details || "—";
    explainBody.innerHTML = `
      <p><strong>Confidence</strong> ${d.confidence_band} (${d.confidence_score})</p>
      <p><strong>Composition</strong> ${seq || "—"}</p>
      <p><strong>Reason codes</strong> ${reasons}</p>
      <pre class="explain-pre">${details}</pre>
      <p class="meta">Effective: ${d.effective_at ? new Date(d.effective_at).toLocaleString() : "—"}</p>
    `;
  } catch (e) {
    explainBody.textContent = e.message || "Could not load explanation.";
  }
}

function closeExplain() {
  if (explainSheet) explainSheet.hidden = true;
}

if (explainBackdrop) explainBackdrop.addEventListener("click", closeExplain);
if (explainClose) explainClose.addEventListener("click", closeExplain);

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
