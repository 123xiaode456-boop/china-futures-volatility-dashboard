const QUICK_RANGES = {
  "3m": 92,
  "6m": 183,
  "1y": 366,
};

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

export function filterContracts(contracts, query) {
  const text = (query || "").trim().toLowerCase();
  if (!text) {
    return contracts;
  }
  return contracts.filter((contract) => {
    const haystack = `${contract.exchange} ${contract.name} ${contract.symbol}`.toLowerCase();
    return haystack.includes(text);
  });
}

export function findContract(contracts, symbol) {
  return contracts.find((contract) => contract.symbol === symbol) || contracts.find((contract) => contract.status === "正常") || contracts[0];
}

export function filterSeriesByDate(series, start, end) {
  return series.filter((item) => {
    const afterStart = !start || item.date >= start;
    const beforeEnd = !end || item.date <= end;
    return afterStart && beforeEnd;
  });
}

export function getDefaultDateRange(contract) {
  return {
    start: contract?.first_date || "",
    end: contract?.latest_date || "",
  };
}

export function getSeriesUrl(symbol) {
  return `data/series/${encodeURIComponent(symbol)}.json`;
}

function extent(values) {
  const clean = values.filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
  if (!clean.length) {
    return [0, 1];
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) {
    return [min * 0.98, max * 1.02 || 1];
  }
  return [min, max];
}

export function buildChartModel(series) {
  const points = series.map((item, index) => ({ ...item, index }));
  const [rawPriceMin, rawPriceMax] = extent(points.flatMap((item) => [item.low, item.high]));
  const [volMin, volMax] = extent(points.flatMap((item) => [item.vol_20, item.vol_60]));
  const pricePadding = (rawPriceMax - rawPriceMin) * 0.08;
  const volPadding = (volMax - volMin) * 0.08;
  return {
    points,
    priceMin: rawPriceMin,
    priceMax: rawPriceMax,
    priceDomainMin: rawPriceMin - pricePadding,
    priceDomainMax: rawPriceMax + pricePadding,
    volMin,
    volMax,
    volDomainMin: Math.max(0, volMin - volPadding),
    volDomainMax: volMax + volPadding,
  };
}

