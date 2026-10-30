/*
  Mesin loader logo 3D CosmicX.

  - three.js dimuat lazy (chunk terpisah) supaya bundle utama tidak membengkak.
  - SATU WebGLRenderer dipakai bersama oleh semua loader di halaman (browser membatasi
    jumlah konteks WebGL ±16). Hasil render digambar ke canvas 2D milik tiap loader.
  - Semua loader selalu satu fase karena animasi hanya bergantung pada waktu.
  - Dua varian: "light" (titanium gelap, untuk latar terang) dan "dark" (krom terang, untuk latar gelap).
*/

const MAXRS = 512;       // ukuran canvas WebGL bersama (px); tiap loader dirender di viewport seukuran dirinya
const DUR = 3.0;         // durasi satu loop (detik)
const BASE_Y = 0.42;
const BASE_X = -0.22;
const TAU = Math.PI * 2;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothBell = (t) => 0.5 * (1 - Math.cos(t * Math.PI * 2));

function smoothSpinCurve(t) {
  if (t < 0.22) {
    const u = t / 0.22;
    return -0.09 * Math.sin(u * Math.PI * 0.5) * smootherstep(u);
  }
  const u = (t - 0.22) / 0.78;
  const base = smootherstep(u);
  const overshoot = Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 1.5) * (1 - u) * 0.14;
  return -0.09 * (1 - base) + base + overshoot;
}

let enginePromise = null;

export function loadCosmicEngine() {
  if (!enginePromise) enginePromise = createEngine();
  return enginePromise;
}

