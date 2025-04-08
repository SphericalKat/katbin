FROM elixir:alpine AS build

# install build dependencies
RUN apk add --no-cache build-base npm git curl py-pip rust cargo

# prepare build dir
WORKDIR /app

# install hex + rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# set build ENV
ENV MIX_ENV=prod

# install mix dependencies
COPY mix.exs mix.lock ./
COPY config config
RUN mix do deps.get, deps.compile

# build assets
COPY assets/package.json assets/package-lock.json ./assets/
RUN npm --prefix ./assets ci --progress=false --no-audit --loglevel=error

COPY priv priv
COPY assets assets
COPY lib lib
COPY native native
RUN npm run --prefix ./assets deploy
RUN mix phx.digest

# uncomment COPY if rel/ exists
# COPY rel rel
RUN mix do compile, release

# prepare release image
FROM alpine AS app
RUN apk add --no-cache openssl ncurses-libs libstdc++

WORKDIR /app

RUN chown nobody:nobody /app

USER nobody:nobody

COPY --from=build --chown=nobody:nobody /app/_build/prod/rel/ketbin ./

COPY --chown=nobody:nobody startup.sh startup.sh

RUN chmod +x /app/startup.sh

ENV HOME=/app

CMD ["/app/startup.sh"]
