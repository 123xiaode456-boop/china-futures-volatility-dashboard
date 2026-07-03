import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChartModel,
  filterContracts,
  filterSeriesByDate,
  findContract,
  formatNumber,
  formatPercent,
  getDefaultDateRange,
  getSeriesUrl,
} from "../../site/app.js";

const contracts = [
  { exchange: "SHFE", name: "螺纹钢", symbol: "RB0", first_date: "2020-01-02", latest_date: "2026-07-02", status: "正常" },
  { exchange: "DCE", name: "豆粕", symbol: "M0", first_date: "2000-07-17", latest_date: "2026-07-02", status: "正常" },
  { exchange: "GFEX", name: "碳酸锂", symbol: "LC0", first_date: "2023-07-21", latest_date: "2026-07-02", status: "正常" },
];

const series = [
  { date: "2026-01-01", open: 100, high: 110, low: 95, close: 108, vol_20: 0.2, vol_60: 0.3 },
  { date: "2026-02-01", open: 108, high: 112, low: 102, close: 104, vol_20: 0.22, vol_60: 0.31 },
  { date: "2026-03-01", open: 104, high: 120, low: 101, close: 118, vol_20: 0.25, vol_60: 0.33 },
];

test("filterContracts searches by name, symbol, and exchange", () => {
  assert.deepEqual(filterContracts(contracts, "豆").map((item) => item.symbol), ["M0"]);
  assert.deepEqual(filterContracts(contracts, "lc").map((item) => item.symbol), ["LC0"]);
  assert.equal(filterContracts(contracts, "SHFE")[0].symbol, "RB0");
});

test("findContract returns selected contract or first normal contract", () => {
  assert.equal(findContract(contracts, "LC0").name, "碳酸锂");
  assert.equal(findContract(contracts, "UNKNOWN").symbol, "RB0");
});

test("filterSeriesByDate keeps inclusive date range", () => {
  const result = filterSeriesByDate(series, "2026-02-01", "2026-03-01");

  assert.deepEqual(result.map((item) => item.date), ["2026-02-01", "2026-03-01"]);
});

test("getDefaultDateRange uses contract full history", () => {
  assert.deepEqual(getDefaultDateRange(contracts[1]), {
    start: "2000-07-17",
    end: "2026-07-02",
  });
});

test("buildChartModel returns price and volatility extents", () => {
  const model = buildChartModel(series);

  assert.equal(model.points.length, 3);
  assert.equal(model.priceMin, 95);
  assert.equal(model.priceMax, 120);
  assert.equal(model.volMin, 0.2);
  assert.equal(model.volMax, 0.33);
});

test("format helpers keep financial display compact", () => {
  assert.equal(formatPercent(0.1234), "12.34%");
  assert.equal(formatPercent(null), "-");
  assert.equal(formatNumber(12345.678), "12,345.68");
});

test("getSeriesUrl builds per-contract history file path", () => {
  assert.equal(getSeriesUrl("RB0"), "data/series/RB0.json");
});
