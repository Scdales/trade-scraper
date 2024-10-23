use std::env;
extern crate redis;
// export REDIS_PASSWORD=<SECRET> && export REDIS_HOST=localhost

fn main() -> redis::RedisResult<()> {
    let redis_password = env::var("REDIS_PASSWORD").expect("$REDIS_PASSWORD is not set");
    let redis_host = env::var("REDIS_HOST").unwrap_or("cache".to_string());
    let connection_string = format!("redis://default:{}@{}:6379", redis_password, redis_host);
    let client = redis::Client::open(connection_string)?;
    let mut con = client.get_connection()?;
    let mut pubsub = con.as_pubsub();
    pubsub.psubscribe("__keyspace*__:*:BID:TICK")?;

    loop {
        let msg = pubsub.get_message()?;
        let payload : String = msg.get_payload()?;
        println!("channel '{}': {}", msg.get_channel_name(), payload);
        // breaks if not present
    }
}
