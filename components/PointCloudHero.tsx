"use client";

import { useRef, useEffect, useState } from "react";

// ─── Shader sources ──────────────────────────────────────────────────────────
const VERT = `
  attribute vec3 position;
  attribute vec3 normal;
  uniform float uTime;
  uniform float uScanY;
  uniform float uMouse;
  attribute float aScale;
  attribute float aSpeed;
  attribute float aNoise;

  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;

  varying float vDist;
  varying float vScan;
  varying float vBright;

  // simplex-ish hash
  float hash(float n){ return fract(sin(n)*43758.5453); }

  void main(){
    vec3 p = position;

    // subtle breathing wave
    float wave = sin(uTime * aSpeed + aNoise * 6.2831) * 0.04;
    p += normal * wave;

    // scan highlight band
    float scanDist = abs(p.y - uScanY);
    vScan = smoothstep(0.35, 0.0, scanDist);

    // distance-based dim from origin
    vDist = length(p);
    vBright = aScale;

    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (aScale * 3.5 + vScan * 4.0) * (280.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAG = `
  precision mediump float;
  uniform float uTime;
  varying float vDist;
  varying float vScan;
  varying float vBright;

  void main(){
    // circular point
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if(r > 0.5) discard;

    float alpha = (1.0 - r * 2.0) * 0.85;
    alpha *= vBright;

    // base teal color
    vec3 base  = vec3(0.17, 0.82, 0.75);   // #2DD4BF
    vec3 blue  = vec3(0.24, 0.52, 0.96);   // #3D85F5
    vec3 white = vec3(0.95, 0.98, 1.0);

    // scan glow → white-hot center
    vec3 col = mix(mix(base, blue, vDist * 0.18), white, vScan * 0.8);
    col *= 1.0 + vScan * 1.5;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Geometry builder ─────────────────────────────────────────────────────────
function buildGoggles(count = 18000) {
  const pos   = [], nrm = [], scale = [], speed = [], noise = [];

  const rnd = () => Math.random();
  const rng = (a, b) => a + rnd() * (b - a);

  // ── helpers ──
  const addPt = (x, y, z, nx, ny, nz) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    scale.push(rng(0.35, 1.0));
    speed.push(rng(0.4, 1.6));
    noise.push(rng(0, 1));
  };

  const addSphere = (cx, cy, cz, rx, ry, rz, n, jitter = 0.06) => {
    for (let i = 0; i < n; i++) {
      const theta = Math.acos(2 * rnd() - 1);
      const phi   = rnd() * Math.PI * 2;
      const sx = Math.sin(theta) * Math.cos(phi);
      const sy = Math.sin(theta) * Math.sin(phi);
      const sz = Math.cos(theta);
      const j = () => (rnd() - 0.5) * jitter;
      addPt(cx + sx * rx + j(), cy + sy * ry + j(), cz + sz * rz + j(), sx, sy, sz);
    }
  };

  const addTorus = (cx, cy, cz, R, r, n, axis = "z", jitter = 0.04) => {
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2;
      const v = rnd() * Math.PI * 2;
      let x = (R + r * Math.cos(v)) * Math.cos(u);
      let y = (R + r * Math.cos(v)) * Math.sin(u);
      let z = r * Math.sin(v);
      const nx = Math.cos(v) * Math.cos(u);
      const ny = Math.cos(v) * Math.sin(u);
      const nz = Math.sin(v);
      const j = () => (rnd() - 0.5) * jitter;
      if (axis === "x") addPt(cx + z + j(), cy + y + j(), cz + x + j(), nz, ny, nx);
      else               addPt(cx + x + j(), cy + y + j(), cz + z + j(), nx, ny, nz);
    }
  };

  const addCylinder = (cx, cy, cz, rx, ry, h, n, jitter = 0.04) => {
    for (let i = 0; i < n; i++) {
      const theta = rnd() * Math.PI * 2;
      const yy    = rng(-h / 2, h / 2);
      const j = () => (rnd() - 0.5) * jitter;
      const nx = Math.cos(theta), nz = Math.sin(theta);
      addPt(cx + nx * rx + j(), cy + yy + j(), cz + nz * ry + j(), nx, 0, nz);
    }
  };

  const addDisk = (cx, cy, cz, rMin, rMax, n, jitter = 0.02) => {
    for (let i = 0; i < n; i++) {
      const theta = rnd() * Math.PI * 2;
      const r     = rng(rMin, rMax);
      const j = () => (rnd() - 0.5) * jitter;
      addPt(cx + Math.cos(theta) * r + j(), cy + j(), cz + Math.sin(theta) * r + j(), 0, 1, 0);
    }
  };

  // ═══ HEAD / FACE base ═══════════════════════════════════════════════════════
  addSphere(0, 0.05, 0, 1.05, 1.25, 1.05, Math.floor(count * 0.12));

  // ═══ LEFT LENS ══════════════════════════════════════════════════════════════
  addSphere(-0.52, 0.05, 0.72, 0.38, 0.36, 0.22, Math.floor(count * 0.10));
  addTorus( -0.52, 0.05, 0.72, 0.38, 0.055, Math.floor(count * 0.06), "x");

  // ═══ RIGHT LENS ═════════════════════════════════════════════════════════════
  addSphere( 0.52, 0.05, 0.72, 0.38, 0.36, 0.22, Math.floor(count * 0.10));
  addTorus(  0.52, 0.05, 0.72, 0.38, 0.055, Math.floor(count * 0.06), "x");

  // ═══ NOSE BRIDGE ════════════════════════════════════════════════════════════
  addCylinder(0, 0.06, 0.68, 0.14, 0.05, 0.28, Math.floor(count * 0.025));

  // ═══ MAIN BODY / FRAME ══════════════════════════════════════════════════════
  addSphere(0, -0.02, 0.35, 0.94, 0.52, 0.55, Math.floor(count * 0.10));

  // ═══ TOP EDGE / STRAP MOUNT ═════════════════════════════════════════════════
  addCylinder(0, 0.58, 0.1, 0.88, 0.88, 0.08, Math.floor(count * 0.035));

  // ═══ BOTTOM EDGE ════════════════════════════════════════════════════════════
  addCylinder(0, -0.5, 0.1, 0.88, 0.88, 0.08, Math.floor(count * 0.03));

  // ═══ SIDE FLARES ════════════════════════════════════════════════════════════
  addSphere(-0.95, 0.0, 0.0, 0.22, 0.48, 0.38, Math.floor(count * 0.04));
  addSphere( 0.95, 0.0, 0.0, 0.22, 0.48, 0.38, Math.floor(count * 0.04));

  // ═══ LENS INNER DETAIL (concave) ════════════════════════════════════════════
  addSphere(-0.52, 0.05, 0.88, 0.25, 0.23, 0.10, Math.floor(count * 0.05));
  addSphere( 0.52, 0.05, 0.88, 0.25, 0.23, 0.10, Math.floor(count * 0.05));

  // ═══ NOSE REST / FOAM PADDING ════════════════════════════════════════════════
  addSphere(0, -0.30, 0.68, 0.20, 0.10, 0.12, Math.floor(count * 0.02));

  // ═══ STRAP LEFT ═════════════════════════════════════════════════════════════
  for (let i = 0; i < Math.floor(count * 0.025); i++) {
    const t = rnd();
    const x = rng(-0.95, -1.4);
    const y = rng(-0.12, 0.12);
    const z = rng(-0.55, 0.1) * (1 - t * 0.5);
    addPt(x, y, z, -1, 0, 0);
  }
  // ═══ STRAP RIGHT ════════════════════════════════════════════════════════════
  for (let i = 0; i < Math.floor(count * 0.025); i++) {
    const x = rng(0.95, 1.4);
    const y = rng(-0.12, 0.12);
    const z = rng(-0.55, 0.1);
    addPt(x, y, z, 1, 0, 0);
  }

  // ═══ FLOATING SCAN PARTICLES ════════════════════════════════════════════════
  const rem = count - pos.length / 3;
  for (let i = 0; i < rem; i++) {
    const theta = rnd() * Math.PI * 2;
    const phi   = rnd() * Math.PI;
    const r     = rng(1.6, 2.8);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi) * rng(0.4, 1.0);
    const z = r * Math.sin(phi) * Math.sin(theta);
    addPt(x, y, z, x / r, y / r, z / r);
  }

  return { pos, nrm, scale, speed, noise };
}

