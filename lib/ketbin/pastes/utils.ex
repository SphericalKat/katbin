defmodule Ketbin.Pastes.Utils do
  defp rand_vowel do
    String.graphemes("aeiou")
    |> Enum.take_random(1)
    |> Enum.at(0)
  end

  defp rand_consonant do
    String.graphemes("bcdfghjklmnpqrstvwxyz")
    |> Enum.take_random(1)
    |> Enum.at(0)
  end

  def generate_key(length \\ 10) do
    random = Enum.random([0, 1])
    Enum.map(0..length, fn i -> if Integer.mod(i, 2) == random, do: rand_consonant(), else: rand_vowel() end)
    |> List.to_string
  end
end
