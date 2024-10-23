import {
  Label,
  RedisTimeSeriesFactory,
  Sample
} from 'redis-time-series-ts'
import { createClient, RedisClientType } from 'redis'

const REDIS_PASSWORD = process.env.REDIS_PASSWORD

const options = {
  port: 6379,
  host: process.env.REDIS_HOST === 'localhost' ? 'localhost' : 'cache', // localhost | cache
  password: REDIS_PASSWORD
}

const KEY_SPACE_PREFIX = '__keyspace*__:'
// STOPWORD = 'STOP'
// __keyspace@0__:CS.D.CRYPTOB10.CFD.IP:BID:1_MIN:LAST -> CS.D.CRYPTOB10.CFD.IP
// const keyspaceEventRegex = /(?<=__keyspace@0__:).*(?=:BID:1_MIN:LAST)/

type TfunctionOnTrigger = (channel: any, message: any) => void

class Redis {
  factory: RedisTimeSeriesFactory
  redisTimeSeries: any
  redis: RedisClientType | null
  subscriberRedis: RedisClientType | null

  async connectRedis() {
    const url = `redis://default:${REDIS_PASSWORD}@${options.host}:6379`

    const client = await createClient({ url })
    const subscriberRedis = await createClient({ url })

    client.on('error', err => console.error(`Redis Error: ${err}`))
    subscriberRedis.on('error', err => console.error(`Subscriber Redis Error: ${err}`))
    client.on('connect', () => console.info('Redis connected'))
    subscriberRedis.on('connect', () => console.info('Subscriber Redis connected'))
    client.on('reconnecting', () => console.info('Redis reconnecting'))
    subscriberRedis.on('reconnecting', () => console.info('Subscriber Redis reconnecting'))
    client.on('ready', () => console.log('Redis ready!'))
    subscriberRedis.on('ready', () => console.log('Subscriber Redis ready!'))

    await client.connect()
    await subscriberRedis.connect()

    this.redis = client as RedisClientType
    this.subscriberRedis = subscriberRedis as RedisClientType
  }

  constructor() {
    this.factory = new RedisTimeSeriesFactory(options)
    this.redisTimeSeries = this.factory.create()
    this.redis = null
    this.subscriberRedis = null
  }

  async set(key, value) {
    await this.redis?.set(key, value)
  }

  async get(key): Promise<any> {
    return this.redis?.get(key)
  }

  async del(key): Promise<any> {
    return this.redis?.del(key)
  }

  async mGet(keys: string[]) {
    return this.redis?.mGet(keys)
  }

  async exists(key: string | string[]) {
    return this.redis?.exists(key)
  }

  async scan(pattern: string): Promise<{ cursor: number; keys: string[]; } | undefined> {
    return this.redis?.scan(0, { COUNT: 10000, MATCH: pattern })
  }

  async subscribe(epic: string, functionOnTrigger: TfunctionOnTrigger): Promise<any> {
    const subscribeKeyspaceKey = KEY_SPACE_PREFIX + epic
    console.log('Listening for', subscribeKeyspaceKey)
    this.subscriberRedis?.pSubscribe(subscribeKeyspaceKey, functionOnTrigger)
  }

  async unsubscribe(epic: string) {
    const subscribeKeyspaceKey = KEY_SPACE_PREFIX + epic
    console.log('Unsubscribeing for', subscribeKeyspaceKey)
    return this.subscriberRedis?.pUnsubscribe(subscribeKeyspaceKey)
  }

  async tsWrite(key, value, timestamp): Promise<void> {
    await this.redisTimeSeries.add(new Sample(key, value, timestamp))
  }

  async tsGet(key: string): Promise<Sample> {
    return this.redisTimeSeries.get(key)
  }

  async createTimeSeries(epic = 'CS.D.CRYPTOB10.CFD.IP', labels: [Label]): Promise<void> {
    await this.redisTimeSeries.create(epic, labels)
  }

  async disconnect(): Promise<void> {
    await this.redisTimeSeries.disconnect()
    await this.redis?.disconnect()
    await this.subscriberRedis?.disconnect()
  }
}

export default Redis
