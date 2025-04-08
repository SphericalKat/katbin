# In this file, we load production configuration and secrets
# from environment variables. You can also hardcode secrets,
# although such is generally not recommended and you have to
# remember to add this file to your .gitignore.
import Config

db_host =
  System.get_env("DB_HOST") ||
    raise """
    environment variable DB_HOST is missing.
    """

db_port =
  System.get_env("DB_PORT") ||
    raise """
    environment variable DB_PORT is missing.
    """

db_username =
  System.get_env("DB_USERNAME") ||
    raise """
    environment variable DB_USERNAME is missing.
    """

db_password =
  System.get_env("DB_PASSWORD") ||
    raise """
    environment variable DB_PASSWORD is missing.
    """

db_database =
  System.get_env("DB_DATABASE") ||
    raise """
    environment variable DB_DATABASE is missing.
    """



config :ketbin, Ketbin.Repo,
  ssl: false,
  database: db_database,
  username: db_username,
  password: db_password,
  hostname: db_host,
  port: db_port,
  # verify: :verify_peer,
  socket_options: [:inet6],
  pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")
  # cacertfile: "priv/cert.pem"
secret_key_base =
  System.get_env("SECRET_KEY_BASE") ||
    raise """
    environment variable SECRET_KEY_BASE is missing.
    You can generate one by calling: mix phx.gen.secret
    """

config :ketbin, KetbinWeb.Endpoint,
  http: [
    port: String.to_integer(System.get_env("PORT") || "4000"),
    transport_options: [socket_opts: [:inet6]]
  ],
  secret_key_base: secret_key_base,
  server: true

smtp_relay =
  System.get_env("SWOOSH_SMTP_RELAY") ||
    raise """
    environment variable SWOOSH_SMTP_RELAY is missing.
    """

username =
  System.get_env("SWOOSH_USERNAME") ||
    raise """
    environment variable SWOOSH_USERNAME is missing.
    """

password =
  System.get_env("SWOOSH_PASSWORD") ||
    raise """
    environment variable SWOOSH_PASSWORD is missing.
    """

# configure mailer
config :ketbin, Ketbin.Mailer,
  adapter: Swoosh.Adapters.SMTP,
  relay: smtp_relay,
  username: username,
  password: password,
  tls: :always,
  auth: :always,
  port: 587

# ## Using releases (Elixir v1.9+)
#
# If you are doing OTP releases, you need to instruct Phoenix
# to start each relevant endpoint:
#
#
# Then you can assemble a release by calling `mix release`.
# See `mix help release` for more information.
