defmodule Ketbin.Pastes.Paste do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :string, autogenerate: false}
  @derive {Phoenix.Param, key: :id}
  schema "pastes" do
    field :content, :string
    field :is_url, :boolean, default: false
    field :belongs_to, :id
  end

  @doc false
  def changeset(paste, attrs) do
    paste
    |> cast(attrs, [:is_url, :content, :id])
    |> validate_required([:is_url, :content])
  end
end
