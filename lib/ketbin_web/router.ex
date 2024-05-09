defmodule KetbinWeb.Router do
  use KetbinWeb, :router

  import KetbinWeb.UserAuth

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_flash
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :fetch_current_user
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug :fetch_current_user
  end

  # scope to ensure user is authenticated
  scope "/", KetbinWeb do
    pipe_through [:browser, :require_authenticated_user]

    get "/pastes", PageController, :pastes
  end

  scope "/", KetbinWeb do
    pipe_through :browser

    get "/", PageController, :index
    get "/:id/raw", PageController, :raw

    post "/", PageController, :create
  end

  # scope to check if user is owner of paste
  scope "/", KetbinWeb do
    pipe_through [:browser, :owns_paste]

    get "/:id", PageController, :show
    get "/v/:id", PageController, :showlink
  end

  # scope to ensure user is owner of paste
  scope "/", KetbinWeb do
    pipe_through [:browser, :ensure_owns_paste]

    get "/edit/:id", PageController, :edit
    patch "/:id", PageController, :update
    put "/:id", PageController, :update
  end

  scope "/api", KetbinWeb.Api, as: :api do
    pipe_through :api

    resources "/paste", PasteController, only: [:show, :index, :create]
  end

  # Other scopes may use custom stacks.
  # scope "/api", KetbinWeb do
  #   pipe_through :api
  # end

  # Enables LiveDashboard only for development
  #
  # If you want to use the LiveDashboard in production, you should put
  # it behind authentication and allow only admins to access it.
  # If your application does not have an admins-only section yet,
  # you can use Plug.BasicAuth to set up some basic authentication
  # as long as you are also using SSL (which you should anyway).
  if Mix.env() in [:dev, :test] do
    import Phoenix.LiveDashboard.Router

    scope "/" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: KetbinWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end

  ## Authentication routes

  scope "/", KetbinWeb do
    pipe_through [:browser, :redirect_if_user_is_authenticated]

    get "/users/register", UserRegistrationController, :new
    post "/users/register", UserRegistrationController, :create
    get "/users/log_in", UserSessionController, :new
    post "/users/log_in", UserSessionController, :create
    get "/users/reset_password", UserResetPasswordController, :new
    post "/users/reset_password", UserResetPasswordController, :create
    get "/users/reset_password/:token", UserResetPasswordController, :edit
    put "/users/reset_password/:token", UserResetPasswordController, :update
  end

  scope "/", KetbinWeb do
    pipe_through [:browser, :require_authenticated_user]

    get "/users/settings", UserSettingsController, :edit
    put "/users/settings", UserSettingsController, :update
    get "/users/settings/confirm_email/:token", UserSettingsController, :confirm_email
  end

  scope "/", KetbinWeb do
    pipe_through [:browser]

    delete "/users/log_out", UserSessionController, :delete
    get "/users/confirm", UserConfirmationController, :new
    post "/users/confirm", UserConfirmationController, :create
    get "/users/confirm/:token", UserConfirmationController, :confirm

  end
end
