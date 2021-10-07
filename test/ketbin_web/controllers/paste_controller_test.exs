defmodule KetbinWeb.PasteControllerTest do
  use KetbinWeb.ConnCase

  alias Ketbin.Pastes

  @create_attrs %{content: "some content", is_url: true}
  @update_attrs %{content: "some updated content", is_url: false}
  @invalid_attrs %{content: nil, is_url: nil}

  def fixture(:paste) do
    {:ok, paste} = Pastes.create_paste(@create_attrs)
    paste
  end

  describe "index" do
    test "lists all pastes", %{conn: conn} do
      conn = get(conn, Routes.paste_path(conn, :index))
      assert html_response(conn, 200) =~ "Listing Pastes"
    end
  end

  describe "new paste" do
    test "renders form", %{conn: conn} do
      conn = get(conn, Routes.paste_path(conn, :new))
      assert html_response(conn, 200) =~ "New Paste"
    end
  end

  describe "create paste" do
    test "redirects to show when data is valid", %{conn: conn} do
      conn = post(conn, Routes.paste_path(conn, :create), paste: @create_attrs)

      assert %{id: id} = redirected_params(conn)
      assert redirected_to(conn) == Routes.paste_path(conn, :show, id)

      conn = get(conn, Routes.paste_path(conn, :show, id))
      assert html_response(conn, 200) =~ "Show Paste"
    end

    test "renders errors when data is invalid", %{conn: conn} do
      conn = post(conn, Routes.paste_path(conn, :create), paste: @invalid_attrs)
      assert html_response(conn, 200) =~ "New Paste"
    end
  end

  describe "edit paste" do
    setup [:create_paste]

    test "renders form for editing chosen paste", %{conn: conn, paste: paste} do
      conn = get(conn, Routes.paste_path(conn, :edit, paste))
      assert html_response(conn, 200) =~ "Edit Paste"
    end
  end

  describe "update paste" do
    setup [:create_paste]

    test "redirects when data is valid", %{conn: conn, paste: paste} do
      conn = put(conn, Routes.paste_path(conn, :update, paste), paste: @update_attrs)
      assert redirected_to(conn) == Routes.paste_path(conn, :show, paste)

      conn = get(conn, Routes.paste_path(conn, :show, paste))
      assert html_response(conn, 200) =~ "some updated content"
    end

    test "renders errors when data is invalid", %{conn: conn, paste: paste} do
      conn = put(conn, Routes.paste_path(conn, :update, paste), paste: @invalid_attrs)
      assert html_response(conn, 200) =~ "Edit Paste"
    end
  end

  describe "delete paste" do
    setup [:create_paste]

    test "deletes chosen paste", %{conn: conn, paste: paste} do
      conn = delete(conn, Routes.paste_path(conn, :delete, paste))
      assert redirected_to(conn) == Routes.paste_path(conn, :index)

      assert_error_sent 404, fn ->
        get(conn, Routes.paste_path(conn, :show, paste))
      end
    end
  end

  defp create_paste(_) do
    paste = fixture(:paste)
    %{paste: paste}
  end
end
