const DEFAULT_SORT = "vol_20";

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${(Number(value) * 100).toFixed(2)}%`;
}

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getExchangeOptions(rows) {
  const exchanges = [...new Set(rows.map((row) => row.exchange).filter(Boolean))].sort();
  return ["ALL", ...exchanges];
}

export function applyFilters(rows, filters = {}) {
  const exchange = filters.exchange || "ALL";
  const query = (filters.query || "").trim().toLowerCase();
  return rows.filter((row) => {
    const exchangeMatches = exchange === "ALL" || row.exchange === exchange;
    const text = `${row.exchange} ${row.name} ${row.symbol}`.toLowerCase();
    const queryMatches = !query || text.includes(query);
    return exchangeMatches && queryMatches;
  });
}

export function sortRows(rows, field = DEFAULT_SORT, direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (leftValue === null || leftValue === undefined) return 1;
    if (rightValue === null || rightValue === undefined) return -1;
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * multiplier;
    }
    return String(leftValue).localeCompare(String(rightValue), "zh-CN") * multiplier;
  });
}

function statusClass(status) {
  if (status === "正常") return "status-ok";
  if (status === "数据不足") return "status-warn";
  return "status-error";
}

export function renderRow(row) {
  const changeClass = Number(row.change_pct) >= 0 ? "positive" : "negative";
  return `
    <tr>
      <td>${escapeHtml(row.exchange)}</td>
      <td class="name-cell">${escapeHtml(row.name)}</td>
      <td><code>${escapeHtml(row.symbol)}</code></td>
      <td>${escapeHtml(row.date || "-")}</td>
      <td class="number">${formatNumber(row.close)}</td>
      <td class="number ${changeClass}">${formatPercent(row.change_pct)}</td>
      <td class="number">${formatPercent(row.amplitude_pct)}</td>
      <td class="number strong">${formatPercent(row.vol_20)}</td>
      <td class="number">${formatPercent(row.vol_60)}</td>
      <td class="number">${formatPercent(row.vol_percentile)}</td>
      <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
    </tr>
  `;
}

function renderSummary(summary, meta) {
  const cards = [
    ["覆盖合约", summary.total ?? 0],
    ["正常", summary.normal ?? 0],
    ["数据不足", summary.insufficient ?? 0],
    ["获取失败", summary.errors ?? 0],
  ];
  document.querySelector("[data-summary]").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");

  document.querySelector("[data-updated]").textContent = meta.generated_at
    ? new Date(meta.generated_at).toLocaleString("zh-CN", { hour12: false })
    : "-";
  document.querySelector("[data-data-date]").textContent = meta.data_date || "-";
  document.querySelector("[data-source]").textContent = meta.source || "-";
}

function renderExchangeFilter(rows) {
  const select = document.querySelector("[data-exchange-filter]");
  select.innerHTML = getExchangeOptions(rows)
    .map((exchange) => {
      const label = exchange === "ALL" ? "全部交易所" : exchange;
      return `<option value="${escapeHtml(exchange)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderTable(rows) {
  document.querySelector("[data-row-count]").textContent = `${rows.length} 条`;
  document.querySelector("[data-table-body]").innerHTML = rows.map(renderRow).join("");
}

function showMessage(message, level = "info") {
  const element = document.querySelector("[data-message]");
  element.textContent = message;
  element.dataset.level = level;
}

export function createViewModel(rows, controls) {
  const filtered = applyFilters(rows, {
    exchange: controls.exchange,
    query: controls.query,
  });
  return sortRows(filtered, controls.sortField, controls.sortDirection);
}

async function loadSnapshot() {
  const response = await fetch("data/volatility.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function init() {
  const controls = {
    exchange: "ALL",
    query: "",
    sortField: DEFAULT_SORT,
    sortDirection: "desc",
  };

  try {
    const snapshot = await loadSnapshot();
    const rows = snapshot.rows || [];
    renderSummary(snapshot.summary || {}, snapshot.meta || {});
    renderExchangeFilter(rows);

    const rerender = () => renderTable(createViewModel(rows, controls));
    document.querySelector("[data-search]").addEventListener("input", (event) => {
      controls.query = event.target.value;
      rerender();
    });
    document.querySelector("[data-exchange-filter]").addEventListener("change", (event) => {
      controls.exchange = event.target.value;
      rerender();
    });
    document.querySelector("[data-sort-field]").addEventListener("change", (event) => {
      controls.sortField = event.target.value;
      rerender();
    });
    document.querySelector("[data-sort-direction]").addEventListener("change", (event) => {
      controls.sortDirection = event.target.value;
      rerender();
    });

    rerender();
    showMessage("数据已加载，可按交易所、品种或波动率排序查看。");
  } catch (error) {
    showMessage(`数据加载失败：${error.message}`, "error");
  }
}

if (typeof document !== "undefined") {
  init();
}
