import datetime
from src.redis import Redis
import time
import pandas as pd
import traceback
from src.harmonic_functions import HarmonicDetector
from talib import SMA
import numpy as np
from scipy.stats import linregress
import requests
import math

ERROR_PERCENTAGE=0.5
TIMEDELTA_1_MIN=datetime.timedelta(days=1)
SMA_TIMEPERIOD=30

def round_to_5_decimals(num):
    return round(num, 5)

def get_regression(redis: Redis, epic: str):
    # CS.D.CRYPTOB10.CFD.IP:BID:1_MIN:LAST
    timeframe_epic = epic + ':BID' + ':1_MIN' + ':LAST'
    now_minus = date_time_milliseconds(datetime.datetime.now() - datetime.timedelta(days=1))
    time_range = redis.get_range(key=timeframe_epic, from_time=now_minus)
    numpy_array = np.array(time_range)
    if len(numpy_array) > 0:
        price_array = numpy_array[:, 1]
        price_sma = SMA(price_array, timeperiod=SMA_TIMEPERIOD)
        filtered_nan_sma_array = price_sma[~np.isnan(price_sma)]
        x = np.arange(1, len(filtered_nan_sma_array)+1)
        if len(x) and len(filtered_nan_sma_array):
            res = linregress(x, filtered_nan_sma_array)
            # print(f'Equation for timeframe {timeframe}: {res[0]:.3f} * t + {res[1]:.3f}, R^2: {res[2] ** 2:.2f} ')
            return res.slope if res.slope else 0
    return 0

def date_time_milliseconds(date_time_obj):
    return int(time.mktime(date_time_obj.timetuple()))

def are_lengths_eq(open, high, low, close, vol):
    if not len(open) == len(high) == len(low) == len(close) == len(vol):
        print(f'Lengths not equal - open:{len(open)} high:{len(high)} low:{len(low)} close:{len(close)} vol:{len(vol)}')
        return False
    return True

def kline_to_df(arr) -> pd.DataFrame:
    kline = pd.DataFrame(
        arr,
        columns=['date', 'open', 'high', 'low', 'close', 'volume'])
    kline.index = pd.to_datetime(kline.date, unit='ms')
    kline.drop('date', axis=1, inplace=True)
    kline['open'] = kline['open'].astype(float)
    kline['high'] = kline['high'].astype(float)
    kline['low'] = kline['low'].astype(float)
    kline['close'] = kline['close'].astype(float)
    kline['volume'] = kline['volume'].astype(int)
    return kline

def arr_to_kline(open, high, low, close, vol):
    # All lengths are equal by this point, using the time values of the open arr
    grouped_timeseries = []
    for i, el in enumerate(open):
        grouped_timeseries.append(
            [
                el[0],
                el[1],
                high[i][1],
                low[i][1],
                close[i][1],
                vol[i][1]
            ]
        )
    return grouped_timeseries

def get_grouped_timeframes_arr(redis, epic):
    timeframe_epic = epic + ':BID' + ':1_MIN'
    now = datetime.datetime.utcnow()
    from_time = date_time_milliseconds(now - TIMEDELTA_1_MIN)
    open = redis.get_range(key=f'{timeframe_epic}:FIRST', from_time=from_time)
    high = redis.get_range(key=f'{timeframe_epic}:MAX', from_time=from_time)
    low = redis.get_range(key=f'{timeframe_epic}:MIN', from_time=from_time)
    close = redis.get_range(key=f'{timeframe_epic}:LAST', from_time=from_time)
    vol = redis.get_range(key=f'{timeframe_epic}:COUNT', from_time=from_time)
    # if are_lengths_eq(open, high, low, close, vol):
    grouped_timeseries = arr_to_kline(open, high, low, close, vol)
    df = kline_to_df(grouped_timeseries)
    df_cleaned = df.dropna(axis=0, how='any')
    return df_cleaned
    # return None

