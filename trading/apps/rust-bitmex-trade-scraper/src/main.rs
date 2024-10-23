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
#[serde(rename_all = "camelCase")]
struct BitmexMessageTrade {
    symbol: String,
    // id: i64,
    side: String,
    size: i64,
    price: f64,
    timestamp: String, // 2024-01-03T00:09:50.444Z
    tick_direction: String, // ZeroPlusTick, ZeroMinusTick, PlusTick, MinusTick
    trd_match_i_d: String, // 00000000-006d-1000-0000-00043aec045f
    gross_value: i64, // 7658820
    home_notional: f64, // 0.0765882
    foreign_notional: f64, // 3000.0
    trd_type: String // Regular
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
    data: Vec<BitmexMessageTrade>,
    keys: Option<Vec<String>>,
    types: Option<HashMap<String, String>>,
    filter: Option<BitmexMessageFilter>
}

const KEY_PREFIX: &str = "BITMEX:XBTUSD:TRADE";

const BITMEX_WS_API: &str = "wss://ws.bitmex.com/realtime?subscribe=trade:XBTUSD";

const RETENTION_TIME: u64 = 86400000;

fn get_ts(price_level: &BitmexMessageTrade) -> i64 {
    let ts = match DateTime::parse_from_rfc3339(&price_level.timestamp) {
        Ok(datetime) => {
                datetime.timestamp_millis()
        },
        Err(e) => {
            println!("{}: Failed to parse date-time string: {:?}", print_now(), e);
            0
        },
    };
    ts
}

fn add_current_data(con: &mut Connection, ts: i64, buy_sell: &str, price: f64, vol: i64, options: &TsOptions) {
    let options_clone = options.clone().label("SIDE", &buy_sell).label("SUB", "TRADE");
    let price_key = format!("{}:{}:PRICE", KEY_PREFIX, buy_sell);

    let redis_query: Result<(), RedisError> = con.ts_add_create(price_key, ts, price, options_clone.clone().label("GROUP", "PRICE"));
    match redis_query {
        Ok(_) => {},
        Err(e) => {
            println!("{}: Error adding price to redis: {}", print_now(), e);
        }
    };

    let vol_key = format!("{}:{}:VOL", KEY_PREFIX, buy_sell);
    let redis_query: Result<(), RedisError> = con.ts_add_create(vol_key, ts, vol, options_clone.clone().label("GROUP", "VOL"));
    match redis_query {
        Ok(_) => {},
        Err(e) => {
            println!("{}: Error adding volume to redis: {}", print_now(), e);
        }
    };
}

fn redis_write(con: &mut Connection, payload: &BitmexMessage, options: &TsOptions) {
    for trade in &payload.data {
        let buy_sell: String = trade.side.to_uppercase();
        let ts = get_ts(&trade);

        if ts > 0 {
            add_current_data(con, ts, &buy_sell, trade.price, trade.size, options)
        }
    }
}

fn redis_update(con: &mut Connection, payload: &BitmexMessage, options: &TsOptions) {
    match payload.action.as_str() {
        "partial" => redis_write(con, payload, options),
        "update" => redis_write(con, payload, options),
        "insert" => redis_write(con, payload, options),
        "delete" => {
            eprintln!("{}: Received delete: {:?}", print_now(), payload);
        },
        _ => println!("{}: Unknown action key value", print_now()),
    }
}

fn print_now() -> String {
     let current_datetime: DateTime<Local> = Local::now();
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
