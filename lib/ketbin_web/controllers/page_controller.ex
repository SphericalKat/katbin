defmodule KetbinWeb.PageController do
  use KetbinWeb, :controller

  alias Ketbin.Pastes
  alias Ketbin.Pastes.Paste
  alias Ketbin.Pastes.Utils

  def index(conn, _params) do
    changeset = Pastes.change_paste(%Paste{})
    render(conn, "index.html", changeset: changeset)
  end

  def show(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)

    if paste.is_url do
      redirect(conn, external: paste.content)
    else
      render(conn, "show.html", paste: paste)
    end
  end

  def showlink(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    render(conn, "show.html", paste: paste)
  end

  def create(conn, %{"paste" => paste_params}) do
    id = Utils.generate_key()

    is_url =
      Map.get(paste_params, "content")
      |> Utils.is_url?()

    paste_params =
      Map.put(paste_params, "id", id)
      |> Map.put("is_url", is_url)

    case Pastes.create_paste(paste_params) do
      {:ok, paste} ->
        unless is_url do
          conn
          |> redirect(to: Routes.page_path(conn, :show, paste))
        else
          conn
          |> redirect(to: Routes.page_path(conn, :showlink, paste))
        end

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "index.html", changeset: changeset)
    end
  end
end
