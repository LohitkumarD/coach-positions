const scoreboardBody = document.getElementById("scoreboardBody");
const scoreboardBtn = document.getElementById("scoreboardLoadBtn");
const scoreboardStation = document.getElementById("scoreboardStation");

async function loadScoreboard() {
  if (!scoreboardBody) return;
  scoreboardBody.textContent = "Loading…";
  const s = (scoreboardStation && scoreboardStation.value.trim()) || "";
  const q = s ? `?station=${encodeURIComponent(s.toUpperCase())}` : "";
  try {
    const res = await fetch(`/api/v1/contributors/scoreboard${q}`);
    if (!res.ok) {
      scoreboardBody.textContent = `Could not load (${res.status}).`;
      return;
    }
    const rows = await res.json();
    if (!rows.length) {
      scoreboardBody.textContent = "No contributors found.";
      return;
    }
    scoreboardBody.innerHTML = `<ul class="scoreboard-list">${rows
      .map(
        (r) =>
          `<li><strong>${r.username}</strong> <span class="meta">${r.station || "—"}</span> · score ${r.reliabilityScore} (${r.reliabilityEvents} events)</li>`
      )
      .join("")}</ul>`;
  } catch (e) {
    scoreboardBody.textContent = e.message || "Load failed.";
  }
}

if (scoreboardBtn) {
  scoreboardBtn.addEventListener("click", loadScoreboard);
}
