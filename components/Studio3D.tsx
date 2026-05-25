"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// --- Types ---
interface Stats {
  fps: number;
  vertices: number;
  triangles: number;
  gpuMemory: string;
}

// --- HUD components ---
function HUDBracket({ style }: { style: React.CSSProperties }) {
  const s = 22, t = 2, c = "rgba(45,212,191,0.5)";
  return (
    <svg width={s} height={s} style={{ position: "absolute", ...style }}>
      <rect x={0} y={0} width={s} height={t} fill={c} />
      <rect x={0} y={0} width={t} height={s} fill={c} />
    </svg>
  );
}

// --- Main Component ---
export default function Studio3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uvCanvasRef = useRef<HTMLCanvasElement>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<"scan" | "edit">("scan");
  const [photosCount, setPhotosCount] = useState(6);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState("Oczekiwanie...");
  const [consoleLogs, setConsoleLogs] = useState<string[]>(["> Inicjalizacja systemu fotogrametrii..."]);
  const [opLogs, setOpLogs] = useState<string[]>(["[System] Inicjalizacja historii..."]);
  const [isBackClosed, setIsBackClosed] = useState(true);
  const [areNormalsInverted, setAreNormalsInverted] = useState(false);
  const [modelDepth, setModelDepth] = useState(1.8);
  const [showScanComplete, setShowScanComplete] = useState(false);
  const [stats, setStats] = useState<Stats>({ fps: 0, vertices: 0, triangles: 0, gpuMemory: "0" });
  const [showAlert, setShowAlert] = useState(false);

  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointCloudRef = useRef<THREE.Points | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const clippingPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.5));
  const isClippingRef = useRef(false);
  const clipStartTimeRef = useRef(0);

  // Helper: Log operation
  const logOp = useCallback((msg: string) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setOpLogs(prev => [`[${timeStr}] ${msg}`, ...prev].slice(0, 5));
  }, []);

  // Helper: Log to scanner console
  const logScan = useCallback((msg: string) => {
    setConsoleLogs(prev => [...prev, `> ${msg}`]);
  }, []);

  // UV Preview Drawing
  const drawUVPreview = useCallback(() => {
    const canvas = uvCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 200, 200);
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 1.5;

    // Lenses
    ctx.beginPath(); ctx.arc(65, 85, 25, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(135, 85, 25, 0, Math.PI * 2); ctx.stroke();

    // Frame
    ctx.beginPath(); ctx.strokeRect(25, 45, 150, 110);

    // Inner lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.5;
    [65, 135].forEach(cx => {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, 85);
        ctx.lineTo(cx + Math.cos(angle) * 25, 85 + Math.sin(angle) * 25);
        ctx.stroke();
      }
    });

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("L", 65, 87);
    ctx.fillText("P", 135, 87);
    ctx.fillStyle = "#2dd4bf";
    ctx.font = "10px monospace";
    ctx.fillText("UV Density: OK", 100, 180);
  }, []);

  useEffect(() => {
    if (activeTab === "edit") drawUVPreview();
  }, [activeTab, drawUVPreview]);

  // Three.js Core Logic
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0f172a, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0.5, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.3;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    dirLight.position.set(5, 12, 7);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x2dd4bf, 0.45);
    fillLight.position.set(-5, 4, -5);
    scene.add(fillLight);
    const pointLight = new THREE.PointLight(0xf43f5e, 1.2, 10);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    const gridHelper = new THREE.GridHelper(10, 20, 0x14b8a6, 0x334155);
    gridHelper.position.y = -1.6;
    scene.add(gridHelper);

    // --- Geometries ---
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Point Cloud
    const particleCount = 20000;
    const pos = new Float32Array(particleCount * 3);
    const tar = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);

    const rnd = () => Math.random();
    const rng = (a: number, b: number) => a + rnd() * (b - a);

    let idx = 0;
    const addPt = (x: number, y: number, z: number) => {
      if (idx >= particleCount) return;
      pos[idx * 3] = rng(-4, 4);
      pos[idx * 3 + 1] = rng(-2.5, 2.5);
      pos[idx * 3 + 2] = rng(-2.5, 2.5);
      tar[idx * 3] = x;
      tar[idx * 3 + 1] = y;
      tar[idx * 3 + 2] = z;
      col[idx * 3] = 0.278;
      col[idx * 3 + 1] = 0.333;
      col[idx * 3 + 2] = 0.412;
      idx++;
    };

    const addSphere = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const theta = Math.acos(2 * rnd() - 1);
        const phi = rnd() * Math.PI * 2;
        const sx = Math.sin(theta) * Math.cos(phi);
        const sy = Math.sin(theta) * Math.sin(phi);
        const sz = Math.cos(theta);
        addPt(cx + sx * rx, cy + sy * ry, cz + sz * rz);
      }
    };

    const addTorus = (cx: number, cy: number, cz: number, R: number, r: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const u = rnd() * Math.PI * 2;
        const v = rnd() * Math.PI * 2;
        const x = (R + r * Math.cos(v)) * Math.cos(u);
        const y = (R + r * Math.cos(v)) * Math.sin(u);
        const z = r * Math.sin(v);
        addPt(cx + x, cy + y, cz + z);
      }
    };

    // Build VR Goggle shape
    addSphere(0, 0.05, 0, 1.05, 1.25, 1.05, Math.floor(particleCount * 0.12));
    addSphere(-0.52, 0.05, 0.72, 0.38, 0.36, 0.22, Math.floor(particleCount * 0.10));
    addTorus(-0.52, 0.05, 0.72, 0.38, 0.055, Math.floor(particleCount * 0.06));
    addSphere(0.52, 0.05, 0.72, 0.38, 0.36, 0.22, Math.floor(particleCount * 0.10));
    addTorus(0.52, 0.05, 0.72, 0.38, 0.055, Math.floor(particleCount * 0.06));

    while (idx < particleCount) {
      addPt(rng(-2, 2), rng(-1, 1), rng(-1, 1));
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (particleGeo as any).userData = { startPositions: pos.slice(), targetPositions: tar };

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    const pointCloud = new THREE.Points(particleGeo, particleMaterial);
    scene.add(pointCloud);
    pointCloudRef.current = pointCloud;

    // Render loop
    let rafId: number;
    let frames = 0;
    let lastTime = performance.now();

    const animate = (time: number) => {
      rafId = requestAnimationFrame(animate);

      // FPS tracking
      frames++;
      if (time >= lastTime + 1000) {
        const fps = Math.round((frames * 1000) / (time - lastTime));
        const vertices = renderer.info.render.vertices;
        const triangles = renderer.info.render.triangles;
        const gpuMem = ((vertices * 12 + triangles * 4) / 1024 / 1024).toFixed(3);
        setStats({ fps, vertices, triangles, gpuMemory: gpuMem });
        frames = 0;
        lastTime = time;
      }

      // Clipping animation
      if (isClippingRef.current) {
        const elapsed = (performance.now() - clipStartTimeRef.current) / 1000;
        if (elapsed <= 2) {
          const wave = Math.sin((elapsed / 2) * Math.PI);
          clippingPlaneRef.current.constant = THREE.MathUtils.lerp(1.2, -1.2, wave);
        } else {
          clippingPlaneRef.current.constant = 0.5;
        }
      }

      // Auto-rotation
      if (activeTab === "scan" && !isScanning) {
        pointCloud.rotation.y += 0.003;
      } else if (isScanning) {
        pointCloud.rotation.y += 0.02;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    // Resize
    const obs = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    obs.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId);
      obs.disconnect();
      renderer.dispose();
      particleGeo.dispose();
      particleMaterial.dispose();
      scene.clear();
    };
  }, []);

  // Update Solid Model
  useEffect(() => {
    const group = modelGroupRef.current;
    const pointCloud = pointCloudRef.current;
    if (!group || !pointCloud) return;

    if (activeTab === "scan") {
      group.visible = false;
      pointCloud.visible = true;
      return;
    }

    group.visible = true;
    pointCloud.visible = false;
    group.clear();

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.25,
      metalness: 0.8,
      side: areNormalsInverted ? THREE.BackSide : THREE.DoubleSide,
      clippingPlanes: isClippingRef.current ? [clippingPlaneRef.current] : []
    });

    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.75,
      side: areNormalsInverted ? THREE.BackSide : THREE.DoubleSide,
      clippingPlanes: isClippingRef.current ? [clippingPlaneRef.current] : []
    });

    const eyeRadius = 0.8, eyeSpacing = 0.9;

    // Lenses
    for (let side of [-1, 1]) {
      const frameGeo = new THREE.CylinderGeometry(eyeRadius, eyeRadius - 0.15, modelDepth, 16, 1, !isBackClosed);
      frameGeo.rotateX(Math.PI / 2);
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      frameMesh.position.set(side * eyeSpacing, 0.1, modelDepth / 2);
      group.add(frameMesh);

      const lensGeo = new THREE.CylinderGeometry(eyeRadius - 0.05, eyeRadius - 0.05, 0.05, 16);
      lensGeo.rotateX(Math.PI / 2);
      const lensMesh = new THREE.Mesh(lensGeo, lensMat);
      lensMesh.position.set(side * eyeSpacing, 0.1, modelDepth - 0.1);
      group.add(lensMesh);
    }

    // Bridge
    const bridgeGeo = new THREE.BoxGeometry(0.8, 0.25, 0.2);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, frameMat);
    bridgeMesh.position.set(0, 0.2, modelDepth - 0.1);
    group.add(bridgeMesh);

    // Skirt
    const skirtShape = new THREE.Shape();
    skirtShape.moveTo(-2.2, -0.6);
    skirtShape.lineTo(2.2, -0.6);
    skirtShape.quadraticCurveTo(2.4, 0.8, 2.0, 1.1);
    skirtShape.lineTo(-2.0, 1.1);
    skirtShape.quadraticCurveTo(-2.4, 0.8, -2.2, -0.6);

    const noseCutout = new THREE.Path();
    noseCutout.moveTo(-0.4, -0.65);
    noseCutout.lineTo(0, -0.1);
    noseCutout.lineTo(0.4, -0.65);
    noseCutout.lineTo(-0.4, -0.65);
    skirtShape.holes.push(noseCutout);

    const skirtGeo = new THREE.ExtrudeGeometry(skirtShape, {
      depth: modelDepth,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, frameMat);
    skirtMesh.position.z = -0.05;
    group.add(skirtMesh);

    if (isBackClosed) {
      const backCoverGeo = new THREE.ShapeGeometry(skirtShape);
      const backCoverMesh = new THREE.Mesh(backCoverGeo, frameMat);
      backCoverMesh.position.z = -0.05;
      backCoverMesh.rotation.y = Math.PI;
      group.add(backCoverMesh);
    }

    group.position.set(0, 0, -modelDepth/2);

    return () => {
      frameMat.dispose();
      lensMat.dispose();
    };
  }, [activeTab, isBackClosed, areNormalsInverted, modelDepth]);

  // Scan Logic
  const startScan = () => {
    if (isScanning || photosCount < 3) return;

    setIsScanning(true);
    setScanProgress(0);
    logOp("Rozpoczęto rekonstrukcję chmury punktów AI");

    const phases = [
      { end: 20, text: "Weryfikacja zdjęć...", log: "Znaleziono średnio 1420 punktów kluczowych." },
      { end: 45, text: "Orientowanie kamer...", log: "Rozwiązano układ kolinearności kamer." },
      { end: 70, text: "Generowanie chmury...", log: "Zrekonstruowano 2000 unikalnych wierzchołków." },
      { end: 90, text: "Rekonstrukcja powierzchni...", log: "Siatkowanie trójkątów i normale." },
      { end: 100, text: "Optymalizacja...", log: "Rekonstrukcja ukończona pomyślnie." }
    ];

    let currentPhaseIdx = 0;
    const interval = setInterval(() => {
      setScanProgress(prev => {
        const next = prev + 2;

        // Morph particles
        if (pointCloudRef.current) {
          const geo = pointCloudRef.current.geometry;
          const posAttr = geo.attributes.position;
          const colAttr = geo.attributes.color;
          const factor = next / 100;
          const { startPositions, targetPositions } = (geo as any).userData;

          for (let i = 0; i < posAttr.count; i++) {
            const idx = i * 3;
            const curX = THREE.MathUtils.lerp(startPositions[idx], targetPositions[idx], factor);
            const curY = THREE.MathUtils.lerp(startPositions[idx+1], targetPositions[idx+1], factor);
            const curZ = THREE.MathUtils.lerp(startPositions[idx+2], targetPositions[idx+2], factor);
            posAttr.setXYZ(i, curX, curY, curZ);

            let r = THREE.MathUtils.lerp(0.278, 0.176, factor);
            let g = THREE.MathUtils.lerp(0.333, 0.831, factor);
            let b = THREE.MathUtils.lerp(0.412, 0.749, factor);

            const dx = targetPositions[idx] - curX;
            const dy = targetPositions[idx+1] - curY;
            const dz = targetPositions[idx+2] - curZ;
            const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (d < 0.12 && factor > 0.4) { r=0.97, g=0.98, b=0.98; }
            colAttr.setXYZ(i, r, g, b);
          }
          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
        }

        if (next >= phases[currentPhaseIdx].end && currentPhaseIdx < phases.length - 1) {
          logScan(phases[currentPhaseIdx].log);
          currentPhaseIdx++;
          setScanPhase(phases[currentPhaseIdx].text);
        }

        if (next >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          setShowScanComplete(true);
          logOp("Ukończono rekonstrukcję chmury punktów AI");
          return 100;
        }
        return next;
      });
    }, 100);
  };

  const handleExport = () => {
    // Real STL export logic
    let stl = "solid gogle_rekonstrukcja_ai\n";
    const group = modelGroupRef.current;
    if (!group) return;

    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const geo = mesh.geometry;
        const posAttr = geo.attributes.position;
        if (!posAttr) return;

        const index = geo.index;
        mesh.updateMatrixWorld(true);
        const matrix = mesh.matrixWorld;

        const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
        const cb = new THREE.Vector3(), ab = new THREE.Vector3(), normal = new THREE.Vector3();

        const processFace = (a: number, b: number, c: number) => {
          vA.fromBufferAttribute(posAttr, a).applyMatrix4(matrix);
          vB.fromBufferAttribute(posAttr, b).applyMatrix4(matrix);
          vC.fromBufferAttribute(posAttr, c).applyMatrix4(matrix);
          cb.subVectors(vC, vB); ab.subVectors(vA, vB);
          cb.cross(ab).normalize(); normal.copy(cb);
          stl += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
          stl += "    outer loop\n";
          stl += `      vertex ${vA.x} ${vA.y} ${vA.z}\n`;
          stl += `      vertex ${vB.x} ${vB.y} ${vB.z}\n`;
          stl += `      vertex ${vC.x} ${vC.y} ${vC.z}\n`;
          stl += "    endloop\n  endfacet\n";
        };

        if (index) {
          for (let i = 0; i < index.count; i += 3) processFace(index.getX(i), index.getX(i+1), index.getX(i+2));
        } else {
          for (let i = 0; i < posAttr.count; i += 3) processFace(i, i+1, i+2);
        }
      }
    });
    stl += "endsolid gogle_rekonstrukcja_ai\n";

    const blob = new Blob([stl], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = 'reconstructed_goggles.stl';
    link.href = URL.createObjectURL(blob);
    link.click();

    logOp("Wyeksportowano naprawiony plik STL");
    setShowAlert(true);
    setTimeout(() => setShowAlert(false), 3000);
  };

  const toggleClip = () => {
    if (activeTab !== "edit") return;
    isClippingRef.current = true;
    clipStartTimeRef.current = performance.now();
    logOp("Aktywowano dynamiczny przekrój gogli");
    setTimeout(() => {
      isClippingRef.current = false;
      logOp("Deaktywowano przekrój gogli");
    }, 3000);
  };

  const setCameraView = (pos: [number, number, number], target: [number, number, number] = [0, 0, 0], label: string) => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(...pos);
      controlsRef.current.target.set(...target);
      logOp(`Kamery: ${label}`);
    }
  };

  return (
    <section className="max-w-7xl mx-auto p-4 md:p-8 font-sans bg-[#0a0f1a] text-slate-200">
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-700 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-blue-400 to-indigo-400">
            Studio Rekonstrukcji i Naprawy 3D AI
          </h1>
          <p className="text-slate-400 mt-1">Przekształć serię płaskich zdjęć w pełny model 3D gotowy do druku.</p>
        </div>
        <div className="flex gap-2">
          <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
            Moduł Fotogrametrii Active
          </span>
          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
            Auto-naprawa STL
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveTab("scan")}
          className={`flex items-center gap-3 p-4 rounded-xl text-left transition duration-200 ${activeTab === 'scan' ? 'bg-slate-800 border-2 border-teal-500 shadow-md' : 'bg-slate-800/40 border-2 border-transparent hover:border-slate-700'}`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${activeTab === 'scan' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700/50 text-slate-400'}`}>1</div>
          <div>
            <h3 className={`font-bold ${activeTab === 'scan' ? 'text-teal-400' : 'text-slate-300'}`}>Krok 1: Rekonstrukcja ze Zdjęć</h3>
            <p className="text-xs text-slate-400">Prześlij serię zdjęć i wygeneruj chmurę punktów.</p>
          </div>
        </button>
        <button
          onClick={() => setActiveTab("edit")}
          className={`flex items-center gap-3 p-4 rounded-xl text-left transition duration-200 ${activeTab === 'edit' ? 'bg-slate-800 border-2 border-teal-500 shadow-md' : 'bg-slate-800/40 border-2 border-transparent hover:border-slate-700'}`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${activeTab === 'edit' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700/50 text-slate-400'}`}>2</div>
          <div>
            <h3 className={`font-bold ${activeTab === 'edit' ? 'text-teal-400' : 'text-slate-300'}`}>Krok 2: Korekta i Naprawa Manifold</h3>
            <p className="text-xs text-slate-400">Zamknij tył modelu i wyeksportuj do druku.</p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Panel */}
        <div className="space-y-6">
          {activeTab === "scan" ? (
            <div className="space-y-6">
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-xl">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-200">Baza Zdjęć Wejściowych</h2>
                <div
                  onClick={() => setPhotosCount(c => c + 1)}
                  className="border-2 border-dashed border-slate-600 hover:border-teal-500 rounded-xl p-6 text-center cursor-pointer transition bg-slate-900/40"
                >
                  <p className="text-sm font-semibold text-slate-300">Przeciągnij zdjęcia lub kliknij tutaj</p>
                  <p className="text-xs text-slate-500 mt-1">Wgrane: {photosCount}</p>
                </div>
              </div>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-xl">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-slate-200">Silnik Rekonstrukcji AI</h2>
                <button
                  onClick={startScan}
                  disabled={isScanning}
                  className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl shadow-lg transition duration-200 transform hover:scale-[1.02] flex items-center justify-center gap-2"
                >
                  Uruchom Głębokie Skanowanie 3D
                </button>

                {isScanning && (
                  <div className="mt-5 space-y-4">
                    <div className="flex justify-between text-xs font-semibold text-slate-300">
                      <span>{scanPhase}</span>
                      <span>{scanProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-gradient-to-r from-teal-400 to-blue-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
                    </div>
                    <div className="bg-slate-950 rounded-lg p-3 font-mono text-[11px] text-teal-400 h-32 overflow-y-auto border border-slate-800 space-y-1">
                      {consoleLogs.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-xl">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-200">Stan Techniczny</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-sm text-slate-300">Manifold:</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${isBackClosed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {isBackClosed ? 'POPRAWNY' : 'BŁĄD'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-xl">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-slate-200">Podgląd UV</h2>
                <div className="flex flex-col items-center">
                  <canvas ref={uvCanvasRef} width="200" height="200" className="border border-slate-700 rounded-lg bg-[#0f172a]" />
                </div>
              </div>

              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-xl">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-200">Naprawa</h2>
                <div className="space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-slate-300 font-medium">Zamknij tył modelu</span>
                    <input type="checkbox" checked={isBackClosed} onChange={e => setIsBackClosed(e.target.checked)} className="sr-only peer" />
                    <div className="relative w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500" />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-red-400 font-medium">Odwróć Normale</span>
                    <input type="checkbox" checked={areNormalsInverted} onChange={e => setAreNormalsInverted(e.target.checked)} className="sr-only peer" />
                    <div className="relative w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500" />
                  </label>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Głębokość:</span>
                      <span className="font-semibold text-teal-400">{modelDepth.toFixed(1)} cm</span>
                    </div>
                    <input type="range" min="0.5" max="3.5" step="0.1" value={modelDepth} onChange={e => setModelDepth(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={() => { setIsBackClosed(true); setAreNormalsInverted(false); logOp("Wymuszono automatyczną naprawę"); }} className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition duration-200 flex items-center justify-center gap-2">Auto-naprawa</button>
                <button onClick={handleExport} className="w-full bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 font-bold py-3 px-4 rounded-xl shadow-lg transition duration-200 flex items-center justify-center gap-2">Eksport STL</button>
              </div>
            </div>
          )}

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-xl">
            <h2 className="text-sm font-bold mb-3 text-slate-300">Historia operacji</h2>
            <ul className="font-mono text-xs text-slate-400 space-y-1.5 divide-y divide-slate-800/50">
              {opLogs.map((log, i) => <li key={i} className="pt-1.5">{log}</li>)}
            </ul>
          </div>
        </div>

        {/* 3D Canvas Holder */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div ref={containerRef} className="relative w-full h-[65vh] min-h-[450px] bg-black rounded-2xl overflow-hidden border border-teal-500/15 shadow-2xl">
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* HUD */}
            <HUDBracket style={{ top: 20, left: 20 }} />
            <HUDBracket style={{ top: 20, right: 20, transform: "scaleX(-1)" }} />
            <HUDBracket style={{ bottom: 20, left: 20, transform: "scaleY(-1)" }} />
            <HUDBracket style={{ bottom: 20, right: 20, transform: "scale(-1,-1)" }} />

            {/* Controls Overlay */}
            <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
              <button onClick={() => setCameraView([0, 0.5, 6], [0,0,0], "Przód")} className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 backdrop-blur-sm transition">Przód</button>
              <button onClick={() => setCameraView([0, 0.5, -6], [0,0,0], "Tył")} className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 backdrop-blur-sm transition">Tył</button>
              <button onClick={() => setCameraView([0, 6, 0], [0,0,0], "Góra")} className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 backdrop-blur-sm transition">Góra</button>
              <button onClick={() => setCameraView([0, -6, 0], [0,0,0], "Dół")} className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 backdrop-blur-sm transition">Dół</button>
              <button onClick={() => setCameraView([-6, 0.5, 0], [0,0,0], "Lewo")} className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 backdrop-blur-sm transition">Lewo</button>
              <button onClick={() => setCameraView([6, 0.5, 0], [0,0,0], "Prawo")} className="bg-slate-900/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 backdrop-blur-sm transition">Prawo</button>
              <button
                onClick={toggleClip}
                disabled={activeTab !== "edit"}
                className={`bg-slate-900/80 hover:bg-slate-800 text-teal-300 px-3 py-1.5 rounded-lg text-xs font-semibold border border-teal-500/30 backdrop-blur-sm transition ${activeTab !== 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >✂ Przekrój</button>
            </div>

            {/* Stats Overlay */}
            <div className="absolute top-16 left-4 z-10 bg-slate-900/90 border border-slate-700/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-mono text-teal-400 flex flex-wrap gap-4 shadow-lg">
              <span>FPS: {stats.fps}</span>
              <span className="text-slate-500">|</span>
              <span>VERT: {stats.vertices.toLocaleString()}</span>
              <span className="text-slate-500">|</span>
              <span>TRI: {stats.triangles.toLocaleString()}</span>
              <span className="text-slate-500">|</span>
              <span>SCAN: {scanProgress}%</span>
            </div>

            {/* Complete Modal */}
            {showScanComplete && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-30 flex items-center justify-center p-6">
                <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-md shadow-2xl space-y-4 text-center">
                  <div className="w-16 h-16 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-full flex items-center justify-center mx-auto text-3xl">✓</div>
                  <h3 className="text-xl font-bold text-slate-100">Analiza Zdjęć Ukończona!</h3>
                  <p className="text-sm text-slate-400">Głęboki skaner dopasował punkty. Przejdź do korekty modelu.</p>
                  <button onClick={() => { setShowScanComplete(false); setActiveTab("edit"); }} className="bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold px-6 py-2.5 rounded-xl transition duration-150">Przejdź do korekty</button>
                </div>
              </div>
            )}

            {/* Alert */}
            {showAlert && (
              <div className="absolute top-4 right-4 z-20 bg-teal-500 text-slate-950 font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-bounce">
                Siatka pomyślnie zamknięta!
              </div>
            )}

            {/* Laser Line */}
            {isScanning && (
              <div
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent z-10 pointer-events-none"
                style={{
                  top: `${scanProgress}%`,
                  boxShadow: "0 0 15px rgba(45,212,191,0.8)",
                  transition: "top 0.1s linear"
                }}
              />
            )}
          </div>

          <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-5">
            <h3 className="font-bold text-slate-200 mb-2">Jak działa algorytm?</h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Aplikacja analizuje każde przesłane zdjęcie, szukając punktów charakterystycznych. Przeliczając przesunięcia kątowe, silnik układa kamery w wirtualnym kręgu i rzutuje punkty w przestrzeń 3D, tworząc chmurę punktów.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
