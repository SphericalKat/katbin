defmodule Ketbin.Accounts.UserNotifier do
  import Swoosh.Email
  # For simplicity, this module simply logs messages to the terminal.
  # You should replace it by a proper email or notification tool, such as:
  #
  #   * Swoosh - https://hexdocs.pm/swoosh
  #   * Bamboo - https://hexdocs.pm/bamboo
  #
  defp deliver(to, body, subject) do
    require Logger
    Logger.debug(body)

    Task.start(fn ->
      new()
      |> to(to)
      |> from({"Katbin", "noreply@katb.in"})
      |> subject(subject)
      |> text_body(body)
      |> Ketbin.Mailer.deliver()
    end)

    {:ok, %{to: to, body: body}}
  end

  @doc """
  Deliver instructions to confirm account.
  """
  def deliver_confirmation_instructions(user, url) do
    deliver(
      user.email,
      """

      ==============================

      Hi #{user.email},

      You can confirm your account by visiting the URL below:

      #{url}

      If you didn't create an account with us, please ignore this.

      ==============================
      """,
      "Account confirmation"
    )
  end

  @doc """
  Deliver instructions to reset a user password.
  """
  def deliver_reset_password_instructions(user, url) do
    deliver(
      user.email,
      """

      ==============================

      Hi #{user.email},

      You can reset your password by visiting the URL below:

      #{url}

      If you didn't request this change, please ignore this.

      ==============================
      """,
      "Password reset requested"
    )
  end

  @doc """
  Deliver instructions to update a user email.
  """
  def deliver_update_email_instructions(user, url) do
    deliver(
      user.email,
      """

      ==============================

      Hi #{user.email},

      You can change your email by visiting the URL below:

      #{url}

      If you didn't request this change, please ignore this.

      ==============================
      """,
      "Email update requested"
    )
  end
end
