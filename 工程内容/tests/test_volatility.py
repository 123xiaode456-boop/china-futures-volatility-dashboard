import math
import statistics
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import volatility
from src import generate_data


def make_candles(count, start_close=100.0):
    rows = []
    for index in range(count):
        close = start_close + index + (index % 5) * 0.4
        rows.append(
            {
                "date": (date(2025, 1, 1) + timedelta(days=index)).isoformat(),
                "open": close - 0.5,
                "high": close + 1.2,
                "low": close - 1.0,
                "close": close,
                "volume": 1000 + index,
            }
        )
    return rows


class VolatilityCalculationTests(unittest.TestCase):
    def test_log_returns_use_adjacent_closes(self):
        result = volatility.log_returns([100.0, 105.0, 110.0])

        self.assertEqual(len(result), 2)
        self.assertAlmostEqual(result[0], math.log(105.0 / 100.0))
        self.assertAlmostEqual(result[1], math.log(110.0 / 105.0))

    def test_annualized_volatility_uses_sample_standard_deviation(self):
        returns = [0.01, -0.02, 0.03, 0.015]
        expected = statistics.stdev(returns) * math.sqrt(252)

        result = volatility.annualized_volatility(returns, 4)

        self.assertAlmostEqual(result, expected)

    def test_change_and_amplitude_are_previous_close_based(self):
        self.assertAlmostEqual(volatility.daily_change(110.0, 100.0), 0.1)
        self.assertAlmostEqual(volatility.amplitude(120.0, 90.0, 100.0), 0.3)

    def test_percentile_rank_counts_values_below_or_equal_current(self):
        result = volatility.percentile_rank([0.1, 0.2, 0.25, 0.4], 0.25)

        self.assertAlmostEqual(result, 0.75)

    def test_build_metric_row_marks_insufficient_history(self):
        row = volatility.build_metric_row(
            exchange="SHFE",
            name="螺纹钢",
            symbol="RB0",
            candles=make_candles(10),
        )

        self.assertEqual(row["status"], "数据不足")
        self.assertIsNone(row["vol_20"])
        self.assertIsNone(row["vol_60"])

    def test_build_metric_row_returns_latest_metrics(self):
        candles = make_candles(280)

        row = volatility.build_metric_row(
            exchange="DCE",
            name="豆粕",
            symbol="M0",
            candles=candles,
        )

        self.assertEqual(row["status"], "正常")
        self.assertEqual(row["exchange"], "DCE")
        self.assertEqual(row["name"], "豆粕")
        self.assertEqual(row["symbol"], "M0")
        self.assertEqual(row["date"], candles[-1]["date"])
        self.assertGreater(row["close"], 0)
        self.assertGreater(row["vol_20"], 0)
        self.assertGreater(row["vol_60"], 0)
        self.assertGreaterEqual(row["vol_percentile"], 0)
        self.assertLessEqual(row["vol_percentile"], 1)


class SnapshotBuilderTests(unittest.TestCase):
    def test_build_snapshot_contains_metadata_summary_and_sorted_rows(self):
        contracts = [
            {"exchange": "SHFE", "name": "螺纹钢", "symbol": "RB0"},
            {"exchange": "DCE", "name": "豆粕", "symbol": "M0"},
        ]
        candles_by_symbol = {
            "RB0": make_candles(280, 100.0),
            "M0": make_candles(280, 200.0),
        }

        snapshot = generate_data.build_snapshot(
            contracts=contracts,
            candles_by_symbol=candles_by_symbol,
            mode="sample",
            source="unit-test",
        )

        self.assertIn("meta", snapshot)
        self.assertIn("summary", snapshot)
        self.assertIn("rows", snapshot)
        self.assertEqual(snapshot["meta"]["mode"], "sample")
        self.assertEqual(snapshot["meta"]["source"], "unit-test")
        self.assertEqual(snapshot["summary"]["total"], 2)
        self.assertEqual(snapshot["summary"]["normal"], 2)
        self.assertEqual(len(snapshot["rows"]), 2)
        self.assertGreaterEqual(snapshot["rows"][0]["vol_20"], snapshot["rows"][1]["vol_20"])

    def test_build_snapshot_keeps_failed_contract_as_error_row(self):
        contracts = [{"exchange": "GFEX", "name": "碳酸锂", "symbol": "LC0"}]

        snapshot = generate_data.build_snapshot(
            contracts=contracts,
            candles_by_symbol={},
            mode="sample",
            source="unit-test",
        )

        self.assertEqual(snapshot["summary"]["total"], 1)
        self.assertEqual(snapshot["summary"]["errors"], 1)
        self.assertEqual(snapshot["rows"][0]["status"], "获取失败")
        self.assertEqual(snapshot["rows"][0]["symbol"], "LC0")


if __name__ == "__main__":
    unittest.main()
