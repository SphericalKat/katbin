defmodule Ketbin.Pastes do
  @moduledoc """
  The Pastes context.
  """

  import Ecto.Query, warn: false
  alias Ketbin.Repo

  alias Ketbin.Pastes.Paste

  @doc """
  Returns the list of pastes.

  ## Examples

      iex> list_pastes()
      [%Paste{}, ...]

  """
  def list_pastes do
    Repo.all(Paste)
  end

  @doc """
  Gets a single paste.

  Raises `Ecto.NoResultsError` if the Paste does not exist.

  ## Examples

      iex> get_paste!(123)
      %Paste{}

      iex> get_paste!(456)
      ** (Ecto.NoResultsError)

  """
  def get_paste!(id), do: Repo.get!(Paste, id)

  @doc """
  Creates a paste.

  ## Examples

      iex> create_paste(%{field: value})
      {:ok, %Paste{}}

      iex> create_paste(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_paste(attrs \\ %{}) do
    %Paste{}
    |> Paste.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a paste.

  ## Examples

      iex> update_paste(paste, %{field: new_value})
      {:ok, %Paste{}}

      iex> update_paste(paste, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_paste(%Paste{} = paste, attrs) do
    paste
    |> Paste.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a paste.

  ## Examples

      iex> delete_paste(paste)
      {:ok, %Paste{}}

      iex> delete_paste(paste)
      {:error, %Ecto.Changeset{}}

  """
  def delete_paste(%Paste{} = paste) do
    Repo.delete(paste)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking paste changes.

  ## Examples

      iex> change_paste(paste)
      %Ecto.Changeset{data: %Paste{}}

  """
  def change_paste(%Paste{} = paste, attrs \\ %{}) do
    Paste.changeset(paste, attrs)
  end
end
