import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFilters,
  formatNumber,
  formatPercent,
  getExchangeOptions,
  renderRow,
  sortRows,
} from "../../site/app.js";

const rows = [
  {
    exchange: "SHFE",
    name: "螺纹钢",
    symbol: "RB0",
    date: "2026-07-02",
    close: 3200.5,
    change_pct: 0.0123,
    amplitude_pct: 0.0312,
    vol_20: 0.2812,
    vol_60: 0.2431,
    vol_percentile: 0.87,
    status: "正常",
  },
  {
    exchange: "DCE",
    name: "豆粕",
    symbol: "M0",
    date: "2026-07-02",
    close: 2860,
    change_pct: -0.004,
    amplitude_pct: 0.015,
    vol_20: 0.18,
    vol_60: 0.21,
    vol_percentile: 0.41,
    status: "正常",
  },
];

test("formatPercent formats decimals as percent strings", () => {
  assert.equal(formatPercent(0.1234), "12.34%");
  assert.equal(formatPercent(null), "-");
});

test("formatNumber keeps compact numeric output", () => {
  assert.equal(formatNumber(3200.5678), "3,200.57");
  assert.equal(formatNumber(undefined), "-");
});

test("applyFilters filters by exchange and search text", () => {
  const result = applyFilters(rows, { exchange: "DCE", query: "豆" });

  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "M0");
});

test("sortRows sorts numeric fields descending by default", () => {
  const result = sortRows(rows, "vol_20", "desc");

  assert.equal(result[0].symbol, "RB0");
  assert.equal(result[1].symbol, "M0");
});

test("getExchangeOptions returns all option plus sorted exchanges", () => {
  assert.deepEqual(getExchangeOptions(rows), ["ALL", "DCE", "SHFE"]);
});

test("renderRow includes status and formatted percentages", () => {
  const html = renderRow(rows[0]);

  assert.match(html, /螺纹钢/);
  assert.match(html, /28.12%/);
  assert.match(html, /正常/);
});
