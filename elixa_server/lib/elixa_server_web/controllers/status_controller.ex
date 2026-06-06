defmodule ELIXAServerWeb.StatusController do
  use Phoenix.Controller

  def index(conn, _params) do
    json(conn, %{
      status: "operational",
      version: "1.0.0",
      engine: "Rust + Elixir/Phoenix",
      uptime_ms: System.monotonic_time(:millisecond)
    })
  end

  def nodes(conn, _params) do
    nodes = ELIXAServer.NodeRegistry.get_all_nodes()
    json(conn, %{nodes: nodes, count: length(nodes)})
  end
end
