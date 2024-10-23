import Redis from 'redis-wrapper'

const DEFAULT_TRADE_TIMEOUT = 1000 * 60 * 60 * 3 // 3 Hours

export const getTickKey = (epic: string, position: string) => `${epic}${position === 'BUY' ? ':BID' : ':OFR'}:TICK`
export const getTradeKey = (epic: string, position: string) => `${epic}:TRADE:${position.toLocaleUpperCase()}`

type TCloseTrade = 'TIMEOUT' | 'TAKEPROFIT' | 'STOPLOSS'

type TTrade = {
  redis: Redis
  epic: string
  position: 'BUY' | 'SELL'
  stopLoss: number
  takeProfit: number
  timeout?: number
  createdAt?: number
  onTradeClose: () => void
}

class Trade {
  redis: Redis
  epic: string
  position: 'BUY' | 'SELL'
  stopLoss: number
  takeProfit: number
  timeout: number
  createdAt: number
  latestPrice: number | undefined
  onTradeClose: () => void

  logTradeInfo(reason: TCloseTrade | 'CREATE', openClose: 'OPEN' | 'CLOSE', extraInfo: string): void {
    console.log(`${this.epic}: "${openClose}" - "${reason}". Created: ${this.createdAt}. Position: ${this.position}. TP: ${this.takeProfit}. SL: ${this.stopLoss}. Latest Price: ${this.latestPrice}. Timeout: ${this.timeout}.${extraInfo ? ` ${extraInfo}` : ''}`)
  }

  constructor({ epic, position, stopLoss, takeProfit, timeout = DEFAULT_TRADE_TIMEOUT, redis, createdAt, onTradeClose }: TTrade) {
    this.epic = epic
    this.position = position
    this.stopLoss = stopLoss
    this.takeProfit = takeProfit
    this.timeout = timeout
    this.redis = redis
    this.createdAt = createdAt || new Date().getTime()
    this.latestPrice = undefined
    this.onTradeClose = onTradeClose

    const closeTradeAt = this.createdAt + timeout
    const remainingTime = closeTradeAt - new Date().getTime()
    if (remainingTime <= 0) {
      this.closeTrade('TIMEOUT')
    } else {
      this.createTrade()
      this.subscribe()

      setTimeout(() => {
        this.closeTrade('TIMEOUT')
      }, remainingTime)

      this.redis.tsGet(getTickKey(this.epic, this.position)).then((latestSample) => {
        return latestSample.getValue()
      }).then((latestPrice) => {
        this.latestPrice = latestPrice
        this.logTradeInfo('CREATE', 'OPEN', `Will timeout at: ${closeTradeAt}. Or: ${new Date(closeTradeAt)}`)
      })
    }
  }

  async checkPriceUpdate(message, channel) {
    // console.log(`Channel ${channel} sent message: ${message}`)
    const latestSample = await this.redis.tsGet(getTickKey(this.epic, this.position))
    const latestPrice = await latestSample.getValue()
    this.latestPrice = latestPrice
    // console.log(this.epic, 'LATEST PRICE:', latestPrice)
    const hitTakeProfit = this.position === 'BUY' ? latestPrice >= this.takeProfit : latestPrice <= this.takeProfit
    const hitStopLoss = this.position === 'BUY' ? latestPrice <= this.stopLoss : latestPrice >= this.stopLoss
    if (hitTakeProfit) {
      // console.log(this.epic, 'hit take profit at', latestPrice)
      this.closeTrade('TAKEPROFIT')
    } else if (hitStopLoss) {
      // console.log(this.epic, 'hit stop loss at', latestPrice)
      this.closeTrade('STOPLOSS')
    }
  }

  createTradePayload(): string {
    const { redis, onTradeClose, ...classKeys } = this
    return JSON.stringify(classKeys)
  }

  async subscribe() {
    // this.redis.subscribe(getTickKey(this.epic, this.position), this.checkPriceUpdate.bind(this))
    this.redis.subscribe(getTickKey(this.epic, this.position), (m, c) => this.checkPriceUpdate(m, c))
  }

  async createTrade() {
    // console.log('Creating trade tracker for:', this.epic)
    this.redis.set(getTradeKey(this.epic, this.position), this.createTradePayload())
  }

  async updateTrade() {
    console.log('Updating trade tracker for:', this.epic)
  }

  async closeTrade(reason: TCloseTrade) {
    this.logTradeInfo(reason, 'CLOSE', `At: ${new Date().toUTCString()}`)
    // console.log('Closing trade tracker for:', this.epic, 'for reason:', reason, 'at:', new Date().toUTCString())
    this.redis.del(getTradeKey(this.epic, this.position))
    this.redis.unsubscribe(getTickKey(this.epic, this.position))
    this.onTradeClose()
  }

  async deleteTrade() {
    console.log('Deleting trade tracker for:', this.epic)
    await this.redis.del(getTradeKey(this.epic, this.position))
    await this.redis.unsubscribe(getTickKey(this.epic, this.position))
    this.onTradeClose()
  }
}

export default Trade
