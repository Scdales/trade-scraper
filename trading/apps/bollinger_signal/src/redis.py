import async_timeout
import redis
import aioredis
import os
import asyncio
import time
import datetime
import re
import traceback
from threading import Thread

REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
# '__keyevent*__:ts.add:dest' || __keyspace*__:*:BID:1_MIN:LAST
KEY_EVENT = '__keyspace*__:*:BID:1_MIN:LAST'
STOPWORD = "STOP"

# Extracts the middle epic. May need updating if more redis databases are added
# __keyspace@0__:CS.D.CRYPTOB10.CFD.IP:BID:1_MIN:LAST -> CS.D.CRYPTOB10.CFD.IP
regex = r'(?<=__keyspace@0__:).*(?=:BID:1_MIN:LAST)'

# TS.RANGE CS.D.CRYPTOB10.CFD.IP:BID:TICK 1697752231804 1697838631804
# https://aioredis.readthedocs.io/en/latest/examples/#pubsub


def date_time_milliseconds(date_time_obj):
    return int(time.mktime(date_time_obj.timetuple()) * 1000)


class Redis:
    def __init__(self, host):
        self.redis = redis.Redis(host=host, port=6379,
                                 password=REDIS_PASSWORD)
        self.rts = self.redis.ts()
        print('Created redis timeseries connection')

    async def create_async_reader(self, host):
        self.aioredis = await aioredis.Redis.from_url(f'redis://default:{REDIS_PASSWORD}@{host}:6379')
        self.pubsub = self.aioredis.pubsub()
        print('Created aioredis connection')

    def get_range(self, key='CS.D.CRYPTOB10.CFD.IP:BID:1_MIN:LAST', from_time=1698578344000, to_time=None):
        if to_time is None:
            to_time = date_time_milliseconds(datetime.datetime.utcnow())
        return self.rts.range(key=key, from_time=from_time, to_time=to_time)

    async def subscribe(self, calculate_function):
        # redis-cli -a oncwo497w84joxeiudi --csv psubscribe '__keyevent*__:ts.add:dest'
        async def reader(channel: aioredis.client.PubSub):
            while True:
                try:
                    async with async_timeout.timeout(1):
                        message = await channel.get_message(ignore_subscribe_messages=True)
                        if message is not None:
                            if message["data"] == STOPWORD:
                                print("(Reader) STOP")
                                break
                            else:
                                decoded = message["channel"].decode()
                                try:
                                    epic = re.search(regex, decoded).group()
                                    thread = Thread(target=calculate_function(self, epic))
                                    thread.start()
                                except Exception as e:
                                    traceback.print_exc()
                        await asyncio.sleep(0.01)
                except asyncio.TimeoutError:
                    pass

        async with self.pubsub as p:
            await p.psubscribe(KEY_EVENT)
            await reader(p)  # wait for reader to complete
            await p.punsubscribe(KEY_EVENT)

        # closing all open connections
        await self.pubsub.close()
