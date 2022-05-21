defmodule KetbinWeb.Api.PasteController do
  use KetbinWeb, :controller

  alias Ketbin.Pastes
  alias Ketbin.Pastes.Utils

  def show(conn, %{"id" => id}) do
    [head | _tail] = String.split(id, ".")

    # fetch paste from db
    paste = Pastes.get_paste!(head)
    render(conn, "paste.json", paste: paste)
  end

  def create(%{assigns: %{current_user: current_user}} = conn, %{"paste" => paste_params}) do
    # generate phonetic key
    id = Utils.generate_key()

    # check if content is a url
    is_url =
      Map.get(paste_params, "content")
      |> Utils.is_url?()

    # put id and is_url values into changeset
    paste_params =
      Map.put(paste_params, "id", id)
      |> Map.put("is_url", is_url)
      |> Map.put("belongs_to", current_user && current_user.id)

    # attempt to create a paste
    case Pastes.create_paste(paste_params) do
      # all good
      {:ok, paste} ->
        conn
        |> put_status(:created)
        |> render("paste.json", paste: paste)

      # something went wrong, bail
      {:error, %Ecto.Changeset{} = _changeset} ->
        conn
        |> put_status(:internal_server_error)
        |> render("error.json")
    end
  end
end
