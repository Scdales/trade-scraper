export type MarketInfo = {
  instrument: Instrument
  dealingRules: DealingRules
  snapshot: Snapshot
}

export type Instrument = {
  epic: string
  expiry: string
  name: string
  forceOpenAllowed: boolean
  stopsLimitsAllowed: boolean
  lotSize: number
  unit: string
  type: string
  controlledRiskAllowed: boolean
  streamingPricesAvailable: boolean
  marketId: string
  currencies: Currency[]
  marginDepositBands: MarginDepositBand[]
  margin: number
  slippageFactor: SlippageFactor
  openingHours?: OpeningHours
  expiryDetails?: ExpiryDetails
  rolloverDetails?: RolloverDetails
  newsCode: string
  chartCode?: string
  country?: string
  valueOfOnePip: string
  onePipMeans: string
  contractSize: string
  specialInfo: string[]
}

export type Currency = {
  code: string
  name: string
  symbol: string
  baseExchangeRate: number
  exchangeRate: number
  isDefault: boolean
}

export type MarginDepositBand = {
  min: number
  max?: number
  margin: number
}

export type SlippageFactor = {
  unit: string
  value: number
}

export type OpeningHours = {
  marketTimes: MarketTime[]
}

export type MarketTime = {
  openTime: string
  closeTime: string
}

export type ExpiryDetails = {
  lastDealingDate: string
  settlementInfo: string
}

export type RolloverDetails = {
  lastRolloverTime: string
  rolloverInfo: string
}

export type DealingRules = {
  minStepDistance: MinStepDistance
  minDealSize: MinDealSize
  minControlledRiskStopDistance: MinControlledRiskStopDistance
  minNormalStopOrLimitDistance: MinNormalStopOrLimitDistance
  maxStopOrLimitDistance: MaxStopOrLimitDistance
  controlledRiskSpacing: ControlledRiskSpacing
  marketOrderPreference: string
}

export type MinStepDistance = {
  unit: string
  value: number
}

export type MinDealSize = {
  unit: string
  value: number
}

export type MinControlledRiskStopDistance = {
  unit: string
  value: number
}

export type MinNormalStopOrLimitDistance = {
  unit: string
  value: number
}

export type MaxStopOrLimitDistance = {
  unit: string
  value: number
}

export type ControlledRiskSpacing = {
  unit: string
  value: number
}

export type Snapshot = {
  marketStatus: string
  netChange: number
  percentageChange: number
  updateTime: string
  delayTime: number
  bid?: number
  offer?: number
  high: number
  low: number
  binaryOdds: any
  decimalPlacesFactor: number
  scalingFactor: number
  controlledRiskExtraSpread: number
}
