from src.redis import Redis
from src.harmonic_functions import HarmonicDetector
from logging import Logger
import pandas as pd
from datetime import datetime
import csv
import warnings
warnings.simplefilter("ignore")
import asyncio
import os
from src.detector import detect_harmonics

print('Starting')
REDIS_HOST = os.getenv('REDIS_HOST')
REDIS_HOST = 'localhost' if REDIS_HOST == 'localhost' else 'cache'
redis = Redis(REDIS_HOST)

logger = Logger('Harmonic')


def kline_to_df(arr) -> pd.DataFrame:
    # Adjusted for yahoo finance
    kline = pd.DataFrame(
        arr,
        columns=['date', 'open', 'high', 'low', 'close', 'adjclose', 'volume'])
    kline.drop('adjclose', axis=1, inplace=True)
    kline.index = pd.to_datetime(kline.date, format='%Y-%m-%d')
    kline.drop('date', axis=1, inplace=True)
    kline['open'] = kline['open'].astype(float)
    kline['high'] = kline['high'].astype(float)
    kline['low'] = kline['low'].astype(float)
    kline['close'] = kline['close'].astype(float)
    kline['volume'] = kline['volume'].astype(int)
    return kline


def get_csv_data():
    # For the Yahoo finance csv
    data = []
    with open("./test-data/GOOG-Weekly.csv", 'r') as file:
        csvreader = csv.reader(file)
        for row in csvreader:
            data.append(row)
        # Remove the first row - Headers: ['Date', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']
        data = data[1:]
        return data


def old_main():
    data = get_csv_data()
    df = kline_to_df(data)
    epoch_start_time = datetime.now()
    detector = HarmonicDetector(error_allowed=.5, strict=False)
    try:
        patterns, predict_patterns = detector.search_patterns(
            df,
            only_last=False,
            last_n=4,
            plot=True,
            predict=True,
            save_fig_name='test4W.png'
        )
    except Exception as e:
        logger.error(e)
    print(patterns)
    print(predict_patterns)
    for pat in patterns:
        msg = f'patterns found: {pat[1]}, {pat[0]}, \n {pat[2]}, {pat[3]}'
        logger.info(msg)

    for pat in predict_patterns:
        msg = '\n'.join([f'{p} {v}' for p, v in list(
            zip([str(dt) for dt in pat[1]], [p for p in pat[0]]))])
        msg = f'{msg} {pat[2]} {pat[3]}'
        logger.info(msg)
    epoch_end_time = datetime.now()
    run_time = (epoch_end_time - epoch_start_time).total_seconds()
    print(f'------------|Total seconds: {run_time}s|---------------')


async def main():
    # old_main()
    await redis.create_async_reader(REDIS_HOST)
    await redis.subscribe(detect_harmonics)
    print('Main Finished')


if __name__ == '__main__':
    print('Running')
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
