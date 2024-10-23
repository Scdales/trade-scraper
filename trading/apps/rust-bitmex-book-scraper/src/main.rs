use chrono::{DateTime, Local};
use serde::de;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json;
use tungstenite::{connect, Message};
use url::Url;
use redis::{Connection, RedisError, Commands};
use redis_ts::{TsCommands, TsOptions, TsDuplicatePolicy};
use std::collections::HashMap;
use std::env;
use std::time::{Duration, Instant};

pub fn de_float_from_str<'a, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'a>,
{
    let str_val = String::deserialize(deserializer)?;
    str_val.parse::<f64>().map_err(de::Error::custom)
}

#[derive(Serialize, Deserialize, Debug)]
struct BitmexMessagePriceLevel {
    symbol: String,
    id: i64,
    side: String,
    size: Option<i64>,
    price: f64,
    timestamp: String // "2024-01-03T00:09:50.444Z"
}

#[derive(Serialize, Deserialize, Debug)]
struct BitmexMessageFilter {
    account: Option<i32>,
    symbol: Option<String>
}

#[derive(Serialize, Deserialize, Debug)]
struct BitmexMessage {
    table: String,
    action: String,
    data: Vec<BitmexMessagePriceLevel>,
    keys: Option<Vec<String>>,
    types: Option<HashMap<String, String>>,
    filter: Option<BitmexMessageFilter>
}

const KEY_PREFIX: &str = "BITMEX:XBTUSD:BOOK";

const BITMEX_WS_API: &str = "wss://ws.bitmex.com/realtime?subscribe=orderBookL2:XBTUSD";

const RETENTION_TIME: u64 = 86400000;

fn get_values(price_level: &BitmexMessagePriceLevel) -> (String, i64) {
    let buy_sell: String = price_level.side.to_uppercase();
    let key = format!("{}:{}:{}", KEY_PREFIX, buy_sell, price_level.price);
    let ts = match DateTime::parse_from_rfc3339(&price_level.timestamp) {
        Ok(datetime) => {
                datetime.timestamp_millis()
        },
        Err(e) => {
            println!("{}: Failed to parse date-time string: {:?}", print_now(), e);
            0
        },
    };
    (key, ts)
}

fn redis_write(con: &mut Connection, payload: &BitmexMessage, options: &TsOptions) {
    for price_level in &payload.data {
        let buy_sell: String = price_level.side.to_uppercase();
        let (key, ts) = get_values(&price_level);
        let options_clone = options.clone().label("SIDE", &buy_sell).label("SUB", "BOOK");
        if !price_level.size.is_some() {
            println!("{}: Size is None", print_now());
        } else if ts > 0 {
            let redis_query: Result<(), RedisError> = con.ts_add_create(key, ts, price_level.size, options_clone);
            match redis_query {
                Ok(_) => {},
                Err(e) => {
                    println!("{}: Error adding to redis: {}", print_now(), e);
                    println!("{}: {:?}", print_now(), price_level);
                    // let value: Result<std::option::Option<(_, _)>, _> = con.ts_get(key);
                }
            };
        }
    }
}

fn redis_update(con: &mut Connection, payload: &BitmexMessage, options: &TsOptions) {
    match payload.action.as_str() {
        "partial" => {
            let keys_search = format!("{}*", KEY_PREFIX);
            let redis_query: Result<Vec<String>, RedisError> = con.keys(keys_search.clone());
            match redis_query {
                Ok(data) => {
                    let _: Result<i32, RedisError> = con.del(data);
                    println!("{}: Deleted all keys using query: {:?}", print_now(), keys_search);
                },
                Err(e) => {
                    println!("{}: Error fetching keys: {}", print_now(), e);
                }
            }
            redis_write(con, payload, options);
        }
        "update" => redis_write(con, payload, options),
        "insert" => redis_write(con, payload, options),
        "delete" => {
            for price_level in &payload.data {
                let buy_sell: String = price_level.side.to_uppercase();
                let options_clone = options.clone().label("SIDE", &buy_sell).label("GROUP", "BOOK");
                let (key, ts) = get_values(price_level);
                let redis_query: Result<(), RedisError> = con.ts_add_create(key, ts, 0, options_clone);
                match redis_query {
                    Ok(_) => {},
                    Err(e) => {
                        println!("{}: Error setting key to 0: {}", print_now(), e);
                    }
                };
            }
        },
        _ => println!("{}: Unknown action key value", print_now()),
    }
}

fn print_now() -> String {
     // Get the current date and time in your local time zone
     let current_datetime: DateTime<Local> = Local::now();
     // Format the date and time as a human-readable string
     let formatted_datetime = current_datetime.format("%Y-%m-%d %H:%M:%S%.6f").to_string();
     formatted_datetime
}

fn main() -> redis::RedisResult<()> {
    let options = TsOptions::default().duplicate_policy(TsDuplicatePolicy::Last).retention_time(RETENTION_TIME).label("EXCHANGE", "BITMEX");
    let redis_password = env::var("REDIS_PASSWORD").expect("$REDIS_PASSWORD is not set");
    let redis_host = env::var("REDIS_HOST").unwrap_or("cache".to_string());
    let connection_string = format!("redis://default:{}@{}:6379", redis_password, redis_host);
    let client = redis::Client::open(connection_string)?;
    let mut con = client.get_connection()?;
    
    // let _:() = con.ts_create("my_ts", TsOptions::default())?;
    // let _:() = con.ts_add_create(key, ts, value, options)?;
    let expiration_duration = Duration::from_secs(5);
    let mut start_time = Instant::now();

    let (mut socket, _) =
        connect(Url::parse(&BITMEX_WS_API).unwrap()).expect("Can't connect.");
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
                        (socket, _) = connect(Url::parse(&BITMEX_WS_API).unwrap()).expect("Can't reconnect.");
                        continue;
                    },
                    _ => {
                        println!("{}: Other error: {:?}", print_now(), error);
                        continue;
                    }
                }
            }
        };
        // let parsed_message = serde_json::from_str(&msg).expect("Can't parse to JSON");
        // println!("{:?}", message_string);
        let result: Result<BitmexMessage, serde_json::Error> = serde_json::from_str(&message_string);
        // println!("{:?}", result);

        match result {
            Ok(data) => {
                redis_update(&mut con, &data, &options);
                start_time = Instant::now();
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
