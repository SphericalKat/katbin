defmodule Ketbin.PastesTest do
  use Ketbin.DataCase

  alias Ketbin.Pastes

  describe "pastes" do
    alias Ketbin.Pastes.Paste

    @valid_attrs %{content: "some content", is_url: true}
    @update_attrs %{content: "some updated content", is_url: false}
    @invalid_attrs %{content: nil, is_url: nil}

    def paste_fixture(attrs \\ %{}) do
      {:ok, paste} =
        attrs
        |> Enum.into(@valid_attrs)
        |> Pastes.create_paste()

      paste
    end

    test "list_pastes/0 returns all pastes" do
      paste = paste_fixture()
      assert Pastes.list_pastes() == [paste]
    end

    test "get_paste!/1 returns the paste with given id" do
      paste = paste_fixture()
      assert Pastes.get_paste!(paste.id) == paste
    end

    test "create_paste/1 with valid data creates a paste" do
      assert {:ok, %Paste{} = paste} = Pastes.create_paste(@valid_attrs)
      assert paste.content == "some content"
      assert paste.is_url == true
    end

    test "create_paste/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Pastes.create_paste(@invalid_attrs)
    end

    test "update_paste/2 with valid data updates the paste" do
      paste = paste_fixture()
      assert {:ok, %Paste{} = paste} = Pastes.update_paste(paste, @update_attrs)
      assert paste.content == "some updated content"
      assert paste.is_url == false
    end

    test "update_paste/2 with invalid data returns error changeset" do
      paste = paste_fixture()
      assert {:error, %Ecto.Changeset{}} = Pastes.update_paste(paste, @invalid_attrs)
      assert paste == Pastes.get_paste!(paste.id)
    end

    test "delete_paste/1 deletes the paste" do
      paste = paste_fixture()
      assert {:ok, %Paste{}} = Pastes.delete_paste(paste)
      assert_raise Ecto.NoResultsError, fn -> Pastes.get_paste!(paste.id) end
    end

    test "change_paste/1 returns a paste changeset" do
      paste = paste_fixture()
      assert %Ecto.Changeset{} = Pastes.change_paste(paste)
    end
  end
end
