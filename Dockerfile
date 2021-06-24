FROM rustlang/rust:nightly

COPY . .

RUN cargo build --release

CMD ["sh", "-c", "ROCKET_KEEP_ALIVE=0 ./target/release/katbin"]