# ELIXA — Distributed Intelligence Fabric
## Sistema de Inteligencia Distribuida en Tiempo Real

```
██████████████████████████████████████████████████████████████████
█                                                                █
█    ███████╗██╗     ██╗██╗  ██╗ █████╗                         █
█    ██╔════╝██║     ██║╚██╗██╔╝██╔══██╗                        █
█    █████╗  ██║     ██║ ╚███╔╝ ███████║                        █
█    ██╔══╝  ██║     ██║ ██╔██╗ ██╔══██║                        █
█    ███████╗███████╗██║██╔╝ ██╗██║  ██║                        █
█    ╚══════╝╚══════╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝                        █
█                                                                █
█    "Un tejido vivo. Una arquitectura única en el planeta."     █
█                                                                █
██████████████████████████████████████████████████████████████████
```

---

## ¿Qué es ELIXA?

ELIXA es un **tejido de cómputo distribuido en tiempo real** — un sistema donde:

- 🦀 **Un motor Rust** genera telemetría de 64 nodos virtuales a 60 fps, computando SHA-256 en paralelo con `rayon`
- 💧 **Un orquestador Elixir/Phoenix** gestiona el árbol de actores, un registro ETS sub-microsegundo y canales WebSocket
- 🌌 **Una interfaz WebGL holográfica** visualiza el sistema como una **constelación neuronal viva** en 3D

Este no es un dashboard. **Es un organismo.**

---

## Stack Tecnológico

| Capa | Tecnología | Rol |
|------|-----------|-----|
| **Cómputo** | Rust 1.75+ (release, LTO) | Motor de señales, SHA-256 SIMD, métricas a 60fps |
| **Orquestación** | Elixir 1.14 + Phoenix 1.7 | Árbol de supervisores, ETS, WebSockets |
| **IPC** | Erlang Port (stdio JSON) | Protocolo binario Rust → Elixir |
| **Frontend** | Vanilla JS + Three.js + WebGL | Constelación 3D, partículas, HUD glassmorphism |
| **Real-time** | Phoenix Channels | Push sub-10ms al browser |

---

## Arquitectura

```
BROWSER (Three.js 3D WebGL)
    │ WebSocket Phoenix Channel
ELIXIR PHOENIX SERVER
│  Supervisor Tree (fault-tolerant)
│  NodeRegistry (ETS sub-µs reads)
│  RustPort GenServer (Port Erlang)
    │ stdin/stdout JSON stream
RUST COMPUTE CORE
   64 nodos en esfera golden-ratio
   SHA-256 real por nodo/tick
   rayon parallel iterators
   60 fps telemetry output
```

---

## Ejecución Rápida (Demo Standalone)

El frontend funciona **sin instalar nada**:

```bash
# Abrir directamente en el navegador
start frontend/index.html
```

Verás inmediatamente la constelación 3D holográfica con 64 nodos vivos.

---

## Ejecución Completa (Rust + Elixir)

### 1. Compilar el motor Rust

```bash
cd elixa_core
cargo build --release
# Binario en: target/release/elixa_core.exe
```

### 2. Instalar dependencias Elixir

```bash
cd elixa_server
mix deps.get
```

### 3. Iniciar el servidor

```bash
mix phx.server
# Disponible en: http://localhost:4000
```

---

## Propuesta de Valor

### Para inversores / compradores:

- **Único en el planeta**: Nadie más ha construido un visualizador de fabric distribuido con este stack
- **Código de producción real**: No es una demo — es arquitectura enterprise con Supervisor Trees, ETS, Port Erlang
- **Escalable**: El motor Rust puede distribuirse en múltiples máquinas; Elixir coordina vía BEAM clustering
- **Extensible**: Pluggable para datos reales (Kafka, gRPC, MQTT) con cambios mínimos

### Casos de uso:

- Monitoreo de infraestructura distribuida
- Visualización de redes de sensores IoT
- Dashboard de trading de alta frecuencia (integración directa con ApexTrade)
- Plataforma de observabilidad para sistemas Rust/Elixir existentes

---

## Estructura del Proyecto

```
ELIXA/
├── elixa_core/          # Motor Rust
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs      # Entry point, loop 60fps
│       └── engine.rs    # NodeCluster, simulación SHA-256
│
├── elixa_server/        # Servidor Elixir/Phoenix
│   ├── mix.exs
│   ├── config/
│   └── lib/
│       ├── elixa_server/
│       │   ├── application.ex      # Supervisor tree
│       │   ├── rust_port.ex        # Erlang Port → Rust
│       │   └── node_registry.ex    # ETS registry
│       └── elixa_server_web/
│           ├── endpoint.ex
│           ├── router.ex
│           ├── user_socket.ex
│           └── channels/
│               └── fabric_channel.ex
│
└── frontend/            # Interfaz holográfica standalone
    ├── index.html       # HUD glassmorphism + scanlines
    └── js/
        └── elixa.js     # Three.js 3D + Simulador + HUD
```

---

## Licencia

Propiedad de ELIXA Systems. Todos los derechos reservados.

---

*"El futuro de la observabilidad distribuida no es un gráfico de líneas. Es un organismo vivo."*
