import * as THREE from 'three';

// Code-built neon "Discord room": channel panels + scattered message bubbles
// that tidy into rows as the bot arrives. Driven entirely by a 0→1 progress
// value from the scroll track. No external 3D assets (only the mascot image).

export interface HeroScene {
  setProgress(p: number): void;
  setTheme(theme: 'light' | 'dark'): void;
  dispose(): void;
}

// Brand palette (matches styles.css).
const BLUE = 0x3b82f6;
const CYAN = 0x22d3ee;
const INDIGO = 0x6366f1;
const VIOLET = 0x8b5cf6;
const SKY = 0x93c5fd;
const RED = 0xef4444;
const BUBBLE_COLORS = [BLUE, CYAN, INDIGO, VIOLET, SKY];

// Tiny deterministic RNG so the "chaos" layout is stable across reloads.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Bubble {
  mesh: THREE.Mesh;
  dot: THREE.Mesh | null; // red notification dot
  chaos: THREE.Vector3;
  order: THREE.Vector3;
  chaosRot: THREE.Euler;
  phase: number;
}

export function createHeroScene(canvas: HTMLCanvasElement, opts: { mascotUrl: string; theme: 'light' | 'dark' }): HeroScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const center = new THREE.Vector3(0, 0.5, 0);

  const rng = mulberry32(20260720);

  // ── Lights ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const l1 = new THREE.PointLight(CYAN, 40, 40);
  l1.position.set(-6, 6, 6);
  const l2 = new THREE.PointLight(VIOLET, 40, 40);
  l2.position.set(6, -2, 4);
  scene.add(l1, l2);

  // ── Channel panels (the "server rooms" list on the left) ─────────────────
  const panels = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.BoxGeometry(1.6, 0.34, 0.08);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b1220, emissive: BLUE, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.4,
    });
    const panel = new THREE.Mesh(geo, mat);
    panel.position.set(-3.2, 1.4 - i * 0.5, -0.5);
    panels.add(panel);
  }
  scene.add(panels);

  // ── Message bubbles ──────────────────────────────────────────────────────
  const bubbles: Bubble[] = [];
  const COLS = 4;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const w = 1.3 + rng() * 0.5;
    const geo = new THREE.BoxGeometry(w, 0.42, 0.12);
    const color = BUBBLE_COLORS[i % BUBBLE_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0e1626, emissive: color, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Ordered target: neat rows to the right of the panels.
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const order = new THREE.Vector3(-0.6 + col * 0.05, 1.6 - row * 0.7, 0.1 - w * 0.15 + col * 0.0);
    order.x = -0.4 + (w / 2) * 0.2; // left-align feel
    order.set(-0.2, 1.55 - row * 0.72, 0.0);

    // Chaotic scatter.
    const chaos = new THREE.Vector3(
      -1.5 + rng() * 4.5,
      -1.8 + rng() * 4,
      -1.5 + rng() * 3,
    );
    const chaosRot = new THREE.Euler((rng() - 0.5) * 1.4, (rng() - 0.5) * 1.4, (rng() - 0.5) * 1.2);

    mesh.position.copy(chaos);
    mesh.rotation.copy(chaosRot);
    scene.add(mesh);

    // Red notification dot on ~half of them (chaos only).
    let dot: THREE.Mesh | null = null;
    if (i % 2 === 0) {
      dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 16),
        new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 1.2, transparent: true }),
      );
      mesh.add(dot);
      dot.position.set(w / 2 - 0.05, 0.18, 0.08);
    }

    bubbles.push({ mesh, dot, chaos, order, chaosRot, phase: rng() * Math.PI * 2 });
  }

  // ── Bot mascot (billboard plane) ─────────────────────────────────────────
  const mascot = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  mascot.position.set(0.3, 0.5, 1.2);
  scene.add(mascot);
  new THREE.TextureLoader().load(opts.mascotUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    (mascot.material as THREE.MeshBasicMaterial).map = tex;
    (mascot.material as THREE.MeshBasicMaterial).needsUpdate = true;
  });

  // ── Sizing ───────────────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Animation ────────────────────────────────────────────────────────────
  let targetP = 0;
  let curP = 0;
  let raf = 0;
  const clock = new THREE.Clock();

  function frame() {
    raf = requestAnimationFrame(frame);
    curP += (targetP - curP) * 0.08; // ease toward the scrolled progress
    const t = clock.getElapsedTime();

    const tidy = smoothstep(0.55, 1, curP); // 0 = chaos, 1 = ordered rows
    const appear = smoothstep(0.6, 0.86, curP); // mascot fly-in

    for (const b of bubbles) {
      const jitter = (1 - tidy) * 0.12;
      b.mesh.position.x = lerp(b.chaos.x, b.order.x, tidy) + Math.sin(t * 1.3 + b.phase) * jitter;
      b.mesh.position.y = lerp(b.chaos.y, b.order.y, tidy) + Math.cos(t * 1.1 + b.phase) * jitter;
      b.mesh.position.z = lerp(b.chaos.z, b.order.z, tidy);
      b.mesh.rotation.x = lerp(b.chaosRot.x, 0, tidy);
      b.mesh.rotation.y = lerp(b.chaosRot.y, 0, tidy);
      b.mesh.rotation.z = lerp(b.chaosRot.z, 0, tidy);
      if (b.dot) {
        const m = b.dot.material as THREE.MeshStandardMaterial;
        m.opacity = 1 - tidy;
        b.dot.visible = tidy < 0.98;
      }
    }

    // Mascot flies in from above, fades + scales up.
    mascot.position.y = lerp(4.5, 0.7, appear);
    mascot.scale.setScalar(lerp(0.6, 1, appear));
    (mascot.material as THREE.MeshBasicMaterial).opacity = appear;

    // Camera orbits around the room; the sweep peaks during the middle beat.
    const angle = lerp(-0.55, 0.6, smoothstep(0.15, 0.75, curP)) + Math.sin(t * 0.2) * 0.03;
    const radius = 7.5 - appear * 1.2;
    camera.position.set(Math.sin(angle) * radius, lerp(1.6, 0.9, curP), Math.cos(angle) * radius);
    mascot.position.x = camera.position.x * 0.04 + 0.3; // keep the mascot facing the camera-ish
    mascot.lookAt(camera.position);
    camera.lookAt(center);

    renderer.render(scene, camera);
  }
  frame();

  return {
    setProgress(p) { targetP = p; },
    setTheme(theme) {
      // Slightly lift ambient on light backgrounds so emissive still reads.
      const amb = scene.children.find((c) => c instanceof THREE.AmbientLight) as THREE.AmbientLight | undefined;
      if (amb) amb.intensity = theme === 'light' ? 0.75 : 0.55;
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
    },
  };
}
