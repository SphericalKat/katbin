FROM rustlang/rust:nightly as build

COPY . .

RUN cargo build --release

CMD ["sh", "-c", "ROCKET_PORT=$PORT ROCKET_KEEP_ALIVE=0 ./target/release/katbin"]