function renderContractOptions(contracts) {
  return contracts
    .map(
      (contract) =>
        `<option value="${escapeHtml(contract.symbol)}">${escapeHtml(contract.name)} (${escapeHtml(contract.symbol)} / ${escapeHtml(contract.exchange)})</option>`,
    )
    .join("");
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function updateContractList(contracts, query) {
  const list = document.querySelector("[data-contract-list]");
  list.innerHTML = filterContracts(contracts, query)
    .map(
      (contract) => `
        <button type="button" data-pick-symbol="${escapeHtml(contract.symbol)}">
          <strong>${escapeHtml(contract.name)}</strong>
          <span>${escapeHtml(contract.symbol)} · ${escapeHtml(contract.exchange)}</span>
        </button>
      `,
    )
    .join("");
}

function computeQuickStart(endDate, days) {
  if (!endDate) return "";
  const date = new Date(`${endDate}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function drawGrid(ctx, area, rows) {
  ctx.strokeStyle = "#e4e9f1";
  ctx.lineWidth = 1;
  for (let i = 0; i <= rows; i += 1) {
    const y = area.y + (area.height * i) / rows;
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.width, y);
    ctx.stroke();
  }
}

function drawChart(canvas, series, contract) {
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!series.length) {
    ctx.fillStyle = "#667085";
    ctx.font = "15px Microsoft YaHei, sans-serif";
    ctx.fillText("当前日期区间没有数据", 24, 42);
    return;
  }

  const model = buildChartModel(series);
  const padding = { left: 58, right: 18, top: 24, bottom: 34 };
  const priceArea = {
    x: padding.left,
    y: padding.top,
    width: rect.width - padding.left - padding.right,
    height: Math.max(160, rect.height * 0.58),
  };
  const volArea = {
    x: padding.left,
    y: priceArea.y + priceArea.height + 38,
    width: priceArea.width,
    height: rect.height - priceArea.height - padding.top - padding.bottom - 38,
  };

  const xFor = (index) => priceArea.x + (priceArea.width * index) / Math.max(1, model.points.length - 1);
  const priceY = (value) =>
    priceArea.y +
    priceArea.height -
    ((value - model.priceDomainMin) / (model.priceDomainMax - model.priceDomainMin || 1)) * priceArea.height;
  const volY = (value) =>
    volArea.y + volArea.height - ((value - model.volDomainMin) / (model.volDomainMax - model.volDomainMin || 1)) * volArea.height;

  drawGrid(ctx, priceArea, 4);
  drawGrid(ctx, volArea, 3);

  ctx.fillStyle = "#17202a";
  ctx.font = "13px Microsoft YaHei, sans-serif";
  ctx.fillText(`${contract.name} (${contract.symbol}) 价格K线`, priceArea.x, 16);
  ctx.fillText("20日 / 60日年化波动率", volArea.x, volArea.y - 12);

  const candleWidth = Math.max(2, Math.min(10, priceArea.width / Math.max(1, model.points.length) * 0.58));
  for (const point of model.points) {
    const x = xFor(point.index);
    const rising = Number(point.close) >= Number(point.open);
    ctx.strokeStyle = rising ? "#0f7a4f" : "#b42318";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, priceY(point.high));
    ctx.lineTo(x, priceY(point.low));
    ctx.stroke();
    const top = priceY(Math.max(point.open, point.close));
    const bottom = priceY(Math.min(point.open, point.close));
    ctx.fillRect(x - candleWidth / 2, top, candleWidth, Math.max(1, bottom - top));
  }

  const drawLine = (field, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const point of model.points) {
      if (point[field] === null || point[field] === undefined) {
        continue;
      }
      const x = xFor(point.index);
      const y = volY(point[field]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };
  drawLine("vol_20", "#116b5f");
  drawLine("vol_60", "#3659a6");

  ctx.fillStyle = "#116b5f";
  ctx.fillRect(volArea.x, volArea.y + volArea.height + 14, 16, 3);
  ctx.fillStyle = "#3659a6";
  ctx.fillRect(volArea.x + 108, volArea.y + volArea.height + 14, 16, 3);
  ctx.fillStyle = "#344054";
  ctx.fillText("20日波动率", volArea.x + 22, volArea.y + volArea.height + 19);
  ctx.fillText("60日波动率", volArea.x + 130, volArea.y + volArea.height + 19);
}

function renderStats(contract, rangeSeries) {
  const latest = rangeSeries[rangeSeries.length - 1] || {};
  const first = rangeSeries[0] || {};
  setText("[data-selected-name]", contract ? `${contract.name} (${contract.symbol})` : "-");
  setText("[data-selected-range]", first.date && latest.date ? `${first.date} 到 ${latest.date}` : "-");
  setText("[data-selected-count]", `${rangeSeries.length} 根K线`);
  setText("[data-latest-close]", formatNumber(latest.close));
  setText("[data-latest-vol20]", formatPercent(latest.vol_20));
  setText("[data-latest-vol60]", formatPercent(latest.vol_60));
}

async function loadSnapshot() {
  const response = await fetch("data/volatility.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadContractSeries(symbol, cache) {
  if (cache.has(symbol)) {
    return cache.get(symbol);
  }
  const response = await fetch(getSeriesUrl(symbol), { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const series = payload.series || [];
  cache.set(symbol, series);
  return series;
}

async function init() {
  const state = {
    selectedSymbol: "",
    start: "",
    end: "",
  };
  const snapshot = await loadSnapshot();
  const contracts = snapshot.contracts || [];
  const seriesCache = new Map();
  const select = document.querySelector("[data-contract-select]");
  const search = document.querySelector("[data-contract-search]");
  const startInput = document.querySelector("[data-start-date]");
  const endInput = document.querySelector("[data-end-date]");
  const canvas = document.querySelector("[data-chart]");

  select.innerHTML = renderContractOptions(contracts);
  updateContractList(contracts, "");
  const initial = findContract(contracts, select.value);
  state.selectedSymbol = initial?.symbol || "";
  select.value = state.selectedSymbol;

  setText("[data-data-date]", snapshot.meta?.data_date || "-");
  setText("[data-updated]", snapshot.meta?.generated_at ? new Date(snapshot.meta.generated_at).toLocaleString("zh-CN", { hour12: false }) : "-");
  setText("[data-source]", snapshot.meta?.source || "-");
  setText("[data-contract-total]", `${contracts.length} 个商品`);

  function setRangeFromContract(contract) {
    const range = getDefaultDateRange(contract);
    state.start = range.start;
    state.end = range.end;
    startInput.min = range.start;
    startInput.max = range.end;
    endInput.min = range.start;
    endInput.max = range.end;
    startInput.value = range.start;
    endInput.value = range.end;
  }

  async function rerender() {
    const contract = findContract(contracts, state.selectedSymbol);
    const fullSeries = contract?.symbol ? await loadContractSeries(contract.symbol, seriesCache) : [];
    const rangeSeries = filterSeriesByDate(fullSeries, state.start, state.end);
    renderStats(contract, rangeSeries);
    drawChart(canvas, rangeSeries, contract);
  }

  setRangeFromContract(initial);
  rerender().catch((error) => {
    const message = document.querySelector("[data-message]");
    message.textContent = `历史数据加载失败：${error.message}`;
    message.dataset.level = "error";
  });

  select.addEventListener("change", () => {
    state.selectedSymbol = select.value;
    setRangeFromContract(findContract(contracts, state.selectedSymbol));
    rerender();
  });
  search.addEventListener("input", () => updateContractList(contracts, search.value));
  document.querySelector("[data-contract-list]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-pick-symbol]");
    if (!button) return;
    state.selectedSymbol = button.dataset.pickSymbol;
    select.value = state.selectedSymbol;
    setRangeFromContract(findContract(contracts, state.selectedSymbol));
    rerender();
  });
  startInput.addEventListener("change", () => {
    state.start = startInput.value;
    rerender();
  });
  endInput.addEventListener("change", () => {
    state.end = endInput.value;
    rerender();
  });
  document.querySelector("[data-quick-ranges]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-range]");
    if (!button) return;
    const contract = findContract(contracts, state.selectedSymbol);
    if (button.dataset.range === "all") {
      setRangeFromContract(contract);
    } else {
      state.end = contract.latest_date;
      state.start = computeQuickStart(state.end, QUICK_RANGES[button.dataset.range]);
      startInput.value = state.start < contract.first_date ? contract.first_date : state.start;
      state.start = startInput.value;
      endInput.value = state.end;
    }
    rerender();
  });
  window.addEventListener("resize", rerender);
}

if (typeof document !== "undefined") {
  init().catch((error) => {
    const message = document.querySelector("[data-message]");
    if (message) {
      message.textContent = `数据加载失败：${error.message}`;
      message.dataset.level = "error";
    }
  });
}
