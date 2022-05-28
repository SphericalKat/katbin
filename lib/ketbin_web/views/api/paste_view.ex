defmodule KetbinWeb.Api.PasteView do
  use KetbinWeb, :view

  def render("paste.json", %{paste: paste}) do
    %{
      id: paste.id,
      content: paste.content,
      is_url: paste.is_url
    }
  end

  def render("error.json", _assigns) do
    %{
      success: false,
      msg: "Something went wrong"
    }
  end
end
