defmodule ELIXAServer.RustPort do
  @moduledoc """
  GenServer que gestiona el proceso Rust como un Puerto Erlang.
  Lee telemetría JSON desde stdout del binario Rust y la difunde
  al canal Phoenix "fabric:live" vía PubSub.
  """
  use GenServer
  require Logger

  @rust_binary "./elixa_core/target/release/elixa_core"

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    Logger.info("[RustPort] Iniciando motor de cómputo Rust...")
    port = open_port()
    {:ok, %{port: port, buffer: ""}}
  end

  defp open_port do
    Port.open({:spawn_executable, System.find_executable("sh") || @rust_binary}, [
      {:args, ["-c", @rust_binary]},
      {:packet, 0},
      :binary,
      :exit_status,
      :stderr_to_stdout
    ])
  end

  @impl true
  def handle_info({port, {:data, data}}, %{port: port, buffer: buffer} = state) do
    combined = buffer <> data
    lines = String.split(combined, "\n")

    # La última parte puede estar incompleta
    {complete, [incomplete]} = Enum.split(lines, -1)

    Enum.each(complete, fn line ->
      line = String.trim(line)
      if line != "" do
        case Jason.decode(line) do
          {:ok, telemetry} ->
            Phoenix.PubSub.broadcast(
              ELIXAServer.PubSub,
              "fabric:live",
              {:telemetry, telemetry}
            )
          {:error, _} ->
            Logger.debug("[RustPort] Log del motor: #{line}")
        end
      end
    end)

    {:noreply, %{state | buffer: incomplete}}
  end

  @impl true
  def handle_info({port, {:exit_status, code}}, %{port: port} = state) do
    Logger.warning("[RustPort] Motor Rust terminó con código #{code}. Reiniciando en 2s...")
    Process.send_after(self(), :restart, 2000)
    {:noreply, %{state | port: nil}}
  end

  @impl true
  def handle_info(:restart, state) do
    Logger.info("[RustPort] Reiniciando motor Rust...")
    port = open_port()
    {:noreply, %{state | port: port, buffer: ""}}
  end
end
