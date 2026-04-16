const stationInput = document.getElementById("stationCode");
const refreshBtn = document.getElementById("refreshBtn");
const conflictCards = document.getElementById("conflictCards");

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return "";
}

const csrfHeaders = () => ({
  "Content-Type": "application/json",
  "X-CSRFToken": getCookie("csrftoken"),
});

async function refresh() {
  const station = stationInput.value.trim().toUpperCase();
  const url = station ? `/api/v1/conflicts?station=${encodeURIComponent(station)}` : "/api/v1/conflicts";
  const res = await fetch(url);
  if (!res.ok) return;
  const rows = await res.json();
  conflictCards.innerHTML = rows.map((row) => {
    const candidates = (row.top_candidates || []).map((c) => `
      <label class="meta" style="display:block;margin:4px 0;">
        <input type="radio" name="cand-${row.id}" value="${c.hash || ""}" />
        ${(c.sequence || []).join(" ")} (score ${c.score || 0})
      </label>
    `).join("");
    return `
      <article class="card">
        <div><strong>Train Service #${row.train_service}</strong></div>
        <div class="badge low">${row.status.toUpperCase()}</div>
        ${candidates}
        <div class="actions">
          <button data-resolve="${row.id}">Resolve</button>
          <button data-override="${row.id}">Override</button>
          <button data-lock="${row.id}">Lock 20m</button>
        </div>
      </article>
    `;
  }).join("");

  conflictCards.querySelectorAll("button[data-resolve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-resolve");
      await fetch(`/api/v1/conflicts/${id}/resolve`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ resolutionNote: "Resolved after station verification." }),
      });
      refresh();
    });
  });

  conflictCards.querySelectorAll("button[data-override]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-override");
      const selected = document.querySelector(`input[name="cand-${id}"]:checked`);
      if (!selected) return;
      await fetch(`/api/v1/conflicts/${id}/override`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ candidateHash: selected.value, reason: "Supervisor override from conflict console" }),
      });
      refresh();
    });
  });

  conflictCards.querySelectorAll("button[data-lock]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-lock");
      await fetch(`/api/v1/conflicts/${id}/lock`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ minutes: 20, reason: "Temporary lock pending field confirmation" }),
      });
      refresh();
    });
  });
}

refreshBtn.addEventListener("click", refresh);
setInterval(refresh, 15000);
