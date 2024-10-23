use chrono::{DateTime, Local};
use serde::de;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json;
use tungstenite::{connect, Message};
use url::Url;
use redis::{Connection, RedisError};
use redis_ts::{TsCommands, TsOptions, TsDuplicatePolicy};
use std::env;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub fn de_float_from_str<'a, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'a>,
{
    let str_val = String::deserialize(deserializer)?;
    str_val.parse::<f64>().map_err(de::Error::custom)
}

#[derive(Serialize, Deserialize, Debug)]
struct CoinbaseMessageQuote {
    r#type: String, // "ticker",
    sequence: u64, // 37475248783,
    product_id: String, // "ETH-USD",
    price: String, // "1285.22",
    open_24h: String, // "1310.79",
    volume_24h: String, // "245532.79269678",
    low_24h: String, // "1280.52",
    high_24h: String, // "1313.8",
    volume_30d: String, // "9788783.60117027",
    #[serde(deserialize_with = "de_float_from_str")]
    best_bid: f64, // "1285.04",
    #[serde(deserialize_with = "de_float_from_str")]
    best_bid_size: f64, // "0.46688654",
    #[serde(deserialize_with = "de_float_from_str")]
    best_ask: f64, // "1285.27",
    #[serde(deserialize_with = "de_float_from_str")]
    best_ask_size: f64, // "1.56637040",
    side: String, // "buy",
    time: String, // "2022-10-19T23:28:22.061769Z",
    trade_id: u64, // 370843401,
    last_size: String, // "11.4396987"
  }


#[derive(Serialize, Deserialize, Debug)]
struct CoinbaseSubscriptionMessage {
    r#type: String,
    channels: Vec<String>,
    product_ids: Vec<String>
}

const KEY_PREFIX: &str = "COINBASE:XBTUSD:TRADE";

const COINBASE_WS_API: &str = "wss://ws-feed.exchange.coinbase.com";

const RETENTION_TIME: u64 = 86400000;

fn add_current_data(con: &mut Connection, ts: u64, quote: &CoinbaseMessageQuote, options: &TsOptions) {
    let options_clone = options.clone().label("SIDE", "BUY").label("SUB", "QUOTE");
    let price_key = format!("{}:BUY:PRICE", KEY_PREFIX);
    let redis_query: Result<(), RedisError> = con.ts_add_create(price_key, ts, quote.best_bid, options_clone.clone().label("GROUP", "PRICE"));
    match redis_query {
        Ok(_) => {},
        Err(e) => {
            println!("{}: Error adding buy price to redis: {}", print_now(), e);
        }
    };
    let vol_key = format!("{}:BUY:VOL", KEY_PREFIX);
    let redis_query: Result<(), RedisError> = con.ts_add_create(vol_key, ts, quote.best_bid_size, options_clone.clone().label("GROUP", "VOL"));
    match redis_query {
        Ok(_) => {},
        Err(e) => {
            println!("{}: Error adding buy vol to redis: {}", print_now(), e);
        }
    };

    
    let options_clone = options.clone().label("SIDE", "SELL").label("SUB", "QUOTE");
    let price_key = format!("{}:SELL:PRICE", KEY_PREFIX);
    let redis_query: Result<(), RedisError> = con.ts_add_create(price_key, ts, quote.best_ask, options_clone.clone().label("GROUP", "PRICE"));
    match redis_query {
        Ok(_) => {},
        Err(e) => {
            println!("{}: Error adding sell price to redis: {}", print_now(), e);
        }
    };
    let vol_key = format!("{}:SELL:VOL", KEY_PREFIX);
    let redis_query: Result<(), RedisError> = con.ts_add_create(vol_key, ts, quote.best_ask_size, options_clone.clone().label("GROUP", "VOL"));
    match redis_query {
        Ok(_) => {},
        Err(e) => {
            println!("{}: Error adding sell vol to redis: {}", print_now(), e);
        }
    };
}

