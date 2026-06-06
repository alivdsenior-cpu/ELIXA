defmodule ELIXAServer.NodeRegistry do
  @moduledoc """
  Registro de nodos respaldado por ETS.
  Mantiene el estado actual del fabric distribuido.
  Sub-microsecond reads garantizados.
  """
  use GenServer
  require Logger

  @table :elixa_nodes

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  def get_all_nodes do
    case :ets.tab2list(@table) do
      [] -> []
      rows -> Enum.map(rows, fn {_id, node} -> node end)
    end
  end

  def get_node(id) do
    case :ets.lookup(@table, id) do
      [{^id, node}] -> {:ok, node}
      [] -> {:error, :not_found}
    end
  end

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :public, read_concurrency: true])
    Phoenix.PubSub.subscribe(ELIXAServer.PubSub, "fabric:live")
    Logger.info("[NodeRegistry] Registro ETS inicializado. Esperando telemetría...")
    {:ok, %{node_count: 0}}
  end

  @impl true
  def handle_info({:telemetry, %{"nodes" => nodes} = _telemetry}, state) do
    Enum.each(nodes, fn node ->
      :ets.insert(@table, {node["id"], node})
    end)
    {:noreply, %{state | node_count: length(nodes)}}
  end

  @impl true
  def handle_info(_, state), do: {:noreply, state}
end
