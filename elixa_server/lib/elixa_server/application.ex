defmodule ELIXAServer.Application do
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      ELIXAServerWeb.Endpoint,
      {Phoenix.PubSub, name: ELIXAServer.PubSub},
      ELIXAServer.NodeRegistry,
      ELIXAServer.RustPort
    ]

    opts = [strategy: :one_for_one, name: ELIXAServer.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
