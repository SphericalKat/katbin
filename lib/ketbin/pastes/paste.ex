defmodule Ketbin.Pastes.Paste do
  use Ecto.Schema
  import Ecto.Changeset

  schema "pastes" do
    field :content, :string
    field :is_url, :boolean, default: false
    field :belongs_to, :id
  end

  @doc false
  def changeset(paste, attrs) do
    paste
    |> cast(attrs, [:is_url, :content])
    |> validate_required([:is_url, :content])
  end
end
