defmodule Ketbin.Pastes.Paste do
  use Ecto.Schema
  import Ecto.Changeset
  @derive {Jason.Encoder, only: [:content, :is_url, :belongs_to]}

  @primary_key {:id, :string, autogenerate: false}
  @derive {Phoenix.Param, key: :id}
  schema "pastes" do
    field :content, :string
    field :is_url, :boolean, default: false
    field :belongs_to, :id

    timestamps()
  end

  @doc false
  def changeset(paste, attrs) do
    paste
    |> cast(attrs, [:is_url, :content, :id, :belongs_to])
    |> validate_required([:is_url, :content])
    |> unique_constraint(:id, name: :pastes_pkey)
  end
end
