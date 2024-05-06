defmodule Ketbin.Repo.Migrations.AddTimestampsPastes do
  use Ecto.Migration

  def change do
    alter table(:pastes) do
      add :inserted_at, :naive_datetime, null: false, default: fragment("CURRENT_TIMESTAMP")
      add :updated_at, :naive_datetime, null: false, default: fragment("CURRENT_TIMESTAMP")
    end
  end
end
