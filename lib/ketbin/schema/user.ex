defmodule Ketbin.Schema.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :firebase_id, :string

    timestamps()
  end

  @doc false
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:firebase_id])
    |> validate_required([:firebase_id])
  end
end
