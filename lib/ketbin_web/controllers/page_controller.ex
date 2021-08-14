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
    paste = Pastes.get_paste!(id) # fetch paste from db

    if paste.is_url do # paste is a url, redirect
      redirect(conn, external: paste.content)
    else # regular paste, show content
      render(conn, "show.html", paste: paste)
    end
  end

  def showlink(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    render(conn, "show.html", paste: paste)
  end

  def raw(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    text(conn, paste.content)
  end

  def create(conn, %{"paste" => paste_params}) do
    # generate phonetic key
    id = Utils.generate_key()

    IO.puts(conn.assigns[:current_user])

    # check if content is a url
    is_url =
      Map.get(paste_params, "content")
      |> Utils.is_url?()

    # put id and is_url values into changeset
    paste_params =
      Map.put(paste_params, "id", id)
      |> Map.put("is_url", is_url)

    # attempt to create a paste
    case Pastes.create_paste(paste_params) do
      {:ok, paste} -> # all good, redirect
        unless is_url do
          conn
          |> redirect(to: Routes.page_path(conn, :show, paste)) # is a regular paste, take to regular route
        else
          conn
          |> redirect(to: Routes.page_path(conn, :showlink, paste)) # is a url, take to route with /v/ prefix
        end

      {:error, %Ecto.Changeset{} = changeset} -> # something went wrong, bail
        render(conn, "index.html", changeset: changeset)
    end
  end
end
