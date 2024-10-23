import Redis from 'redis-wrapper'
export const apiKey = process.env.IG_API_KEY;
export const isDemo = JSON.parse(process.env.IG_IS_DEMO || '');
export const baseUrl = `https://${isDemo ? 'demo-' : ''}${process.env.IG_BASE_URL}`;
export const identifier = process.env.IG_IDENTIFIER;
export const password = process.env.IG_PASSWORD;

const redis = new Redis()
redis.connectRedis()

export const LOGIN_INTERVAL_TIMEOUT = 1000 * 3600 * 23;

const IG_DEFAULT_HEADERS_KEY = 'IG_DEFAULT_HEADERS'

const defaultHeaders = {
  Accept: 'application/json; charset=UTF-8',
  'Content-Type': 'application/json; charset=UTF-8',
  'X-IG-API-KEY': apiKey,
  Version: 1,
  'IG-ACCOUNT-ID': 'Z5BTIP'
} as unknown as Headers;

const setDefaultHeaders = async () => {
  await redis.set(IG_DEFAULT_HEADERS_KEY, JSON.stringify(defaultHeaders))
  console.log('Set default headers')
  return
}

const getDefaultHeaders = async () => {
  const fetchedDefaultHeaders = await redis.get(IG_DEFAULT_HEADERS_KEY)
  if (fetchedDefaultHeaders) {
    return JSON.parse(fetchedDefaultHeaders)
  } else {
    let counter = 1
    const tryToFetchHeaders = () => setTimeout(async () => {
      console.log('Retrying header fetch:', counter)
      const fetchedDefaultHeaders = await redis.get(IG_DEFAULT_HEADERS_KEY)
      if (!fetchedDefaultHeaders) {
        counter++
        tryToFetchHeaders()
      } else {
        return JSON.parse(fetchedDefaultHeaders)
      }
    }, 1000)
    tryToFetchHeaders()
  }
}

export type TIgAccount = {
    accountType: string
    accountId: string
}

export type TLogin = {
    session: { lightstreamerEndpoint: string, accounts: TIgAccount[] }
    cst: string | null
    xSecurityToken: string | null
}

const login = async (): Promise<TLogin> => {
  console.log('Authenticating');
  let loginRequest;
  try {
    loginRequest = await fetch(
      `${baseUrl}/session?fetchSessionTokens=true`,
      {
        method: 'post',
        headers: defaultHeaders,
        body: JSON.stringify({
          encryptedPassword: false,
          identifier,
          password
        })
      }
    );
  } catch (e) {
    console.error('Error logging in:', e);
  }

  const cst = loginRequest.headers.get('cst');
  const xSecurityToken = loginRequest.headers.get('x-security-token');
  const parsedLoginRequest = await loginRequest.json() as { lightstreamerEndpoint: string, accounts: TIgAccount[] };

  // @ts-expect-error Adding header value "CST"
  defaultHeaders.CST = cst;
  defaultHeaders['X-SECURITY-TOKEN'] = xSecurityToken;
  await setDefaultHeaders()
  console.log('Logged in and set headers');
  return { session: parsedLoginRequest, cst, xSecurityToken };
};

export { getDefaultHeaders, login };
