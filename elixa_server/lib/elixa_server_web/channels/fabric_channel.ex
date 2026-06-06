defmodule ELIXAServerWeb.FabricChannel do
  @moduledoc """
  Canal Phoenix para streaming en tiempo real del fabric distribuido.
  Recibe telemetría del motor Rust vía PubSub y la empuja al browser
  con latencia <10ms.
  """
  use Phoenix.Channel
  require Logger

  def join("fabric:live", _params, socket) do
    Logger.info("[FabricChannel] Cliente conectado: #{inspect(socket.assigns)}")
    # Enviar snapshot inicial con los nodos conocidos
    nodes = ELIXAServer.NodeRegistry.get_all_nodes()
    send(self(), :after_join)
    {:ok, %{status: "connected", node_count: length(nodes)}, socket}
  end

  def handle_info(:after_join, socket) do
    nodes = ELIXAServer.NodeRegistry.get_all_nodes()
    push(socket, "snapshot", %{nodes: nodes})
    Phoenix.PubSub.subscribe(ELIXAServer.PubSub, "fabric:live")
    {:noreply, socket}
  end

  def handle_info({:telemetry, telemetry}, socket) do
    push(socket, "telemetry", telemetry)
    {:noreply, socket}
  end

  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{pong: true, ts: System.system_time(:millisecond)}}, socket}
  end
end