fn print_now() -> String {
     let current_datetime: DateTime<Local> = Local::now();
     let formatted_datetime = current_datetime.format("%Y-%m-%d %H:%M:%S%.6f").to_string();
     formatted_datetime
}

fn main() -> redis::RedisResult<()> {
    let options = TsOptions::default().duplicate_policy(TsDuplicatePolicy::Last).retention_time(RETENTION_TIME).label("EXCHANGE", "COINBASE");
    let redis_password = env::var("REDIS_PASSWORD").expect("$REDIS_PASSWORD is not set");
    let redis_host = env::var("REDIS_HOST").unwrap_or("cache".to_string());
    let connection_string = format!("redis://default:{}@{}:6379", redis_password, redis_host);
    let client = redis::Client::open(connection_string)?;
    let mut con = client.get_connection()?;

    let expiration_duration = Duration::from_secs(5);
    let mut start_time = Instant::now();

    let (mut socket, _) =
        connect(Url::parse(&COINBASE_WS_API).unwrap()).expect("Can't connect.");
    println!("Connected");
    let subscription = CoinbaseSubscriptionMessage {
        r#type: String::from("subscribe"),
        channels: vec![
            String::from("ticker")
        ],
        product_ids: vec![
            String::from("BTC-USD")
        ]
    };
    let subscription_message = serde_json::to_string::<CoinbaseSubscriptionMessage>(&subscription).unwrap();
    println!("Sending: {:?}", subscription_message);
    socket
        .write_message(Message::from(subscription_message))
        .unwrap();
    loop {
        let msg: Result<Message, tungstenite::Error> = socket.read_message();
        let message_string = match msg {
            Ok(json_str) => {
                match json_str {
                    tungstenite::Message::Text(s) => s,
                    tungstenite::Message::Ping(_) => {
                        loop {
                            let is_pending = socket.write_pending();
                            match is_pending {
                                Ok(_) => {
                                    break;
                                }
                                Err(v) => println!("{}: Write Pending Error: {:?}", print_now(), v),
                            };
                        }
                        println!("{}: Received Ping", print_now());
                        socket
                            .write_message(Message::Pong("pong".as_bytes().to_vec()))
                            .unwrap();
                        println!("{}: Sent Pong", print_now());
                        continue;
                    },
                    tungstenite::Message::Pong(_) => {
                        println!("{}: Received Pong", print_now());
                        continue;
                    },
                    _ => {
                        println!("{}: Bad message: {:?}", print_now(), json_str.to_string());
                        continue;
                    }
                }
            }
            Err(error) => {
                match error {
                    tungstenite::Error::Protocol(msg) => {
                        println!("{}: Received Error::Protocol, reconnecting: {}", print_now(), msg);
                        (socket, _) = connect(Url::parse(&COINBASE_WS_API).unwrap()).expect("Can't reconnect.");
                        continue;
                    },
                    _ => {
                        println!("{}: Other error: {:?}", print_now(), error);
                        continue;
                    }
                }
            }
            _ => {
                println!("Could not parse message:");
                println!("{:?}", msg);
                continue;
            }
        };
        // println!("{:?}", message_string);
        let result: Result<CoinbaseMessageQuote, serde_json::Error> = serde_json::from_str(&message_string);
        // println!("{:?}", result);
        let start = SystemTime::now();
        let since_the_epoch = start
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");
        let current_timestamp = since_the_epoch.as_millis() as u64;

        match result {
            Ok(data) => {
                add_current_data(&mut con, current_timestamp, &data, &options);
                // start_time = Instant::now();
            }
            Err(e) => {
                eprintln!("{}: Parsing Failed: {:?}", print_now(), e);
                println!("{}: {:?}", print_now(), message_string);
            }
        }
        if start_time.elapsed() >= expiration_duration {
            println!("{}: Sending Ping", print_now());
            socket
                .write_message(Message::Ping("ping".as_bytes().to_vec()))
                .unwrap();
            start_time = Instant::now();
        }
    }
}
