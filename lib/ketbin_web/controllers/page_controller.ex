defmodule KetbinWeb.PageController do
  use KetbinWeb, :controller

  alias Ketbin.Pastes
  alias Ketbin.Pastes.Paste

  def index(conn, _params) do
    changeset = Pastes.change_paste(%Paste{})
    render(conn, "index.html", changeset: changeset)
  end

  def show(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    render(conn, "show.html", paste: paste)
  end

  def create(conn, %{"paste" => paste_params}) do
    # paste_params = Map.put(paste_params, "id", s)
    case Pastes.create_paste(paste_params) do
      {:ok, paste} ->
        conn
        |> put_flash(:info, "Paste created successfully.")
        |> redirect(to: Routes.paste_path(conn, :show, paste))

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "index.html", changeset: changeset)
    end
  end
end
