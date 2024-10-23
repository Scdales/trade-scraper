import redis, os, pandas as pd

REDIS_HOST = os.getenv('REDIS_HOST')
REDIS_HOST = 'cache' if REDIS_HOST != 'localhost' else 'localhost'
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')

# TS.RANGE CS.D.GBPUSD.CFD.IP:BID:TICK 1699911000000 1700244000000
# FROM_TIME = 1699911000000 # new Date('November 13, 2023 21:30:00')
# TO_TIME = 1700244000000 # new Date('November 17, 2023 18:00:00')
TO_TIME = 1702154134908
FROM_TIME = 1701549395167

redis_client = redis.Redis(host=REDIS_HOST, port=6379, password=REDIS_PASSWORD)
rts = redis_client.ts()

def kline_to_df(arr) -> pd.DataFrame:
    kline = pd.DataFrame(
        arr,
        columns=['datetime', 'open', 'high', 'low', 'close', 'volume'])
    kline['datetime'] = pd.to_datetime(kline['datetime'], unit='ms')
    # kline.drop('date', axis=1, inplace=True)
    # kline['open'] = kline['open'].astype(float)
    # kline['high'] = kline['high'].astype(float)
    # kline['low'] = kline['low'].astype(float)
    # kline['close'] = kline['close'].astype(float)
    # kline['volume'] = kline['volume'].astype(int)
    # return kline
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

def get_grouped_timeframes_arr(epic, from_time, to_time):
    timeframe_epic = epic + ':BID' + ':1_MIN'
    open = rts.range(key=f'{timeframe_epic}:FIRST', from_time=from_time, to_time=to_time)
    high = rts.range(key=f'{timeframe_epic}:MAX', from_time=from_time, to_time=to_time)
    low = rts.range(key=f'{timeframe_epic}:MIN', from_time=from_time, to_time=to_time)
    close = rts.range(key=f'{timeframe_epic}:LAST', from_time=from_time, to_time=to_time)
    vol = rts.range(key=f'{timeframe_epic}:COUNT', from_time=from_time, to_time=to_time)
    # if are_lengths_eq(open, high, low, close, vol):
    grouped_timeseries = arr_to_kline(open, high, low, close, vol)
    df = kline_to_df(grouped_timeseries)
    df_cleaned = df.dropna(axis=0, how='any')
    return df_cleaned

def get_test_data(epic = 'CS.D.GBPUSD.CFD.IP', from_time = FROM_TIME, to_time = TO_TIME):
    return get_grouped_timeframes_arr(epic, from_time, to_time)
