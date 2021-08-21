import Mix.Config

# Configure your database
config :ketbin, Ketbin.Repo,
  username: "postgres",
  password: "postgres",
  database: "ketbin_dev",
  hostname: "localhost",
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

smtp_relay = "<Your SMTP Relay Here>"
username = "<Your SMTP username here>"
password = "<Your SMTP password here>"

# configure mailer
config :ketbin, Ketbin.Mailer,
  adapter: Swoosh.Adapters.SMTP,
  relay: smtp_relay,
  username: username,
  password: password,
  tls: :always,
  auth: :always,
  port: 587