def send_trade(redis: Redis, epic: str, harmonic_pattern):
    position = None
    if 'bullish' in harmonic_pattern[2]:
        position = 'BUY'
    elif 'bearish' in harmonic_pattern[2]:
        position = 'SELL'

    take_profit = round_to_5_decimals(harmonic_pattern[0][2][1]) # 3rd point of the harmonic points

    if position is None:
        print(f'Trade positions miscalculated for {epic} : {position} : {harmonic_pattern} : current price: {current_price}')
        return
    
    price_side = 'OFR' if position is 'BUY' else 'BID'
    current_price = redis.get_latest(epic, price_side)[1]
    if math.isnan(current_price):
        print(f'Trade position miscalculated. Current price is NaN: {current_price}')

    if position is 'BUY':
        stop_loss = current_price - (take_profit - current_price)
        if stop_loss >= current_price:
            print(f'Trade positions miscalculated for {epic} : stop loss at or above current price {position} : {harmonic_pattern} : stoploss: {stop_loss} : takeprofit: {take_profit} : current_price: {current_price}')
            return
        if take_profit <= current_price:
            print(f'Trade positions miscalculated for {epic} : take profit at or below current price {position} : {harmonic_pattern} : stoploss: {stop_loss} : takeprofit: {take_profit} : current_price: {current_price}')
            return
    else:
        stop_loss = current_price + (current_price - take_profit)
        if stop_loss <= current_price:
            print(f'Trade positions miscalculated for {epic} : stop loss at or below current price {position} : {harmonic_pattern} : stoploss: {stop_loss} : takeprofit: {take_profit} : current_price: {current_price}')
            return
        if take_profit >= current_price:
            print(f'Trade positions miscalculated for {epic} : take profit at or above current price {position} : {harmonic_pattern} : stoploss: {stop_loss} : takeprofit: {take_profit} : current_price: {current_price}')
            return

    stop_loss = round_to_5_decimals(stop_loss)

    json_payload = {'epic': epic, 'position': position, 'stopLoss': stop_loss, 'takeProfit': take_profit}
    print(f'Sending trade create: {json_payload}, current price: ${current_price}')
    trade_request = requests.post('http://trader:3000/trade', json=json_payload)
    print(f'Trade response: {trade_request.status_code} {str(trade_request.content)}')
    

def detect_harmonics(redis: Redis, epic):
    grouped_timeframe = get_grouped_timeframes_arr(redis, epic)
    if grouped_timeframe is not None:
        epoch_start_time = datetime.datetime.now()
        detector = HarmonicDetector(error_allowed=ERROR_PERCENTAGE, strict=False)
        try:
            patterns, predict_patterns = detector.search_patterns(
                grouped_timeframe,
                only_last=True,
                last_n=0,
                # plot=True,
                # predict=True,
                # save_fig_name=f'test-{datetime.datetime.utcnow()}.png'
            )
        except Exception as e:
            traceback.print_exc()
        # int(patterns[0][1][0].timestamp() * 1000) == 1698660240000 <- matches time series index
        recent_patterns = []
        if len(patterns):
            time_threshold = datetime.datetime.now() - datetime.timedelta(minutes=5)
            recent_patterns = [pat for pat in patterns if pat[1][-1] >= time_threshold]
        # if len(predict_patterns) or len(recent_patterns):
        if len(recent_patterns):
            sma_slope = get_regression(redis=redis, epic=epic)
            print('Run for: ' + epic + ' with slope: ' + str(sma_slope))
            if len(recent_patterns):
                # Order list of patterns most recent last
                # patterns.sort(key=lambda x: x[1][-1].timestamp())
                print(recent_patterns)
                for pat in recent_patterns:
                    msg = f'{pat[1]}, {pat[0]}, {pat[2]}, {pat[3]}'
                    print('Confirmed ' + pat[2] + ' pattern: ' + msg)
                    send_trade(redis, epic, pat)
            if len(predict_patterns):
                # Order list of patterns most recent last
                # predict_patterns.sort(key=lambda x: x[1][-1].timestamp())
                print(f'{len(predict_patterns)} predict_patterns found')
                # for pat in predict_patterns:
                #     msg = ', '.join([f'{p} {v}' for p, v in list(
                #         zip([str(dt) for dt in pat[1]], [p for p in pat[0]]))])
                #     msg = f'{msg} {pat[2]} {pat[3]}'
                #     print('Predict pattern: ' + msg)
            epoch_end_time = datetime.datetime.now()
            run_time = (epoch_end_time - epoch_start_time).total_seconds()
            print(f'------------|Total seconds: {run_time}s|---------------')
    else:
        print('Timeframe arrays not of equal length')
