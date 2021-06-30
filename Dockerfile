FROM rustlang/rust:nightly AS builder

COPY . .

RUN cargo build --release

# CMD ["sh", "-c", "ROCKET_KEEP_ALIVE=0 ./target/release/katbin"]

FROM debian:buster

RUN apt-get update && apt-get install -y libpq-dev

COPY --from=builder \
  /target/release/katbin\
  /usr/local/bin/

WORKDIR /root

CMD /usr/local/bin/katbin