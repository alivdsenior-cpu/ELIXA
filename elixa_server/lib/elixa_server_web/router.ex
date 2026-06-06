defmodule ELIXAServerWeb.Router do
  use Phoenix.Router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :browser do
    plug :accepts, ["html"]
  end

  scope "/api", ELIXAServerWeb do
    pipe_through :api

    get "/status", StatusController, :index
    get "/nodes",  StatusController, :nodes
  end

  scope "/", ELIXAServerWeb do
    pipe_through :browser
    get "/*path", PageController, :index
  end
end
