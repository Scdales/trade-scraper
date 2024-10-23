import 'dotenv/config'
import Redis from './redis/redis';
import Lightstreamer from './lightstreamer/lightstreamer';
import { getDefaultHeaders, login, baseUrl, LOGIN_INTERVAL_TIMEOUT } from 'login';

// https://labs.ig.com/streaming-api-reference

const EPICS = process.env.IG_EPICS ? process.env.IG_EPICS?.split('\n').filter(Boolean) : []

let loginInterval;

const main = async (): Promise<void> => {
  let redis;
  try {
    redis = new Redis() as Redis;
    await redis.connectRedis()
    for (const epic of EPICS) {
      await redis.createTimeSeries(epic);
    }
  } catch (e) {
    console.error(e);
  }

  try {
    const { session, cst, xSecurityToken } = await login();

    const defaultHeaders = await getDefaultHeaders();

    // /markets?epics=IX.D.FTSE.DAILY.IP
    const marketRequest = await fetch(`${baseUrl}/markets?searchTerm=FTSE`, { headers: defaultHeaders });
    const parsedMarketRequest = await marketRequest.json();

    const operationsRequest = await fetch(`${baseUrl}/operations/application`, { headers: defaultHeaders });
    const parsedOperationsRequest = await operationsRequest.json();

    const { lightstreamerEndpoint, accounts } = session;
    const spreadBetAccount = accounts.find(acc => acc.accountType === 'SPREADBET');
    if (!spreadBetAccount || spreadBetAccount === null) {
      console.error('No Spreadbet account found in accounts');
      console.error(accounts);
      return;
    }
    const lsClient = new Lightstreamer(lightstreamerEndpoint, spreadBetAccount.accountId, cst, xSecurityToken, redis);

    await lsClient.getMarketInfo(EPICS);
    lsClient.subscribe(EPICS);

    loginInterval = setInterval(() => {
      login().then(() => {
        return lsClient.renewLoginTokens(EPICS);
      }).catch((e) => console.error(e));
    }, LOGIN_INTERVAL_TIMEOUT);

    console.log('Done');
  } catch (e) {
    console.error(e);
  }
};

main().catch((e) => console.error('main Error:', e));
