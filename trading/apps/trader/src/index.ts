import fastify, { FastifyRequest } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { getDefaultHeaders, login, baseUrl, LOGIN_INTERVAL_TIMEOUT, TLogin } from 'login';
import Redis from 'redis-wrapper'
import Trade, { getTradeKey } from './tradetracker'

const { LISTEN_ADDRESS = 'localhost', PORT = '3000' } = process.env;

const app = fastify<Server, IncomingMessage, ServerResponse>();

let session = {} as TLogin['session']
const redis = new Redis()

let trades: Trade[] = []

const removeTrade = (epic) => {
  trades = trades.filter(trade => trade.epic !== epic)
}

type TradeBody = {
  epic: string
  position: string
  stopLoss: string
  takeProfit: string
}

// curl -X POST http://localhost:3000/trade -H "Content-Type: application/json" -d '{ "epic": "CS.D.GBPJPY.CFD.IP", "position": "BUY", "stopLoss": "130", "takeProfit": "300" }'
// curl -X POST http://localhost:3000/trade -H "Content-Type: application/json" -d '{ "epic": "CS.D.USDCAD.CFD.IP", "position": "SELL", "stopLoss": "1.5001", "takeProfit": "1.2" }'

// Define a route
app.post<{ Body: TradeBody }>('/trade', async (req, res) => {
  const epic = req?.body?.epic || ''
  const position = req?.body?.position || ''
  const stopLoss = req?.body?.stopLoss || ''
  const takeProfit = req?.body?.takeProfit || ''
  if (!epic) {
    res.status(400).send(`Missing epic field`)
    return
  }
  if (!position) {
    res.status(400).send(`Missing position field`)
    return
  }
  if (position !== 'BUY' && position !== 'SELL') {
    res.status(400).send(`field position is neither BUY | SELL`)
    return
  }
  if (!stopLoss) {
    res.status(400).send(`Missing stopLoss field`)
    return
  }
  if (isNaN(Number(stopLoss))) {
    res.status(400).send(`field stopLoss is NaN`)
    return
  }
  if (!takeProfit) {
    res.status(400).send(`Missing takeProfit field`)
    return
  }
  if (isNaN(Number(takeProfit))) {
    res.status(400).send(`field takeProfit is NaN`)
    return
  }
  const tradeKey = getTradeKey(epic, position)
  const isTradeOpen = await redis.exists(tradeKey)
  if (isTradeOpen) {
    console.error('Trade ' + tradeKey + ' already exists:', req?.body)
    res.status(409).send('Trade ' + tradeKey + ' already exists')
  } else {
    // https://labs.ig.com/rest-trading-api-reference/service-detail?id=678
    // const body = JSON.stringify({
    //   currencyCode: 'USD',
    //   dealReference: 'test',
    //   direction: 'BUY', // BUY | SELL
    //   expiry: '-',
    //   epic: 'CS.D.CRYPTOB10.CFD.IP',
    //   forceOpen: true,
    //   guaranteedStop: false,
    //   orderType: 'MARKET', // MARKET | LIMIT | QUOTE,
    //   size: 0.5, // Check precision is not more than 12 decimal places
    // })

    // const headers = { ...defaultHeaders, Version: 2 }

    // const tradeResponse = await fetch(`${baseUrl}/positions/otc`, { headers, method: 'POST', body });
    // const parsedResponse = await tradeResponse.json();

    // res.status(tradeResponse.status).send({ statusText: tradeResponse.statusText, body: parsedResponse });
    trades.push(
      new Trade({
        redis,
        epic,
        position, 
        stopLoss: Number(stopLoss),
        takeProfit: Number(takeProfit),
        onTradeClose: () => removeTrade(epic)
      })
    )
    res.status(200).send('OK')
  }
});

// curl -X "DELETE" 'http://localhost:3000/trade?epic=CS.D.GBPJPY.CFD.IP'
// curl -X "DELETE" 'http://localhost:3000/trade?epic=CS.D.AUDUSD.CFD.IP'

type DeleteRequest = FastifyRequest<{
  Querystring: { epic: string }
}>

app.delete('/trade', async (req: DeleteRequest, res) => {
  const { epic } = req.query
  if (!epic) {
    res.status(400).send('epic missing')
  }
  const trade = trades.find((trade) => trade.epic === epic)
  if (!trade) {
    res.status(404).send(`trade ${epic} not found`)
  }
  trade?.deleteTrade()
  res.send('Trade closed');
});

app.get('/market', async (req, res) => {
  const queryObj = req?.query as { market?: string }
  const query = queryObj?.market || ''
  const defaultHeaders = await getDefaultHeaders()
  const marketRequest = await fetch(`${baseUrl}/markets${query ? `?searchTerm=${query}` : ''}`, { headers: defaultHeaders })
  const parsedMarketRequest = await marketRequest.json()

  const operationsRequest = await fetch(`${baseUrl}/operations/application`, { headers: defaultHeaders })
  const parsedOperationsRequest = await operationsRequest.json();

  const { lightstreamerEndpoint, accounts } = session
  const spreadBetAccount = accounts.find(acc => acc.accountType === 'SPREADBET')
  res.send(parsedMarketRequest?.markets)
})

// Start the server
const start = async () => {
  await redis.connectRedis()
  const { session: loginSession } = await login()
  session = loginSession
  const defaultHeaders = await getDefaultHeaders()
  const openPositions = await fetch(`${baseUrl}/positions`, { headers: defaultHeaders })
  const parsedOpenPositions = await openPositions.json()

  const tradeKeys = await redis.scan('*:TRADE:*')
  if (tradeKeys?.keys?.length) {
    const tradeKeysValues = await redis.mGet(tradeKeys?.keys || [])
    tradeKeysValues?.forEach((openTrade) => {
      if (openTrade) {
        const { epic } = JSON.parse(openTrade)
        trades.push(new Trade({ ...JSON.parse(openTrade), redis, onTradeClose: () => removeTrade(epic) }))
      }
    })
  }

  // const testTrade = new Trade({ epic: 'CS.D.CRYPTOB10.CFD.IP', position: 'BUY', stopLoss: 7000, takeProfit: 9000, redis, onTradeClose: () => removeTrade('CS.D.CRYPTOB10.CFD.IP') })

  try {
    const address = await app.listen({
      port: parseInt(PORT, 10),
      host: LISTEN_ADDRESS
    })
    console.log(`Server is running on ${address}`)
  } catch (err) {
    console.error('Error starting server', err)
    process.exit(1)
  }
};

start();
