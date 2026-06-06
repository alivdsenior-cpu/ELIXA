use std::io::{self, Write};
use std::time::{Duration, Instant};
use std::thread;

mod engine;
use engine::{NodeCluster, Telemetry};

fn main() {
    let stderr = io::stderr();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    eprintln!("[ELIXA CORE] Motor de cómputo Rust iniciado.");
    eprintln!("[ELIXA CORE] Generando malla de nodos distribuidos...");

    let mut cluster = NodeCluster::new(64);
    let target_fps = 60u64;
    let frame_duration = Duration::from_millis(1000 / target_fps);

    loop {
        let frame_start = Instant::now();

        cluster.tick();

        let telemetry: Telemetry = cluster.snapshot();
        let json = serde_json::to_string(&telemetry).unwrap();

        if writeln!(out, "{}", json).is_err() {
            eprintln!("[ELIXA CORE] Canal stdout cerrado. Terminando.");
            break;
        }
        out.flush().ok();

        let elapsed = frame_start.elapsed();
        if elapsed < frame_duration {
            thread::sleep(frame_duration - elapsed);
        }
    }
}