async function createEngine() {
  const [THREE, envMod] = await Promise.all([
    import("three"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);
  const { RoomEnvironment } = envMod;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- renderer bersama (melempar error kalau WebGL tidak ada -> komponen tetap pakai fallback) ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(MAXRS, MAXRS, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.025).texture;
  pmrem.dispose();

  /* ---- geometri logo (koordinat seperti SVG, -50..50) ---- */
  function starShape(top, side, c) {
    const s = new THREE.Shape();
    const P = (x, y) => [x, -y];
    s.moveTo(...P(top[0], -top[1]));
    s.quadraticCurveTo(...P(c, -c), ...P(side[0], -side[1]));
    s.quadraticCurveTo(...P(c, c), ...P(-top[0], top[1]));
    s.quadraticCurveTo(...P(-c, c), ...P(-side[0], side[1]));
    s.quadraticCurveTo(...P(-c, -c), ...P(top[0], -top[1]));
    return s;
  }
  const BODY_DEPTH = 12;
  const BODY_BEVEL = 3.5;
  const bodyGeo = new THREE.ExtrudeGeometry(starShape([1, 47], [50, -1], 9), {
    depth: BODY_DEPTH, curveSegments: 64,
    bevelEnabled: true, bevelThickness: BODY_BEVEL, bevelSize: 2.8, bevelSegments: 18,
  });
  bodyGeo.translate(0, 0, -BODY_DEPTH / 2);
  bodyGeo.computeVertexNormals();

  const SPARK_DEPTH = BODY_DEPTH + BODY_BEVEL * 2 + 1.8;
  const sparkGeo = new THREE.ExtrudeGeometry(starShape([0, 14], [14, 0], 2.6), {
    depth: SPARK_DEPTH, curveSegments: 48,
    bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.0, bevelSegments: 12,
  });
  sparkGeo.translate(0, 0, -SPARK_DEPTH / 2);
  sparkGeo.computeVertexNormals();

  /* ---- rig per varian (dibuat saat pertama dibutuhkan) ---- */
  function makeRig(dark) {
    const scene = new THREE.Scene();
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0, 6);

    const key = new THREE.DirectionalLight(0xfff6e8, 3.6);
    key.position.set(3.5, 4.5, 5);
    const rimCool = new THREE.DirectionalLight(0x9ec5ff, 4.5);
    rimCool.position.set(-4.5, 2.0, -3.5);
    const rimWarm = new THREE.DirectionalLight(0xffd1a6, 2.4);
    rimWarm.position.set(3.5, -3.5, -2.5);
    const fill = new THREE.DirectionalLight(0xdbe8ff, 1.2);
    fill.position.set(-2, -3.5, 4);
    const specLight = new THREE.PointLight(0xffffff, 18, 12, 1.5);
    specLight.position.set(2.2, 1.5, 3.2);
    scene.add(key, rimCool, rimWarm, fill, specLight);

    const bodyMat = dark
      ? new THREE.MeshPhysicalMaterial({
          color: 0xf4f7fc, metalness: 0.96, roughness: 0.09, envMapIntensity: 2.4,
          clearcoat: 1.0, clearcoatRoughness: 0.04, anisotropy: 0.45, anisotropyRotation: Math.PI / 4,
          iridescence: 0.22, iridescenceIOR: 1.5,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x3b4049, metalness: 0.95, roughness: 0.11, envMapIntensity: 2.8,
          clearcoat: 1.0, clearcoatRoughness: 0.03, anisotropy: 0.5, anisotropyRotation: Math.PI / 4,
          iridescence: 0.28, iridescenceIOR: 1.6,
        });
    const sparkMat = dark
      ? new THREE.MeshPhysicalMaterial({
          color: 0x242830, metalness: 0.96, roughness: 0.08, envMapIntensity: 2.6,
          clearcoat: 1.0, clearcoatRoughness: 0.03,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xffffff, metalness: 0.92, roughness: 0.06, envMapIntensity: 2.5,
          emissive: 0xffffff, emissiveIntensity: 0.22, clearcoat: 1.0,
        });

    const logo = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    logo.add(body, spark);
    logo.scale.setScalar(0.02);
    const pivot = new THREE.Group();
    pivot.add(logo);
    scene.add(pivot);

    return { scene, camera, pivot, spark, specLight, exposure: dark ? 1.25 : 1.35 };
  }

  const rigs = {};
  const getRig = (variant) => rigs[variant] || (rigs[variant] = makeRig(variant === "dark"));

  /* ---- animasi (sama dengan demo, termasuk parallax mouse) ---- */
  function animate(rig, time, mx, my) {
    const sec = time * 0.001;
    const t = reduce ? 0.92 : (sec / DUR) % 1;

    const act = seg(t, 0.04, 0.78);
    const spinProgress = smoothSpinCurve(act);
    const prepWave = smoothBell(seg(t, 0.02, 0.28));
    const jumpWave = smoothBell(seg(t, 0.16, 0.72));

    const idleY = Math.sin(t * TAU) * 0.035;
    const idleX = Math.cos(t * TAU) * 0.035;
    const idleZ = Math.sin(t * TAU) * 0.02;

    const ry = BASE_Y + spinProgress * TAU;
    const rx = BASE_X + prepWave * 0.26 + Math.sin(seg(t, 0.16, 0.74) * TAU) * -0.28 * jumpWave + idleX;
    const rz = Math.sin(seg(t, 0.14, 0.74) * TAU) * -0.16 * jumpWave + idleZ;

    const s = 1 - prepWave * 0.11 + jumpWave * 0.08;
    const py = -prepWave * 0.05 + jumpWave * 0.19 + idleY;

    const k = seg(t, 0.36, 0.84);
    rig.spark.rotation.z = smootherstep(k) * Math.PI;
    const pulse = smoothBell(k);
    rig.spark.scale.set(1 + pulse * 0.52, 1 + pulse * 0.52, 1 + pulse * 0.28);

    rig.specLight.position.x = Math.cos(t * TAU) * 2.8;
    rig.specLight.position.y = 1.2 + Math.sin(t * TAU * 2) * 1.1;

    rig.pivot.rotation.set(rx + my, ry + mx, rz);
    rig.pivot.scale.setScalar(s);
    rig.pivot.position.y = py;
  }

  /* ---- loop bersama: tiap loader dirender di resolusi aslinya (px) lalu disalin ke canvas 2D-nya ---- */
  const instances = new Set();
  let raf = 0;

  function frame(time) {
    raf = 0;
    if (!instances.size) return;
    instances.forEach((inst) => {
      const { canvas, ctx } = inst;
      const px = Math.min(MAXRS, Math.max(16, canvas.width));
      inst.mx += (inst.tx - inst.mx) * 0.08;
      inst.my += (inst.ty - inst.my) * 0.08;

      const rig = getRig(inst.variant);
      animate(rig, time, inst.mx, inst.my);
      renderer.toneMappingExposure = rig.exposure;
      renderer.setViewport(0, 0, px, px);
      renderer.render(rig.scene, rig.camera);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // viewport WebGL berasal dari kiri-bawah, canvas dari kiri-atas
      ctx.drawImage(renderer.domElement, 0, MAXRS - px, px, px, 0, 0, canvas.width, canvas.height);
      if (!inst.drawn) { inst.drawn = true; inst.onFirstFrame?.(); }
    });
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  return {
    attach(canvas, variant, onFirstFrame) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return { setVariant() {}, setPointer() {}, detach() {} };
      const inst = { canvas, ctx, variant, onFirstFrame, drawn: false, mx: 0, my: 0, tx: 0, ty: 0 };
      instances.add(inst);
      kick();
      return {
        setVariant(v) { if (inst.variant !== v) { inst.variant = v; kick(); } },
        setPointer(x, y) { if (!reduce) { inst.tx = x; inst.ty = y; } },
        detach() { instances.delete(inst); },
      };
    },
  };
}