defmodule ELIXAServerWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :elixa_server

  socket "/socket", ELIXAServerWeb.UserSocket,
    websocket: [timeout: 45_000],
    longpoll: false

  plug CORSPlug, origin: ["*"]
  plug Plug.Static,
    at: "/",
    from: {:elixa_server, "priv/static"},
    gzip: false

  plug Plug.RequestId
  plug Plug.Logger

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug ELIXAServerWeb.Router
end
