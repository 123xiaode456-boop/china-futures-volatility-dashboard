import argparse
import csv
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from .contracts import CONTRACTS
    from .volatility import build_metric_row
except ImportError:
    from contracts import CONTRACTS
    from volatility import build_metric_row


def _stable_number(text, modulo):
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % modulo


def make_sample_candles(symbol, count=320):
    base = 80 + _stable_number(symbol, 180)
    trend = 0.03 + _stable_number(symbol + "trend", 11) / 300
    wave = 1.6 + _stable_number(symbol + "wave", 20) / 10
    start = datetime(2025, 1, 1)
    rows = []
    for index in range(count):
        close = base + trend * index + math.sin(index / 7) * wave + math.cos(index / 19) * wave * 0.55
        close = max(close, 1)
        spread = 0.006 + abs(math.sin(index / 5)) * 0.012
        rows.append(
            {
                "date": (start + timedelta(days=index)).date().isoformat(),
                "open": round(close * (1 - spread / 3), 4),
                "high": round(close * (1 + spread), 4),
                "low": round(close * (1 - spread), 4),
                "close": round(close, 4),
                "volume": 10000 + _stable_number(symbol + str(index), 8000),
            }
        )
    return rows


def _read_csv_candles(path):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [
            {
                "date": row.get("date") or row.get("日期"),
                "open": row.get("open") or row.get("开盘"),
                "high": row.get("high") or row.get("最高"),
                "low": row.get("low") or row.get("最低"),
                "close": row.get("close") or row.get("收盘"),
                "volume": row.get("volume") or row.get("成交量"),
            }
            for row in reader
        ]


def fetch_live_candles(symbol):
    try:
        import akshare as ak
    except ImportError as exc:
        raise RuntimeError("akshare is not installed") from exc

    frame = ak.futures_zh_daily_sina(symbol=symbol)
    if frame is None or frame.empty:
        raise RuntimeError("AKShare returned empty data")

    lower_to_original = {str(column).lower(): column for column in frame.columns}

    def pick(*names):
        for name in names:
            if name in frame.columns:
                return name
            if name.lower() in lower_to_original:
                return lower_to_original[name.lower()]
        return None

    date_col = pick("date", "日期")
    open_col = pick("open", "开盘")
    high_col = pick("high", "最高")
    low_col = pick("low", "最低")
    close_col = pick("close", "收盘")
    volume_col = pick("volume", "成交量")
    required = [date_col, open_col, high_col, low_col, close_col]
    if any(column is None for column in required):
        raise RuntimeError(f"AKShare columns not recognized: {list(frame.columns)}")

    rows = []
    for _, row in frame.iterrows():
        rows.append(
            {
                "date": str(row[date_col])[:10],
                "open": row[open_col],
                "high": row[high_col],
                "low": row[low_col],
                "close": row[close_col],
                "volume": row[volume_col] if volume_col is not None else None,
            }
        )
    return rows


def build_error_row(contract, message):
    return {
        "exchange": contract["exchange"],
        "name": contract["name"],
        "symbol": contract["symbol"],
        "date": None,
        "close": None,
        "change_pct": None,
        "amplitude_pct": None,
        "vol_20": None,
        "vol_60": None,
        "vol_percentile": None,
        "status": "获取失败",
        "error": message,
    }


def build_snapshot(contracts, candles_by_symbol, mode, source):
    rows = []
    errors = []
    for contract in contracts:
        symbol = contract["symbol"]
        candles = candles_by_symbol.get(symbol)
        if not candles:
            message = "no candles available"
            rows.append(build_error_row(contract, message))
            errors.append({"symbol": symbol, "message": message})
            continue
        try:
            rows.append(
                build_metric_row(
                    exchange=contract["exchange"],
                    name=contract["name"],
                    symbol=symbol,
                    candles=candles,
                )
            )
        except Exception as exc:
            rows.append(build_error_row(contract, str(exc)))
            errors.append({"symbol": symbol, "message": str(exc)})

    rows.sort(key=lambda row: row["vol_20"] if row["vol_20"] is not None else -1, reverse=True)
    normal = sum(1 for row in rows if row["status"] == "正常")
    insufficient = sum(1 for row in rows if row["status"] == "数据不足")
    failed = sum(1 for row in rows if row["status"] == "获取失败")
    latest_dates = [row["date"] for row in rows if row.get("date")]

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "mode": mode,
            "source": source,
            "data_date": max(latest_dates) if latest_dates else None,
            "errors": errors,
        },
        "summary": {
            "total": len(rows),
            "normal": normal,
            "insufficient": insufficient,
            "errors": failed,
        },
        "rows": rows,
    }


def collect_candles(contracts, mode, csv_dir=None):
    candles_by_symbol = {}
    errors = {}
    for contract in contracts:
        symbol = contract["symbol"]
        try:
            if csv_dir:
                csv_path = Path(csv_dir) / f"{symbol}.csv"
                candles_by_symbol[symbol] = _read_csv_candles(csv_path)
            elif mode == "live":
                candles_by_symbol[symbol] = fetch_live_candles(symbol)
            else:
                candles_by_symbol[symbol] = make_sample_candles(symbol)
        except Exception as exc:
            errors[symbol] = str(exc)
    return candles_by_symbol, errors


def write_snapshot(snapshot, output):
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate commodity futures volatility JSON.")
    parser.add_argument("--mode", choices=["sample", "live"], default="sample")
    parser.add_argument("--csv-dir", default=None)
    parser.add_argument("--output", default="工程内容/site/data/volatility.json")
    args = parser.parse_args(argv)

    candles_by_symbol, fetch_errors = collect_candles(CONTRACTS, args.mode, args.csv_dir)
    snapshot = build_snapshot(
        contracts=CONTRACTS,
        candles_by_symbol=candles_by_symbol,
        mode=args.mode,
        source="AKShare futures_zh_daily_sina" if args.mode == "live" else "deterministic sample",
    )
    for symbol, message in fetch_errors.items():
        snapshot["meta"]["errors"].append({"symbol": symbol, "message": message})
    path = write_snapshot(snapshot, args.output)
    print(f"Wrote {len(snapshot['rows'])} rows to {path}")


if __name__ == "__main__":
    main()
