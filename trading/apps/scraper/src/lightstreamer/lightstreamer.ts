import { LightstreamerClient, Subscription } from 'lightstreamer-client-node'
import type Redis from '../redis/redis'
import { type TPriceDataPacket } from '../types'
import { TIMEFRAME } from '../types'
import { BID, LTV, OFR } from '../constants'
import { baseUrl, getDefaultHeaders } from 'login'

class Lightstreamer {
  lsClient: LightstreamerClient
  redis: Redis
  cst: string | null
  xSecurityToken: string | null
  connectionStatus: string
  constructor(lightstreamerEndpoint: string, accountId: string, cst: string | null, xSecurityToken: string | null, redis: Redis) {
    this.redis = redis
    this.cst = cst
    this.xSecurityToken = xSecurityToken
    this.connectionStatus = 'DISCONNECTED'
    this.lsClient = new LightstreamerClient(lightstreamerEndpoint)
    this.lsClient.connectionDetails.setUser(accountId)
    this.lsClient.connectionDetails.setPassword('CST-' + this.cst + '|XST-' + this.xSecurityToken)
    this.lsClient.addListener({
      onListenStart: function () {
        console.log('ListenStart')
      },
      onPropertyChange: function (the) {
        console.log('property change:', the)
      },
      onStatusChange: (status) => {
        console.log('New Lightstreamer connection status:' + status)
        this.connectionStatus = status
        console.log('Assigned to this.connectionStatus:', this.connectionStatus)
      },
      onServerError: function (errorCode, errorMessage) {
        console.error('error', errorCode, errorMessage)
      }
    })
    this.lsClient.connect()
  }

  async waitForStatus(status: string) {
    const TIMEOUT = 60000
    console.log('Checking for', status, 'in', this.connectionStatus)
    if (this.connectionStatus.includes(status)) {
      console.log('connectionStatus already satisfied')
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const error = `Status update not found after ${TIMEOUT/1000} seconds`
        console.error(error)
        reject(error)
      })
      const checkVariable = () => {
        if (this.connectionStatus.includes(status)) {
          resolve(this.connectionStatus);
        } else {
          setTimeout(checkVariable, 100);
        }
      };
      checkVariable();
    });
  }

  async getMarketInfo(epics: string[]) {
    for (let i = 0; i < epics.length; i++) {
      const defaultHeaders = await getDefaultHeaders()
      const epicMarketData = await fetch(`${baseUrl}/markets/${epics[i]}`, { headers: defaultHeaders })
      const parsedEpicMarketData = await epicMarketData.json()
      // ...update to something like ${epic}:MARKETINFO
      const marketInfoEpic = `${epics[i]}:MARKETINFO`
      console.log('Writing', marketInfoEpic)
      await this.redis.redis?.set(marketInfoEpic, JSON.stringify(parsedEpicMarketData))
    }
    console.log('Finished writing market info data')
  }

  async renewLoginTokens(epics: string[]): Promise<void> {
    this.lsClient.disconnect() // subscriptions are maintained between sessions
    await this.waitForStatus('DISCONNECT')
    // console.log('connection details:')
    const defaultHeaders = await getDefaultHeaders()
    this.cst = defaultHeaders.CST
    this.xSecurityToken = defaultHeaders['X-SECURITY-TOKEN']
    const newPw = 'CST-' + this.cst + '|XST-' + this.xSecurityToken
    console.log('New pW is:', newPw)
    this.lsClient.connectionDetails.setPassword(newPw)
    this.lsClient.connect()
    await this.waitForStatus('CONNECT')
    this.getMarketInfo(epics)
  }

  subscribe(epics: string[]): void {
    // https://labs.ig.com/streaming-api-reference
    const subscription_epics = epics.map(epic => `CHART:${epic}:${TIMEFRAME.TICK}`)
    const subscription = new Subscription(
      'DISTINCT',
      subscription_epics,
      ['BID', 'OFR', 'UTM', 'LTV', 'TTV']
    )
    subscription.addListener({
      onSubscription: function () {
        console.log('subscribed')
      },
      onUnsubscription: function () {
        console.log('unsubscribed')
      },
      onSubscriptionError: function (code, message) {
        console.log('subscription failure: ' + code + ' message: ' + message)
      },
      onItemUpdate: (updateInfo) => {
        // console.log(updateInfo)
        // Lightstreamer published some data
        const epic = updateInfo.getItemName() // e.g. CS.D.CRYPTOB10.CFD.IP:TICK
        const data: TPriceDataPacket = {
          UTM: '',
          BID: '',
          OFR: '',
          LTV: '',
          TTV: ''
        }
        updateInfo.forEachField(function (fieldName, fieldPos, value) {
          // console.log('Field: ' + fieldName + ' Value: ' + value)
          data[fieldName] = value
          // Alternatively, if the field is JSON, such as in a confirm message:
          // var confirm = JSON.parse(value);
          // console.log('json: ' + confirm.dealId);
        })

        // Convert 'CHART:CS.D.CRYPTOB10.CFD.IP:TICK' -> 'CS.D.CRYPTOB10.CFD.IP'
        const timeframeRemovedEpic = epic.split(':').filter(seg => seg !== TIMEFRAME.TICK && seg !== 'CHART').join(':')

        // REDIS STUFF
        if (data.UTM && data.BID && data.OFR) {
          const redisBidEpic = this.redis.createTimeframeEpic(timeframeRemovedEpic, BID, TIMEFRAME.TICK)
          // console.log(redisBidEpic, data.BID, data.UTM)
          this.redis.write(redisBidEpic, data.BID, data.UTM).catch(e => console.error(e))
        }
        if (data.UTM && data.OFR) {
          const redisOfrEpic = this.redis.createTimeframeEpic(timeframeRemovedEpic, OFR, TIMEFRAME.TICK)
          // console.log(redisOfrEpic, data.OFR, data.UTM)
          this.redis.write(redisOfrEpic, data.OFR, data.UTM).catch(e => console.error(e))
        }
        if (data.UTM && data.LTV) {
          const redisLtvEpic = this.redis.createTimeframeEpic(timeframeRemovedEpic, LTV, TIMEFRAME.TICK)
          // console.log(redisLtvEpic, data.LTV, data.UTM)
          this.redis.write(redisLtvEpic, data.LTV, data.UTM).catch(e => console.error(e))
        }
        if (data.TTV) {
          console.log('TTV:', epic, 'Incremental Trading Volume:', data)
        }
      }
    })

    this.lsClient.subscribe(subscription)
  }
}

export default Lightstreamer
