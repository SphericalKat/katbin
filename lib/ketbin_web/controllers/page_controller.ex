defmodule KetbinWeb.PageController do
  require Logger

  use KetbinWeb, :controller

  alias Ketbin.Pastes
  alias Ketbin.Pastes.Paste
  alias Ketbin.Pastes.Utils

  def index(conn, _params) do
    changeset = Pastes.change_paste(%Paste{})
    render(conn, "index.html", changeset: changeset)
  end

  def show(%{assigns: %{show_edit: show_edit}} = conn, %{"id" => id}) do
    [head | tail] = String.split(id, ".")

    # fetch paste from db
    paste = Pastes.get_paste!(head)

    # paste is a url, redirect
    # regular paste, show content
    if paste.is_url do
      redirect(conn, external: paste.content)
    else
      render(conn, "show.html",
        paste: paste,
        show_edit: show_edit,
        extension: List.first(tail) || ""
      )
    end
  end

  def showlink(%{assigns: %{show_edit: show_edit}} = conn, %{"id" => id}) do
    [head | tail] = String.split(id, ".")
    paste = Pastes.get_paste!(head)

    render(conn, "show.html",
      paste: paste,
      show_edit: show_edit,
      extension: if(tail == [], do: "", else: tail)
    )
  end

  def raw(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    text(conn, paste.content)
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
      # all good, redirect
      {:ok, paste} ->
        unless is_url do
          conn
          # is a regular paste, take to regular route
          |> redirect(to: Routes.page_path(conn, :show, paste))
        else
          conn
          # is a url, take to route with /v/ prefix
          |> redirect(to: Routes.page_path(conn, :showlink, paste))
        end

      # something went wrong, bail
      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "index.html", changeset: changeset)
    end
  end

  def edit(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    changeset = Pastes.change_paste(paste)
    render(conn, "edit.html", paste: paste, changeset: changeset)
  end

  def update(conn, %{"id" => id, "paste" => paste_params}) do
    paste = Pastes.get_paste!(id)

    # check if content is a url
    is_url =
      Map.get(paste_params, "content")
      |> Utils.is_url?()

    paste_params = Map.put(paste_params, "is_url", is_url)

    case Pastes.update_paste(paste, paste_params) do
      {:ok, paste} ->
        unless is_url do
          conn
          |> put_flash(:info, "Paste updated successfully.")
          |> redirect(to: Routes.page_path(conn, :show, paste))
        else
          conn
          |> put_flash(:info, "Paste updated successfully.")
          |> redirect(to: Routes.page_path(conn, :showlink, paste))
        end

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "edit.html", paste: paste, changeset: changeset)
    end
  end
end
