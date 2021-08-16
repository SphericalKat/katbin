defmodule Ketbin.Utils.Syntax do
  use Rustler, otp_app: :ketbin, crate: "ketbin_utils_syntax"

  # When your NIF is loaded, it will override this function.
  def add(_a, _b), do: error()

  def highlight_text(_text, _lang), do: error()

  defp error(), do: :erlang.nif_error(:nif_not_loaded)
end
