export type TPriceDataPacket = {
    UTM?: string
    BID?: string
    OFR?: string
    LTV?: string
    TTV?: string
}

export enum TIMEFRAME {
    TICK = 'TICK',
    '1_MIN' = '1_MIN',
    '15_MIN' = '15_MIN',
    '30_MIN' = '30_MIN',
    '1_HOUR' = '1_HOUR',
    '4_HOUR' = '4_HOUR',
    '1_DAY' = '1_DAY'
}
