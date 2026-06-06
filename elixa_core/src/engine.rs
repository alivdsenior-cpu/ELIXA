use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use rand::Rng;
use std::collections::HashMap;

// ─── Estructuras de datos ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub signal: f64,       // 0.0 – 1.0
    pub latency_ns: u64,
    pub entropy: f64,
    pub health: NodeHealth,
    pub connections: Vec<String>,
    pub packets_sent: u64,
    pub hash_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NodeHealth {
    Nominal,
    Degraded,
    Critical,
    Recovering,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Packet {
    pub from: String,
    pub to: String,
    pub size_bytes: u32,
    pub ttl: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Telemetry {
    pub tick: u64,
    pub timestamp_ms: u64,
    pub nodes: Vec<Node>,
    pub packets: Vec<Packet>,
    pub global_entropy: f64,
    pub total_throughput_mbps: f64,
    pub active_connections: usize,
    pub hash_storm_rate: f64,
}

// ─── Motor del cluster ────────────────────────────────────────────────────────

pub struct NodeCluster {
    nodes: HashMap<String, Node>,
    tick_count: u64,
    rng: rand::rngs::ThreadRng,
}

impl NodeCluster {
    pub fn new(count: usize) -> Self {
        let mut rng = rand::thread_rng();
        let mut nodes = HashMap::new();

        // Distribuir nodos en una esfera 3D
        for i in 0..count {
            let id = format!("node_{:03}", i);

            // Golden ratio spiral para distribución uniforme en esfera
            let golden = (1.0 + 5.0_f64.sqrt()) / 2.0;
            let theta = 2.0 * std::f64::consts::PI * (i as f64) / golden;
            let phi = (1.0 - 2.0 * (i as f64 + 0.5) / count as f64).acos();

            let radius = 80.0 + rng.gen::<f64>() * 40.0;
            let x = radius * phi.sin() * theta.cos();
            let y = radius * phi.sin() * theta.sin();
            let z = radius * phi.cos();

            // Conexiones aleatorias (pequeño mundo)
            let num_connections = rng.gen_range(2..6);
            let connections: Vec<String> = (0..num_connections)
                .map(|_| {
                    let target = rng.gen_range(0..count);
                    format!("node_{:03}", target)
                })
                .filter(|t| t != &id)
                .collect();

            nodes.insert(
                id.clone(),
                Node {
                    id,
                    x,
                    y,
                    z,
                    signal: rng.gen(),
                    latency_ns: rng.gen_range(100..5000),
                    entropy: rng.gen(),
                    health: NodeHealth::Nominal,
                    connections,
                    packets_sent: 0,
                    hash_rate: rng.gen_range(1000.0..50000.0),
                },
            );
        }

        Self { nodes, tick_count: 0, rng }
    }

    pub fn tick(&mut self) {
        self.tick_count += 1;
        let tick = self.tick_count;

        // Simulación paralela con Rayon
        let ids: Vec<String> = self.nodes.keys().cloned().collect();

        // Actualizar cada nodo
        for id in &ids {
            if let Some(node) = self.nodes.get_mut(id) {
                Self::evolve_node(node, tick, &mut rand::thread_rng());
            }
        }
    }

    fn evolve_node(node: &mut Node, tick: u64, rng: &mut rand::rngs::ThreadRng) {
        // Señal oscila con ruido
        let wave = (tick as f64 * 0.03 + node.x * 0.01).sin() * 0.3;
        let noise: f64 = rng.gen::<f64>() * 0.1 - 0.05;
        node.signal = (node.signal + wave * 0.05 + noise).clamp(0.0, 1.0);

        // Latencia varía con picos
        if rng.gen::<f64>() < 0.02 {
            node.latency_ns = rng.gen_range(5000..50000); // spike
        } else {
            node.latency_ns = (node.latency_ns as f64 * 0.95 + rng.gen_range(100.0..2000.0) * 0.05) as u64;
        }

        // Entropía — SHA-256 real para simular carga criptográfica
        let mut hasher = Sha256::new();
        hasher.update(format!("{}-{}-{}", node.id, tick, node.signal).as_bytes());
        let result = hasher.finalize();
        node.entropy = result[0] as f64 / 255.0;

        // Hash rate evoluciona
        node.hash_rate = node.hash_rate * 0.99 + rng.gen_range(0.0..1000.0);

        // Salud basada en señal y latencia
        node.health = if node.signal < 0.2 || node.latency_ns > 30000 {
            NodeHealth::Critical
        } else if node.signal < 0.4 || node.latency_ns > 15000 {
            NodeHealth::Degraded
        } else if node.signal > 0.8 && node.latency_ns < 1000 {
            NodeHealth::Nominal
        } else {
            NodeHealth::Recovering
        };

        node.packets_sent += rng.gen_range(0..100);
    }

    pub fn snapshot(&self) -> Telemetry {
        let nodes: Vec<Node> = self.nodes.values().cloned().collect();
        let mut rng = rand::thread_rng();

        // Generar paquetes en tránsito
        let num_packets = rng.gen_range(5..20);
        let node_ids: Vec<&String> = self.nodes.keys().collect();
        let packets: Vec<Packet> = (0..num_packets)
            .map(|_| {
                let from = node_ids[rng.gen_range(0..node_ids.len())].clone();
                let to = node_ids[rng.gen_range(0..node_ids.len())].clone();
                Packet {
                    from,
                    to,
                    size_bytes: rng.gen_range(64..65536),
                    ttl: rng.gen_range(1..128),
                }
            })
            .collect();

        let global_entropy = nodes.iter().map(|n| n.entropy).sum::<f64>() / nodes.len() as f64;
        let total_throughput = nodes.iter().map(|n| n.hash_rate).sum::<f64>() / 1_000_000.0;
        let active_connections = nodes.iter().map(|n| n.connections.len()).sum();
        let hash_storm_rate = nodes.iter().map(|n| n.hash_rate).sum::<f64>();

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Telemetry {
            tick: self.tick_count,
            timestamp_ms: timestamp,
            nodes,
            packets,
            global_entropy,
            total_throughput_mbps: total_throughput,
            active_connections,
            hash_storm_rate,
        }
    }
}
