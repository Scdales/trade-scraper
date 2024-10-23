import {
  Aggregation,
  AggregationType,
  Label,
  RedisTimeSeriesFactory,
  Sample
} from 'redis-time-series-ts'
import { TIMEFRAME } from '../types'
import { BID, OFR, LTV } from '../constants'
import { createClient, RedisClientType } from 'redis'

const REDIS_PASSWORD = process.env.REDIS_PASSWORD

const options = {
  port: 6379,
  host: process.env.REDIS_HOST === 'localhost' ? 'localhost' : 'cache', // localhost | cache
  password: REDIS_PASSWORD
}

const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = SECOND * 3600

const KEY_EXISTS_ERROR = 'ERR TSDB: key already exists'
const TIMESTAMP_EXISTS_ERROR = 'ERR TSDB: Error at upsert, update is not supported when DUPLICATE_POLICY is set to BLOCK mode'

export const logRedisErrorOverride = (e: any): void => {
  const errorString = e.toString()
  if (errorString.includes(KEY_EXISTS_ERROR)) {
    // console.warn(errorString.split(KEY_EXISTS_ERROR)[0] + KEY_EXISTS_ERROR)
  } else if (errorString.includes(TIMESTAMP_EXISTS_ERROR)) {
    console.warn(errorString.split(TIMESTAMP_EXISTS_ERROR)[0] + TIMESTAMP_EXISTS_ERROR)
  } else {
    console.warn('NOT DETECTED')
    console.error(e)
  }
}

class Redis {
  factory: RedisTimeSeriesFactory
  redisTimeSeries: any
  redis: RedisClientType | null

  async connectRedis() {
    const url = `redis://default:${REDIS_PASSWORD}@${options.host}:6379`

    const client = await createClient({ url })

    client.on('error', err => console.error(`Redis Error: ${err}`))
    client.on('connect', () => console.info('Redis connected'))
    client.on('reconnecting', () => console.info('Redis reconnecting'))
    client.on('ready', () => console.log('Redis ready!'))

    await client.connect()

    this.redis = client as RedisClientType
  }

  constructor () {
    this.factory = new RedisTimeSeriesFactory(options)
    this.redisTimeSeries = this.factory.create()
    this.redis = null
  }

  async write (key, value, timestamp): Promise<void> {
    try {
      await this.redisTimeSeries.add(new Sample(key, value, timestamp))
    } catch (e) {
      logRedisErrorOverride(e)
    }
  }

  createTimeframeEpic (epic: string, metric: typeof BID | typeof OFR | typeof LTV, timeframe: TIMEFRAME, aggregationType?: string): string {
    const timeframeEpic = epic + ':' + metric + ':' + timeframe
    if (aggregationType) {
      return timeframeEpic + ':' + aggregationType.toLocaleUpperCase()
    }
    return timeframeEpic
  }

  createRuleLabels (epic: string, bidOfrLtv: typeof BID | typeof OFR | typeof LTV, timeframe: TIMEFRAME, aggregationType: string): Label[] {
    return [
      new Label('EPIC', epic),
      new Label('TIMEFRAME', timeframe),
      new Label('SUBSCRIPTION', bidOfrLtv),
      new Label('AGGREGATION_TYPE', aggregationType.toLocaleUpperCase())
    ]
  }

  async createAggregation (
    epic: string,
    bidOfrLtv: typeof BID | typeof OFR | typeof LTV,
    timeframe: TIMEFRAME,
    milliseconds: number,
    aggregationType: string
  ): Promise<void> {
    const tickEpic = this.createTimeframeEpic(epic, bidOfrLtv, TIMEFRAME.TICK)
    const ruleEpic = this.createTimeframeEpic(epic, bidOfrLtv, timeframe, aggregationType)
    try {
      console.log('Creating timeseries and rule:', ruleEpic)
      await this.redisTimeSeries.create(
        ruleEpic,
        this.createRuleLabels(epic, bidOfrLtv, timeframe, aggregationType)
      )
      const aggregation = new Aggregation(aggregationType, milliseconds)
      await this.redisTimeSeries.createRule(
        tickEpic,
        ruleEpic,
        aggregation
      )
    } catch (e) {
      logRedisErrorOverride(e)
    }
  }

