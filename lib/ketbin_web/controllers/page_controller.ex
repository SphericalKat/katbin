defmodule KetbinWeb.PageController do
  use KetbinWeb, :controller

  alias Ketbin.Pastes
  alias Ketbin.Pastes.Paste

  def index(conn, _params) do
    render(conn, "index.html")
  end

  def show(conn, %{"id" => id}) do
    paste = Pastes.get_paste!(id)
    render(conn, "show.html", paste: paste)
  end
end
