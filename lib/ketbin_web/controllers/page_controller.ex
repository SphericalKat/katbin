defmodule KetbinWeb.PageController do
  use KetbinWeb, :controller

  def index(conn, _params) do
    render(conn, "index.html")
  end
end
