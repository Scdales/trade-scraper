FROM rust:latest
COPY ./ ./
ENV RUST_BACKTRACE=1
RUN cargo build --release
CMD ["./target/release/rust-binance-quote-scraper"]