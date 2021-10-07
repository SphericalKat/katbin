defmodule Ketbin.Repo.Migrations.CreatePastes do
  use Ecto.Migration

  def change do
    create_if_not_exists table(:pastes, primary_key: false) do
      add :id, :string, primary_key: true
      add :is_url, :boolean, default: false, null: false
      add :content, :text, null: false
      add :belongs_to, references(:users, on_delete: :delete_all)
    end

    create_if_not_exists index(:pastes, [:belongs_to])
  end
end
