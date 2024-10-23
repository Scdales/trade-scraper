from src.redis import Redis
import os
import asyncio
from src.bollinger_calc import bollinger_calc

print('Starting')
REDIS_HOST = os.getenv('REDIS_HOST')
REDIS_HOST = 'localhost' if REDIS_HOST == 'localhost' else 'cache'
redis = Redis(REDIS_HOST)


async def main():
    await redis.create_async_reader(REDIS_HOST)
    await redis.subscribe(bollinger_calc)
    print('Main Finished')


if __name__ == '__main__':
    print('Running')
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
