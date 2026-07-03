import math
import statistics


def _to_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def log_returns(closes):
    returns = []
    for previous, current in zip(closes, closes[1:]):
        previous_value = _to_float(previous)
        current_value = _to_float(current)
        if previous_value is None or current_value is None:
            continue
        if previous_value <= 0 or current_value <= 0:
            continue
        returns.append(math.log(current_value / previous_value))
    return returns


def annualized_volatility(returns, window, trading_days=252):
    clean_returns = [_to_float(item) for item in returns]
    clean_returns = [item for item in clean_returns if item is not None]
    if window < 2 or len(clean_returns) < window:
        return None
    sample = clean_returns[-window:]
    return statistics.stdev(sample) * math.sqrt(trading_days)


def daily_change(current_close, previous_close):
    current = _to_float(current_close)
    previous = _to_float(previous_close)
    if current is None or previous is None or previous <= 0:
        return None
    return current / previous - 1


def amplitude(high, low, previous_close):
    high_value = _to_float(high)
    low_value = _to_float(low)
    previous = _to_float(previous_close)
    if high_value is None or low_value is None or previous is None or previous <= 0:
        return None
    return (high_value - low_value) / previous


def percentile_rank(values, current):
    current_value = _to_float(current)
    clean_values = [_to_float(item) for item in values]
    clean_values = [item for item in clean_values if item is not None]
    if current_value is None or not clean_values:
        return None
    below_or_equal = sum(1 for item in clean_values if item <= current_value)
    return below_or_equal / len(clean_values)


def rolling_volatility_series(returns, window, trading_days=252):
    series = []
    for index in range(window, len(returns) + 1):
        value = annualized_volatility(returns[:index], window, trading_days)
        if value is not None:
            series.append(value)
    return series


def _round_optional(value, digits=6):
    if value is None:
        return None
    return round(value, digits)


def _valid_candles(candles):
    valid = []
    for candle in candles:
        close = _to_float(candle.get("close"))
        high = _to_float(candle.get("high"))
        low = _to_float(candle.get("low"))
        if close is None or close <= 0:
            continue
        valid.append(
            {
                "date": str(candle.get("date", "")),
                "open": _to_float(candle.get("open")),
                "high": high,
                "low": low,
                "close": close,
                "volume": _to_float(candle.get("volume")),
            }
        )
    return valid


def build_metric_row(exchange, name, symbol, candles):
    valid = _valid_candles(candles)
    latest = valid[-1] if valid else {}
    previous = valid[-2] if len(valid) >= 2 else {}
    closes = [item["close"] for item in valid]
    returns = log_returns(closes)

    vol_20 = annualized_volatility(returns, 20)
    vol_60 = annualized_volatility(returns, 60)
    rolling_20 = rolling_volatility_series(returns, 20)
    vol_percentile = percentile_rank(rolling_20[-252:], vol_20) if vol_20 else None
    change_pct = daily_change(latest.get("close"), previous.get("close"))
    amplitude_pct = amplitude(latest.get("high"), latest.get("low"), previous.get("close"))

    status = "正常" if vol_20 is not None and vol_60 is not None else "数据不足"

    return {
        "exchange": exchange,
        "name": name,
        "symbol": symbol,
        "date": latest.get("date"),
        "close": _round_optional(latest.get("close"), 4),
        "change_pct": _round_optional(change_pct),
        "amplitude_pct": _round_optional(amplitude_pct),
        "vol_20": _round_optional(vol_20),
        "vol_60": _round_optional(vol_60),
        "vol_percentile": _round_optional(vol_percentile),
        "status": status,
    }