  async createTimeSeriesAggregates (
    epic: string,
    timeframe: TIMEFRAME,
    milliseconds: number
  ): Promise<void> {
    // Bid open
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.FIRST)
    // Bid close
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.LAST)
    // Bid minimum
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.MIN)
    // Bid maximum
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.MAX)
    // Bid count
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.COUNT)
    // Bid standard deviation sample
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.STD_S)
    // Bid variance sample
    this.createAggregation(epic, BID, timeframe, milliseconds, AggregationType.VAR_S)

    // Ofr open
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.FIRST)
    // Ofr close
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.LAST)
    // Ofr minimum
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.MIN)
    // Ofr maximum
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.MAX)
    // Ofr count
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.COUNT)
    // Ofr standard deviation sample
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.STD_S)
    // Ofr variance sample
    this.createAggregation(epic, OFR, timeframe, milliseconds, AggregationType.VAR_S)
  }

  async createTimeSeries (epic = 'CS.D.CRYPTOB10.CFD.IP'): Promise<void> {
    // Tick data
    const bidStampTick = this.createTimeframeEpic(epic, BID, TIMEFRAME.TICK)
    const ofrStampTick = this.createTimeframeEpic(epic, OFR, TIMEFRAME.TICK)
    const ltvStampTick = this.createTimeframeEpic(epic, LTV, TIMEFRAME.TICK)
    console.log('Creating timeseries:', bidStampTick)
    console.log('Creating timeseries:', ofrStampTick)
    console.log('Creating timeseries:', ltvStampTick)
    try {
      await this.redisTimeSeries.create(
        bidStampTick,
        this.createRuleLabels(bidStampTick, BID, TIMEFRAME.TICK, 'RAW')
      )
    } catch (e) {
      logRedisErrorOverride(e)
    }

    try {
      await this.redisTimeSeries.create(
        ofrStampTick,
        this.createRuleLabels(ofrStampTick, OFR, TIMEFRAME.TICK, 'RAW')
      )
    } catch (e) {
      logRedisErrorOverride(e)
    }

    try {
      await this.redisTimeSeries.create(
        ltvStampTick,
        this.createRuleLabels(ofrStampTick, LTV, TIMEFRAME.TICK, 'RAW')
      )
      this.createAggregation(epic, LTV, TIMEFRAME['1_MIN'], MINUTE, AggregationType.SUM)
      this.createAggregation(epic, LTV, TIMEFRAME['15_MIN'], MINUTE * 15, AggregationType.SUM)
      this.createAggregation(epic, LTV, TIMEFRAME['30_MIN'], MINUTE * 30, AggregationType.SUM)
      this.createAggregation(epic, LTV, TIMEFRAME['1_HOUR'], HOUR, AggregationType.SUM)
      this.createAggregation(epic, LTV, TIMEFRAME['4_HOUR'], HOUR * 4, AggregationType.SUM)
      this.createAggregation(epic, LTV, TIMEFRAME['1_DAY'], HOUR * 24, AggregationType.SUM)
    } catch (e) {
      logRedisErrorOverride(e)
    }

    // Aggregates
    this.createTimeSeriesAggregates(epic, TIMEFRAME['1_MIN'], MINUTE)
    this.createTimeSeriesAggregates(epic, TIMEFRAME['15_MIN'], MINUTE * 15)
    this.createTimeSeriesAggregates(epic, TIMEFRAME['30_MIN'], MINUTE * 30)
    this.createTimeSeriesAggregates(epic, TIMEFRAME['1_HOUR'], HOUR)
    this.createTimeSeriesAggregates(epic, TIMEFRAME['4_HOUR'], HOUR * 4)
    this.createTimeSeriesAggregates(epic, TIMEFRAME['1_DAY'], HOUR * 24)
  }

  async disconnect (): Promise<void> {
    await this.redisTimeSeries.disconnect()
  }
}

export default Redis
