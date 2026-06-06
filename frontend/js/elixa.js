'use strict';
// ═══════════════════════════════════════════════════════════════
//  ELIXA — Motor 3D Holográfico
//  Three.js + WebGL + Simulador del Fabric Rust/Elixir
// ═══════════════════════════════════════════════════════════════

const ELIXA = (() => {
  // ── Config ──────────────────────────────────────────────────
  const CFG = {
    NODE_COUNT: 64,
    ORBIT_SPEED: 0.00015,
    PARTICLE_COUNT: 2000,
    EDGE_PULSE_SPEED: 0.8,
    TICK_RATE_MS: 80,
  };

  // ── Estado global ────────────────────────────────────────────
  let scene, camera, renderer, raycaster, mouse;
  let nodeObjects = [];    // { mesh, data, glowMesh }
  let edgeObjects = [];    // Line objects
  let particleSystem;
  let particleData = [];   // { from, to, t, speed }
  let fabricData = { nodes: [], tick: 0 };
  let hoveredNode = null;
  let frameCount = 0, lastFpsTime = performance.now(), fps = 0;
  let autoOrbit = true;
  let isDragging = false, prevMouse = { x: 0, y: 0 };
  let cameraTheta = 0, cameraPhi = Math.PI / 3, cameraRadius = 280;

  // ── Colores por estado ───────────────────────────────────────
  const HEALTH_COLORS = {
    nominal:    new THREE.Color(0x10ffb0),
    degraded:   new THREE.Color(0xfbbf24),
    critical:   new THREE.Color(0xff2d6b),
    recovering: new THREE.Color(0x00f5ff),
  };

  // ════════════════════════════════════════════════════════════
  //  SIMULADOR FABRIC (replica lógica del motor Rust en JS)
  // ════════════════════════════════════════════════════════════
  const Simulator = (() => {
    let nodes = [];
    let tick = 0;
    const RNG = () => Math.random();

    function hashEntropy(id, t, sig) {
      // Pseudo-hash determinístico (simula SHA-256)
      let h = 0;
      const s = `${id}-${t}-${sig.toFixed(4)}`;
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      }
      return Math.abs(h % 256) / 255;
    }

    function initNodes() {
      nodes = [];
      const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle
      for (let i = 0; i < CFG.NODE_COUNT; i++) {
        const y = 1 - (i / (CFG.NODE_COUNT - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = phi * i;
        const radius = 100 + RNG() * 35;
        const conns = [];
        const nc = 2 + Math.floor(RNG() * 4);
        for (let j = 0; j < nc; j++) {
          const t = Math.floor(RNG() * CFG.NODE_COUNT);
          if (t !== i) conns.push(`node_${String(t).padStart(3, '0')}`);
        }
        nodes.push({
          id: `node_${String(i).padStart(3, '0')}`,
          x: radius * r * Math.cos(theta),
          y: radius * y,
          z: radius * r * Math.sin(theta),
          signal: RNG(),
          latency_ns: 100 + Math.floor(RNG() * 4900),
          entropy: RNG(),
          health: 'nominal',
          connections: conns,
          packets_sent: 0,
          hash_rate: 1000 + RNG() * 49000,
        });
      }
    }

    function tick_() {
      tick++;
      nodes.forEach(n => {
        const wave = Math.sin(tick * 0.03 + n.x * 0.01) * 0.3;
        n.signal = Math.max(0, Math.min(1, n.signal + wave * 0.05 + (RNG() * 0.1 - 0.05)));
        if (RNG() < 0.02) n.latency_ns = 5000 + Math.floor(RNG() * 45000);
        else n.latency_ns = Math.floor(n.latency_ns * 0.95 + (100 + RNG() * 2000) * 0.05);
        n.entropy = hashEntropy(n.id, tick, n.signal);
        n.hash_rate = n.hash_rate * 0.99 + RNG() * 1000;
        n.packets_sent += Math.floor(RNG() * 100);

        if (n.signal < 0.2 || n.latency_ns > 30000) n.health = 'critical';
        else if (n.signal < 0.4 || n.latency_ns > 15000) n.health = 'degraded';
        else if (n.signal > 0.8 && n.latency_ns < 1000) n.health = 'nominal';
        else n.health = 'recovering';
      });
    }

    function snapshot() {
      const pkts = [];
      for (let i = 0; i < 12; i++) {
        pkts.push({
          from: nodes[Math.floor(RNG() * nodes.length)]?.id,
          to:   nodes[Math.floor(RNG() * nodes.length)]?.id,
          size_bytes: 64 + Math.floor(RNG() * 65472),
        });
      }
      const ge = nodes.reduce((a, n) => a + n.entropy, 0) / nodes.length;
      const th = nodes.reduce((a, n) => a + n.hash_rate, 0) / 1e6;
      const hs = nodes.reduce((a, n) => a + n.hash_rate, 0);
      const ac = nodes.reduce((a, n) => a + n.connections.length, 0);
      return {
        tick, nodes: [...nodes], packets: pkts,
        global_entropy: ge, total_throughput_mbps: th,
        hash_storm_rate: hs, active_connections: ac,
        timestamp_ms: Date.now(),
      };
    }

    return { init: initNodes, tick: tick_, snapshot };
  })();

  // ════════════════════════════════════════════════════════════
  //  THREE.JS — Construcción de la escena 3D
  // ════════════════════════════════════════════════════════════
  function initScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000408, 0.0025);

    // Cámara
    camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
    updateCameraPosition();

    // Renderer WebGL
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Raycaster para interacción
    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 8;
    mouse = new THREE.Vector2(-9999, -9999);

    // Iluminación ambiental
    scene.add(new THREE.AmbientLight(0x0a0a2a, 2));
    const pt = new THREE.PointLight(0x00f5ff, 1.5, 500);
    pt.position.set(0, 0, 0);
    scene.add(pt);

    // Estrellas de fondo
    addStarfield();
  }

  function addStarfield() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(3000 * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * 2000;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x334466, size: 0.6, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Points(geo, mat));
  }

  // ── Nodos ────────────────────────────────────────────────────
  function buildNodes(nodes) {
    nodeObjects.forEach(o => { scene.remove(o.mesh); scene.remove(o.glowMesh); });
    nodeObjects = [];

    nodes.forEach(n => {
      // Esfera principal
      const geo  = new THREE.SphereGeometry(2.8, 16, 16);
      const mat  = new THREE.MeshPhongMaterial({
        color: HEALTH_COLORS[n.health] || HEALTH_COLORS.nominal,
        emissive: HEALTH_COLORS[n.health] || HEALTH_COLORS.nominal,
        emissiveIntensity: 0.6,
        shininess: 80,
        transparent: true, opacity: 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(n.x, n.y, n.z);
      mesh.userData = { nodeId: n.id };
      scene.add(mesh);

      // Halo / Glow (esfera grande translúcida)
      const ggeo  = new THREE.SphereGeometry(5.5, 12, 12);
      const gmat  = new THREE.MeshBasicMaterial({
        color: HEALTH_COLORS[n.health] || HEALTH_COLORS.nominal,
        transparent: true, opacity: 0.08, side: THREE.BackSide,
      });
      const glowMesh = new THREE.Mesh(ggeo, gmat);
      glowMesh.position.copy(mesh.position);
      scene.add(glowMesh);

      nodeObjects.push({ mesh, glowMesh, data: n });
    });
  }

  // ── Aristas ──────────────────────────────────────────────────
  function buildEdges(nodes) {
    edgeObjects.forEach(e => scene.remove(e));
    edgeObjects = [];

    const posMap = {};
    nodes.forEach(n => { posMap[n.id] = new THREE.Vector3(n.x, n.y, n.z); });

    nodes.forEach(n => {
      n.connections.forEach(cid => {
        if (!posMap[cid]) return;
        const pts = [posMap[n.id], posMap[cid]];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: 0x00f5ff,
          transparent: true,
          opacity: 0.12,
        });
        const line = new THREE.Line(geo, mat);
        line.userData = { pulse: Math.random() };
        scene.add(line);
        edgeObjects.push(line);
      });
    });
  }

  // ── Partículas flotantes ──────────────────────────────────────
  function initParticles() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(CFG.PARTICLE_COUNT * 3);
    const colors    = new Float32Array(CFG.PARTICLE_COUNT * 3);
    const sizes     = new Float32Array(CFG.PARTICLE_COUNT);

    for (let i = 0; i < CFG.PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 400;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
      colors[i * 3]     = 0;
      colors[i * 3 + 1] = 0.9;
      colors[i * 3 + 2] = 1.0;
      sizes[i] = 0.5 + Math.random() * 1.5;

      particleData.push({ vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08, vz: (Math.random() - 0.5) * 0.08 });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 1.2, vertexColors: true,
      transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    particleSystem = new THREE.Points(geo, mat);
    scene.add(particleSystem);
  }

  // ════════════════════════════════════════════════════════════
  //  ACTUALIZACIÓN EN TIEMPO REAL
  // ════════════════════════════════════════════════════════════
  function updateNodes(nodes) {
    const posMap = {};
    nodes.forEach(n => { posMap[n.id] = n; });

    nodeObjects.forEach(obj => {
      const n = posMap[obj.data.nodeId || obj.data.id];
      if (!n) return;
      obj.data = n;

      const col = HEALTH_COLORS[n.health] || HEALTH_COLORS.nominal;
      obj.mesh.material.color.lerp(col, 0.12);
      obj.mesh.material.emissive.lerp(col, 0.12);
      obj.glowMesh.material.color.lerp(col, 0.12);

      // Pulso de escala basado en señal
      const s = 1 + n.signal * 0.35;
      obj.mesh.scale.setScalar(s);
      obj.glowMesh.scale.setScalar(s * 1.4);
    });
  }

  function animateParticles(t) {
    const pos = particleSystem.geometry.attributes.position;
    const col = particleSystem.geometry.attributes.color;
    for (let i = 0; i < CFG.PARTICLE_COUNT; i++) {
      let x = pos.getX(i) + particleData[i].vx;
      let y = pos.getY(i) + particleData[i].vy;
      let z = pos.getZ(i) + particleData[i].vz;
      if (Math.abs(x) > 200) x *= -0.98;
      if (Math.abs(y) > 200) y *= -0.98;
      if (Math.abs(z) > 200) z *= -0.98;
      pos.setXYZ(i, x, y, z);

      // Color oscila entre cyan y magenta
      const wave = (Math.sin(t * 0.001 + i * 0.05) + 1) / 2;
      col.setXYZ(i, wave * 0.9, 1 - wave * 0.7, 1);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  function animateEdges(t) {
    edgeObjects.forEach((e, i) => {
      const pulse = (Math.sin(t * 0.001 * CFG.EDGE_PULSE_SPEED + e.userData.pulse * 10) + 1) / 2;
      e.material.opacity = 0.05 + pulse * 0.22;
    });
  }

  // ════════════════════════════════════════════════════════════
  //  RAYCASTING — Detección de nodo bajo el cursor
  // ════════════════════════════════════════════════════════════
  function checkHover() {
    raycaster.setFromCamera(mouse, camera);
    const meshes = nodeObjects.map(o => o.mesh);
    const hits = raycaster.intersectObjects(meshes);
    const tooltip = document.getElementById('tooltip');

    if (hits.length > 0) {
      const obj = nodeObjects.find(o => o.mesh === hits[0].object);
      if (obj) {
        const n = obj.data;
        hoveredNode = n;
        document.getElementById('tt-id').textContent = n.id;
        document.getElementById('tt-sig').textContent = (n.signal * 100).toFixed(1) + '%';
        document.getElementById('tt-lat').textContent = n.latency_ns > 1000 ? (n.latency_ns / 1000).toFixed(1) + ' µs' : n.latency_ns + ' ns';
        document.getElementById('tt-ent').textContent = n.entropy.toFixed(4);
        document.getElementById('tt-hlt').textContent = n.health.toUpperCase();
        document.getElementById('tt-hr').textContent = (n.hash_rate / 1000).toFixed(1) + 'K/s';
        tooltip.classList.add('visible');
      }
    } else {
      hoveredNode = null;
      tooltip.classList.remove('visible');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  HUD — Actualización de paneles
  // ════════════════════════════════════════════════════════════
  const logLines = [];
  const LOG_MSGS = [
    n => `Nodo ${n.id} · señal ${(n.signal * 100).toFixed(1)}% · latencia ${n.latency_ns}ns`,
    n => `Hash storm en ${n.id}: ${(n.hash_rate / 1000).toFixed(1)}K hashes/s`,
    n => `Paquete enrutado vía ${n.id} → entropía ${n.entropy.toFixed(4)}`,
    n => `Estado ${n.health.toUpperCase()} detectado en ${n.id}`,
  ];

  function updateHUD(data) {
    const { nodes, tick, global_entropy, total_throughput_mbps, hash_storm_rate, active_connections } = data;
    if (!nodes || nodes.length === 0) return;

    const avgSig = nodes.reduce((a, n) => a + n.signal, 0) / nodes.length;
    const health = { nominal: 0, degraded: 0, critical: 0, recovering: 0 };
    nodes.forEach(n => { health[n.health] = (health[n.health] || 0) + 1; });

    setText('m-nodes', nodes.length);
    setText('m-entropy', global_entropy.toFixed(4));
    setText('m-throughput', total_throughput_mbps.toFixed(2) + ' MB/s');
    setText('m-hashstorm', formatNum(hash_storm_rate) + '/s');
    setText('m-conns', active_connections);
    setText('m-tick', tick);
    setText('h-nominal',   health.nominal   || 0);
    setText('h-degraded',  health.degraded  || 0);
    setText('h-critical',  health.critical  || 0);
    document.getElementById('bar-signal').style.width = (avgSig * 100).toFixed(1) + '%';

    // Lista de nodos (top 16)
    const nl = document.getElementById('node-list');
    nl.innerHTML = nodes.slice(0, 18).map(n => `
      <div class="node-item">
        <div class="node-dot health-${n.health}"></div>
        <span class="node-id">${n.id}</span>
        <span class="node-sig">${(n.signal * 100).toFixed(0)}%</span>
      </div>`).join('');

    // Log stream
    if (nodes.length > 0 && Math.random() < 0.4) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      const msg = LOG_MSGS[Math.floor(Math.random() * LOG_MSGS.length)](n);
      const cls = n.health === 'critical' ? 'crit' : n.health === 'degraded' ? 'warn' : '';
      const ts  = new Date().toLocaleTimeString('es', { hour12: false });
      logLines.unshift(`<div class="log-line ${cls}"><span class="ts">[${ts}]</span><span class="msg">${msg}</span></div>`);
      if (logLines.length > 6) logLines.pop();
      document.getElementById('log-stream').innerHTML = logLines.join('');
    }

    // FPS
    setText('status-fps', fps.toFixed(0) + ' fps');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function formatNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'G';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  }

  // ════════════════════════════════════════════════════════════
  //  CÁMARA
  // ════════════════════════════════════════════════════════════
  function updateCameraPosition() {
    camera.position.set(
      cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta),
      cameraRadius * Math.cos(cameraPhi),
      cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta)
    );
    camera.lookAt(0, 0, 0);
  }

  // ════════════════════════════════════════════════════════════
  //  LOOP PRINCIPAL
  // ════════════════════════════════════════════════════════════
  let lastTick = 0;

  function animate(t) {
    requestAnimationFrame(animate);

    // FPS
    frameCount++;
    if (t - lastFpsTime > 1000) {
      fps = frameCount * 1000 / (t - lastFpsTime);
      frameCount = 0; lastFpsTime = t;
    }

    // Órbita automática
    if (autoOrbit && !isDragging) {
      cameraTheta += CFG.ORBIT_SPEED * t * 0.01;
      updateCameraPosition();
    }

    // Simulación tick
    if (t - lastTick > CFG.TICK_RATE_MS) {
      Simulator.tick();
      fabricData = Simulator.snapshot();
      lastTick = t;
      updateNodes(fabricData.nodes);
      updateHUD(fabricData);
    }

    animateParticles(t);
    animateEdges(t);
    checkHover();

    renderer.render(scene, camera);
  }

  // ════════════════════════════════════════════════════════════
  //  EVENTOS
  // ════════════════════════════════════════════════════════════
  function bindEvents() {
    const cursorRing = document.getElementById('cursor-ring');
    const cursorDot  = document.getElementById('cursor-dot');
    const tooltip    = document.getElementById('tooltip');

    window.addEventListener('mousemove', e => {
      const cx = e.clientX, cy = e.clientY;
      cursorRing.style.left = cx + 'px'; cursorRing.style.top = cy + 'px';
      cursorDot.style.left  = cx + 'px'; cursorDot.style.top  = cy + 'px';
      tooltip.style.left    = (cx + 20) + 'px'; tooltip.style.top = (cy - 10) + 'px';

      mouse.x = (cx / innerWidth) * 2 - 1;
      mouse.y = -(cy / innerHeight) * 2 + 1;

      if (isDragging) {
        cameraTheta -= (cx - prevMouse.x) * 0.005;
        cameraPhi    = Math.max(0.2, Math.min(Math.PI - 0.2, cameraPhi - (cy - prevMouse.y) * 0.005));
        updateCameraPosition();
        prevMouse = { x: cx, y: cy };
      }
    });

    window.addEventListener('mousedown', e => {
      isDragging = true; autoOrbit = false;
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
      setTimeout(() => { autoOrbit = true; }, 4000);
    });

    window.addEventListener('wheel', e => {
      cameraRadius = Math.max(120, Math.min(600, cameraRadius + e.deltaY * 0.3));
      updateCameraPosition();
    });

    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  INTRO Y BOOTSTRAP
  // ════════════════════════════════════════════════════════════
  function showIntro() {
    const intro = document.getElementById('intro');
    const msg   = document.getElementById('intro-msg');
    const msgs  = [
      'Inicializando motor Rust…',
      'Compilando shaders WebGL…',
      'Generando malla de 64 nodos…',
      'Sincronizando fabric Elixir…',
      'Estableciendo canal de telemetría…',
      'ELIXA listo.',
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < msgs.length) { msg.textContent = msgs[i++]; }
      else {
        clearInterval(iv);
        setTimeout(() => { intro.classList.add('hidden'); }, 400);
      }
    }, 420);
  }

  function boot() {
    showIntro();
    initScene();
    Simulator.init();
    fabricData = Simulator.snapshot();

    buildNodes(fabricData.nodes);
    buildEdges(fabricData.nodes);
    initParticles();
    bindEvents();

    requestAnimationFrame(animate);
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', ELIXA.boot);
