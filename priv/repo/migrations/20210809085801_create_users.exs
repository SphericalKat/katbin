defmodule Ketbin.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users) do
      add :firebase_id, :string

      timestamps()
    end

  end
end
