defmodule KetbinWeb.PasteController do
  use KetbinWeb, :controller

  alias Ketbin.Pastes
  alias Ketbin.Pastes.Paste

  def index(conn, _params) do
    pastes = Pastes.list_pastes()
    render(conn, "index.html", pastes: pastes)
  end

  def new(conn, _params) do
    changeset = Pastes.change_paste(%Paste{})
    render(conn, "new.html", changeset: changeset)
  end

  def create(conn, %{"paste" => paste_params}) do
    case Pastes.create_paste(paste_params) do
      {:ok, paste} ->
        conn
        |> put_flash(:info, "Paste created successfully.")
        |> redirect(to: Routes.paste_path(conn, :show, paste))

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "new.html", changeset: changeset)
    end
  end

  def show(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    render(conn, "show.html", paste: paste)
  end

  def edit(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    changeset = Pastes.change_paste(paste)
    render(conn, "edit.html", paste: paste, changeset: changeset)
  end

  def update(conn, %{"id" => id, "paste" => paste_params}) do
    paste = Pastes.get_paste!(id)

    case Pastes.update_paste(paste, paste_params) do
      {:ok, paste} ->
        conn
        |> put_flash(:info, "Paste updated successfully.")
        |> redirect(to: Routes.paste_path(conn, :show, paste))

      {:error, %Ecto.Changeset{} = changeset} ->
        render(conn, "edit.html", paste: paste, changeset: changeset)
    end
  end

  def delete(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    {:ok, _paste} = Pastes.delete_paste(paste)

    conn
    |> put_flash(:info, "Paste deleted successfully.")
    |> redirect(to: Routes.paste_path(conn, :index))
  end
end
