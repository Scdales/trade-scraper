import numpy as np
from talib import SMA, BBANDS
import time
import datetime
from scipy.stats import linregress
from src.redis import Redis

# https://github.com/TA-Lib/ta-lib-python/blob/master/docs/funcs.md


def date_time_milliseconds(date_time_obj):
    return int(time.mktime(date_time_obj.timetuple()) * 1000)

# 1_min
# 15_min
# 30_min
# 1_hour
# 4_hour
# 1_day


def get_regression(redis: Redis, epic: str, timeframe: str, now: datetime.datetime, timedelta: datetime.timedelta):
    # CS.D.CRYPTOB10.CFD.IP:BID:1_MIN:LAST
    timeframe_epic = epic + ':BID:' + timeframe + ':LAST'
    now_minus = date_time_milliseconds(now - timedelta)
    time_range = redis.get_range(key=timeframe_epic, from_time=now_minus)
    # print(f'Received {len(time_range)} rows for {timeframe}')
    numpy_array = np.array(time_range)
    if len(numpy_array) == 0:
        return None, np.array([])
    price_array = numpy_array[:, 1]
    # price_sma = SMA(price_array, timeperiod=30)
    # filtered_nan_sma_array = price_sma[~np.isnan(price_sma)]
    x = np.arange(1, len(price_array)+1)
    if len(x) and len(price_array):
        res = linregress(x, price_array)
        # print(f'Equation for timeframe {timeframe}: {res[0]:.3f} * t + {res[1]:.3f}, R^2: {res[2] ** 2:.2f} ')
        return res, price_array
    return None, price_array


def print_l_ele(arr):
    return arr[-1] if len(arr) else None

def print_r2(regression_result):
    if regression_result == None:
        return None
    string = ''

    if regression_result.slope:
        string += f'"SLOPE:{regression_result.slope}"'
    
    if regression_result.rvalue:
        string += f'-"R2:{regression_result.rvalue ** 2:.2f}"'
    

    if regression_result.pvalue:
        string += f'-"P:{regression_result.pvalue}"'


    return string


def bollinger_calc(redis: Redis, epic='CS.D.CRYPTOB10.CFD.IP'):
    # :BID:1_MIN:LAST
    now = datetime.datetime.utcnow()
    print(f'Querying for f{now}')
    regression_1_min, price_array_1_min = get_regression(
        redis,
        epic,
        '1_MIN',
        now,
        datetime.timedelta(hours=4)
    )
    # now_minus_1_hour = date_time_milliseconds(now - datetime.timedelta(hours=1))
    # time_range_1_min = redis.get_range(from_time=now_minus_1_hour)
    # numpy_array_1_min = np.array(time_range_1_min)
    # price_array_1_min = numpy_array_1_min[:, 1]

    regression_15_min, _ = get_regression(
        redis,
        epic,
        '15_MIN',
        now,
        datetime.timedelta(days=1)
    )

    regression_30_min, _ = get_regression(
        redis,
        epic,
        '30_MIN',
        now,
        datetime.timedelta(days=1)
    )

    regression_1_hour, _ = get_regression(
        redis,
        epic,
        '1_HOUR',
        now,
        datetime.timedelta(days=4)
    )

    regression_4_hour, _ = get_regression(
        redis,
        epic,
        '4_HOUR',
        now,
        datetime.timedelta(days=7)
    )

    regression_1_day, _ = get_regression(
        redis,
        epic,
        '1_DAY',
        now,
        datetime.timedelta(days=14)
    )

    # now_minus_1_day = date_time_milliseconds(now - datetime.timedelta(days=1))
    # time_range_15_min = redis.get_range(from_time=now_minus_1_day)
    # numpy_array_15_min = np.array(time_range_15_min)
    # price_array_15_min = numpy_array_15_min[:, 1]
    # time_range_30_min = redis.get_range(from_time=now_minus_1_day)
    # numpy_array_30_min = np.array(time_range_30_min)
    # price_array_30_min = numpy_array_30_min[:, 1]

    # now_minus_4_day = date_time_milliseconds(now - datetime.timedelta(days=4))
    # time_range_1_hour = redis.get_range(from_time=now_minus_4_day)
    # numpy_array_1_hour = np.array(time_range_1_hour)
    # price_array_1_hour = numpy_array_1_hour[:, 1]
    # time_range_4_hour = redis.get_range(from_time=now_minus_4_day)
    # numpy_array_4_hour = np.array(time_range_4_hour)
    # price_array_4_hour = numpy_array_4_hour[:, 1]

    # now_minus_2_week = date_time_milliseconds(now - datetime.timedelta(days=14))
    # time_range_1_day = redis.get_range(from_time=now_minus_2_week)
    # numpy_array_1_day = np.array(time_range_1_day)
    # price_array_1_day = numpy_array_1_day[:, 1]

    # sma_1_min = SMA(price_array_1_min, timeperiod=30)
    # sma_15_min = SMA(price_array_15_min, timeperiod=30)
    # sma_30_min = SMA(price_array_30_min, timeperiod=30)
    # sma_1_hour = SMA(price_array_1_hour, timeperiod=30)
    # sma_4_hour = SMA(price_array_4_hour, timeperiod=30)
    # sma_1_day = SMA(price_array_1_day, timeperiod=30)
    upperband, middleband, lowerband = BBANDS(
        price_array_1_min, timeperiod=5, nbdevup=2, nbdevdn=2, matype=0)
    
    if regression_1_min and regression_1_min.slope > 0 and regression_15_min and regression_15_min.slope > 0 and regression_30_min and regression_30_min.slope > 0 and regression_1_hour and regression_1_hour.slope > 0 and regression_4_hour and regression_4_hour.slope > 0 and regression_1_day and regression_1_day.slope > 0:
        print(epic + ' - ' + 'SIGNAL - SLOPES IN POSITIVE ORDER')
    if regression_1_min and regression_1_min.slope <= 0 and regression_15_min and regression_15_min.slope <= 0 and regression_30_min and regression_30_min.slope <= 0 and regression_1_hour and regression_1_hour.slope <= 0 and regression_4_hour and regression_4_hour.slope <= 0 and regression_1_day and regression_1_day.slope <= 0:
        print(epic + ' - ' + 'SIGNAL - SLOPES IN NEGATIVE ORDER')
        

    print(
        epic + ' - ' +
        f'1 MIN SMA:{print_r2(regression_1_min)} - ' +
        f'15 MIN SMA:{print_r2(regression_15_min)} - ' +
        f'30 MIN SMA:{print_r2(regression_30_min)} - ' +
        f'1 HOUR SMA:{print_r2(regression_1_hour)} - ' +
        f'4 HOUR SMA:{print_r2(regression_4_hour)} - ' +
        f'1 DAY SMA:{print_r2(regression_1_day)} - ' +
        f'BOLLINGER 1 MIN: Upper: {print_l_ele(upperband)}, ' +
        f'Middle: {print_l_ele(middleband)}, ' +
        f'Lower: {print_l_ele(lowerband)} - ' +
        f'CURRENT PRICE: {print_l_ele(price_array_1_min)}'

    )
    # print('Done')
