defmodule Ketbin.Repo do
  use Ecto.Repo,
    otp_app: :ketbin,
    adapter: Ecto.Adapters.Postgres
end