// ─── Stats overlay ────────────────────────────────────────────────────────────
function Stats({ fps, pts, scanPct }) {
  return (
    <div style={{
      position: "absolute", bottom: 16, left: 16,
      display: "flex", gap: 20,
      fontFamily: "'Courier New', monospace",
      fontSize: 11, color: "rgba(45,212,191,0.7)",
      pointerEvents: "none", userSelect: "none",
    }}>
      {[
        ["FPS", fps],
        ["VERTICES", pts.toLocaleString()],
        ["SCAN", `${scanPct}%`],
      ].map(([k, v]) => (
        <span key={k}>
          <span style={{ color: "rgba(45,212,191,0.4)", marginRight: 6 }}>{k}</span>
          <span style={{ color: "#2dd4bf" }}>{v}</span>
        </span>
      ))}
    </div>
  );
}

// ─── HUD corner brackets ──────────────────────────────────────────────────────
function HUDBracket({ style }) {
  const s = 22, t = 2, c = "rgba(45,212,191,0.5)";
  return (
    <svg width={s} height={s} style={{ position: "absolute", ...style }}>
      <rect x={0} y={0} width={s} height={t} fill={c} />
      <rect x={0} y={0} width={t} height={s} fill={c} />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PointCloudHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ fps: 0, pts: 0, scan: 0 });
  const [size, setSize] = useState({ w: 800, h: 520 });

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      const h = Math.max(380, Math.floor(w * 0.58));
      setSize({ w, h });
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    // ── compile shaders ──
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // ── build geometry ──
    const { pos, nrm, scale, speed, noise } = buildGoggles(20000);
    const ptCount = pos.length / 3;

    const mkBuf = (data: number[]) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    const bindAttr = (buf: WebGLBuffer | null, loc: number, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };

    const posB   = mkBuf(pos);
    const nrmB   = mkBuf(nrm);
    const scaleB = mkBuf(scale);
    const speedB = mkBuf(speed);
    const noiseB = mkBuf(noise);

    const aPos   = gl.getAttribLocation(prog, "position");
    const aNrm   = gl.getAttribLocation(prog, "normal");
    const aScale = gl.getAttribLocation(prog, "aScale");
    const aSpeed = gl.getAttribLocation(prog, "aSpeed");
    const aNoise = gl.getAttribLocation(prog, "aNoise");

    const uTime  = gl.getUniformLocation(prog, "uTime");
    const uScanY = gl.getUniformLocation(prog, "uScanY");
    const uProj  = gl.getUniformLocation(prog, "projectionMatrix");
    const uMV    = gl.getUniformLocation(prog, "modelViewMatrix");

    // ── matrix helpers ──
    const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const perspective = (fov: number, aspect: number, near: number, far: number) => {
      const f = 1 / Math.tan(fov / 2);
      const d = near - far;
      return new Float32Array([
        f/aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far+near)/d, -1,
        0, 0, (2*far*near)/d, 0,
      ]);
    };
    const rotY = (m: Float32Array, a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      const r = Array.from(m);
      r[0]  = m[0]*c + m[8]*s;  r[4]  = m[4]*c + m[12]*s;
      r[8]  = m[0]*-s + m[8]*c; r[12] = m[4]*-s + m[12]*c;
      return new Float32Array(r);
    };
    const rotX = (m: Float32Array, a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      const r = Array.from(m);
      r[1]  = m[1]*c  + m[9]*-s; r[5]  = m[5]*c  + m[13]*-s;
      r[9]  = m[1]*s  + m[9]*c;  r[13] = m[5]*s  + m[13]*c;
      r[2]  = m[2]*c  + m[10]*-s; r[6]  = m[6]*c  + m[14]*-s;
      r[10] = m[2]*s  + m[10]*c;  r[14] = m[6]*s  + m[14]*c;
      return new Float32Array(r);
    };
    const translate = (m: Float32Array, tx: number, ty: number, tz: number) => {
      const r = new Float32Array(m);
      r[12] = m[0]*tx + m[4]*ty + m[8]*tz  + m[12];
      r[13] = m[1]*tx + m[5]*ty + m[9]*tz  + m[13];
      r[14] = m[2]*tx + m[6]*ty + m[10]*tz + m[14];
      return r;
    };

    // ── interaction ──
    let mouseX = 0, mouseY = 0;
    let angleY = 0.3, angleX = -0.1;
    let isDragging = false, lastMX = 0, lastMY = 0;
    let autoAngle = 0;

    const onMove = (e: any) => {
      const r = canvas.getBoundingClientRect();
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      const cx = clientX - r.left;
      const cy = clientY - r.top;
      mouseX = (cx / r.width  - 0.5) * 2;
      mouseY = (cy / r.height - 0.5) * 2;
      if (isDragging) {
        angleY += (cx - lastMX) * 0.008;
        angleX += (cy - lastMY) * 0.005;
        angleX = Math.max(-0.6, Math.min(0.6, angleX));
      }
      lastMX = cx; lastMY = cy;
    };
    const onDown = (e: any) => {
      isDragging = true;
      lastMX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      lastMY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    };
    const onUp   = () => { isDragging = false; };

    canvas.addEventListener("mousemove",  onMove);
    canvas.addEventListener("touchmove",  onMove, { passive: true });
    canvas.addEventListener("mousedown",  onDown);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("mouseup",    onUp);
    canvas.addEventListener("touchend",   onUp);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.DEPTH_TEST);

    // ── render loop ──
    let raf: number;
    let frames = 0;
    let lastTime = 0;

    const render = (t: number) => {
      raf = requestAnimationFrame(render);
      const time = t * 0.001;

      // FPS
      frames++;
      if (time - lastTime >= 1) {
        const fpsValue = frames;
        frames = 0;
        lastTime = time;
        const scanPct = Math.round(((Math.sin(time * 0.6) * 0.5 + 0.5)) * 100);
        setStats({ fps: fpsValue, pts: ptCount, scan: scanPct });
      }

      if (!isDragging) autoAngle += 0.003;
      const totalAngleY = autoAngle + angleY + mouseX * 0.12;
      const totalAngleX = angleX - mouseY * 0.05;

      const W = canvas.width, H = canvas.height;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const proj = perspective(0.72, W / H, 0.1, 100);
      let mv = identity();
      mv = translate(mv, 0, 0, -4.2);
      mv = rotX(mv, totalAngleX);
      mv = rotY(mv, totalAngleY);

      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uMV,   false, mv);
      gl.uniform1f(uTime,  time);
      gl.uniform1f(uScanY, Math.sin(time * 0.6) * 1.4);

      bindAttr(posB,   aPos,   3);
      bindAttr(nrmB,   aNrm,   3);
      bindAttr(scaleB, aScale, 1);
      bindAttr(speedB, aSpeed, 1);
      bindAttr(noiseB, aNoise, 1);

      gl.drawArrays(gl.POINTS, 0, ptCount);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove",  onMove);
      canvas.removeEventListener("touchmove",  onMove);
      canvas.removeEventListener("mousedown",  onDown);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("mouseup",    onUp);
      canvas.removeEventListener("touchend",   onUp);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(posB);
      gl.deleteBuffer(nrmB);
      gl.deleteBuffer(scaleB);
      gl.deleteBuffer(speedB);
      gl.deleteBuffer(noiseB);
    };
  }, []);

  return (
    <div style={{
      width: "100%",
      background: "radial-gradient(ellipse 120% 80% at 50% 40%, #0f2433 0%, #0a0f1a 70%)",
      padding: "32px 24px 40px",
      fontFamily: "'Courier New', monospace",
    }}>
      {/* title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#2dd4bf",
          boxShadow: "0 0 8px #2dd4bf",
          animation: "pulse 2s ease-in-out infinite",
        }} />
        <span style={{ color: "rgba(45,212,191,0.9)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Point Cloud — Live Reconstruction
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, rgba(45,212,191,0.4), transparent)" }} />
        <span style={{ color: "rgba(45,212,191,0.4)", fontSize: 10 }}>WebGL 1.0</span>
      </div>

      {/* canvas wrapper */}
      <div ref={wrapRef} style={{ position: "relative", borderRadius: 12, overflow: "hidden",
        border: "1px solid rgba(45,212,191,0.15)",
        boxShadow: "0 0 40px rgba(45,212,191,0.08), inset 0 0 60px rgba(0,0,0,0.4)",
      }}>
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          style={{ display: "block", width: "100%", height: size.h, cursor: "grab", background: "transparent" }}
        />

        {/* HUD brackets */}
        <HUDBracket style={{ top: 10, left: 10,  transform: "none" }} />
        <HUDBracket style={{ top: 10, right: 10, transform: "scaleX(-1)" }} />
        <HUDBracket style={{ bottom: 10, left: 10,  transform: "scaleY(-1)" }} />
        <HUDBracket style={{ bottom: 10, right: 10, transform: "scale(-1,-1)" }} />

        {/* scan line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 2,
          background: "linear-gradient(to right, transparent 0%, rgba(45,212,191,0.7) 50%, transparent 100%)",
          animation: "scanline 3s ease-in-out infinite",
          pointerEvents: "none",
        }} />

        {/* stats */}
        <Stats fps={stats.fps} pts={stats.pts} scanPct={stats.scan} />

        {/* drag hint */}
        <div style={{
          position: "absolute", top: 14, right: 40,
          fontSize: 10, color: "rgba(45,212,191,0.35)",
          letterSpacing: "0.12em", textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          drag to rotate
        </div>
      </div>

      {/* bottom info row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 14, paddingTop: 14,
        borderTop: "1px solid rgba(45,212,191,0.1)",
      }}>
        <div style={{ display: "flex", gap: 24 }}>
          {[["POINTS", "20,000"], ["SHADER", "GLSL ES 1.0"], ["BLEND", "ADDITIVE"]].map(([k, v]) => (
            <div key={k} style={{ fontSize: 10, color: "rgba(45,212,191,0.5)", letterSpacing: "0.1em" }}>
              <span style={{ color: "rgba(45,212,191,0.3)" }}>{k} </span>{v}
            </div>
          ))}
        </div>
        <div style={{
          fontSize: 10, color: "rgba(45,212,191,0.4)",
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          VR Goggle — Photogrammetry Preview
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes scanline {
          0%   { top: 0%;   opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
