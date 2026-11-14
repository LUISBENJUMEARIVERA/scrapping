import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ChatTurn, HITLInterruptPayload } from "../types/agent";

interface AgentReactor3DProps {
  activeTurn?: ChatTurn;
  isStreaming: boolean;
  pendingInterrupt: HITLInterruptPayload | null;
  trapEnabled: boolean;
  llmModel?: string;
  langsmithActive?: boolean;
  qdrantPoints?: number;
  expanded: boolean;
  onToggleExpand: () => void;
}

type NodeKey = "core" | "memory" | "router" | "qdrant" | "csv" | "shield" | "hitl";

interface NodeSpec {
  id: Exclude<NodeKey, "core">;
  label: string;
  shortLabel: string;
  subtitle: string;
  baseAngle: number;
  radius: number;
  yOffset: number;
  bobSpeed: number;
  color: string;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
}

interface EnergyPacket {
  from: NodeKey;
  to: NodeKey;
  t: number;
  speed: number;
  color: string;
  size: number;
}

interface Shockwave {
  origin: NodeKey;
  progress: number;
  color: string;
}

interface DustMote {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  phase: number;
}

const NODE_SPECS: NodeSpec[] = [
  {
    id: "memory",
    label: "MEMORY DUAL",
    shortLabel: "MEMORY",
    subtitle: "SqliteSaver + Store",
    baseAngle: -Math.PI * 0.78,
    radius: 175,
    yOffset: -26,
    bobSpeed: 1.3,
    color: "#00f5ff",
  },
  {
    id: "router",
    label: "GATEKEEPER JEV",
    shortLabel: "JEV ROUTER",
    subtitle: "System One Choice",
    baseAngle: -Math.PI * 0.28,
    radius: 178,
    yOffset: 18,
    bobSpeed: 1.1,
    color: "#d4ff00",
  },
  {
    id: "qdrant",
    label: "QDRANT RRF",
    shortLabel: "QDRANT",
    subtitle: "HNSW + BM25 Vector",
    baseAngle: Math.PI * 0.18,
    radius: 185,
    yOffset: -22,
    bobSpeed: 1.45,
    color: "#d4ff00",
  },
  {
    id: "csv",
    label: "CSV ENGINE",
    shortLabel: "CSV TOOL",
    subtitle: "Métricas Deterministas",
    baseAngle: Math.PI * 0.56,
    radius: 172,
    yOffset: 24,
    bobSpeed: 1.25,
    color: "#00f5ff",
  },
  {
    id: "shield",
    label: "RAG SHIELD",
    shortLabel: "SHIELD",
    subtitle: "Defensa Prompt Injection",
    baseAngle: Math.PI * 0.96,
    radius: 180,
    yOffset: -18,
    bobSpeed: 1.5,
    color: "#d4ff00",
  },
  {
    id: "hitl",
    label: "HITL GATE",
    shortLabel: "HITL",
    subtitle: "Control Humano en Vivo",
    baseAngle: -Math.PI * 1.18,
    radius: 172,
    yOffset: 22,
    bobSpeed: 1.15,
    color: "#ffe600",
  },
];

const EDGES: Array<[NodeKey, NodeKey]> = [
  ["memory", "router"],
  ["router", "qdrant"],
  ["router", "csv"],
  ["qdrant", "shield"],
  ["csv", "hitl"],
  ["memory", "core"],
  ["router", "core"],
  ["qdrant", "core"],
  ["csv", "core"],
  ["shield", "core"],
  ["hitl", "core"],
];

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rotatePoint(p: Vec3, yaw: number, pitch: number): Vec3 {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const x1 = p.x * cosY - p.z * sinY;
  const z1 = p.x * sinY + p.z * cosY;
  const y2 = p.y * cosP - z1 * sinP;
  const z2 = p.y * sinP + z1 * cosP;

  return { x: x1, y: y2, z: z2 };
}

function projectPoint(
  p: Vec3,
  width: number,
  height: number,
  zoom: number,
): ProjectedPoint {
  const fov = 470 * zoom;
  const camZ = 470;
  const depth = Math.max(85, camZ + p.z);
  const scale = fov / depth;
  return {
    x: width * 0.5 + p.x * scale,
    y: height * 0.5 + p.y * scale,
    z: p.z,
    scale,
  };
}

export function AgentReactor3D({
  activeTurn,
  isStreaming,
  pendingInterrupt,
  trapEnabled,
  llmModel,
  langsmithActive,
  qdrantPoints,
  expanded,
  onToggleExpand,
}: AgentReactor3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NodeKey | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeKey | null>(null);

  const cameraRef = useRef({
    yaw: 0.35,
    pitch: 0.24,
    zoom: 1.0,
    targetParallaxX: 0,
    targetParallaxY: 0,
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
  });

  const screenNodesRef = useRef<Record<NodeKey, ProjectedPoint>>({
    core: { x: 0, y: 0, z: 0, scale: 1 },
    memory: { x: 0, y: 0, z: 0, scale: 1 },
    router: { x: 0, y: 0, z: 0, scale: 1 },
    qdrant: { x: 0, y: 0, z: 0, scale: 1 },
    csv: { x: 0, y: 0, z: 0, scale: 1 },
    shield: { x: 0, y: 0, z: 0, scale: 1 },
    hitl: { x: 0, y: 0, z: 0, scale: 1 },
  });

  const particlesRef = useRef<EnergyPacket[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const dustRef = useRef<DustMote[]>([]);

  if (dustRef.current.length === 0) {
    dustRef.current = Array.from({ length: 78 }, (_, idx) => {
      const theta = idx * 2.39996;
      const r = 110 + ((idx * 37) % 190);
      const y = ((idx * 53) % 210) - 105;
      return {
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        size: 1 + (idx % 3) * 0.55,
        alpha: 0.22 + (idx % 5) * 0.1,
        phase: idx * 0.4,
      };
    });
  }

  // Derivar estado de activación de cada módulo en tiempo real desde el turno SSE
  const pipelineState = useMemo(() => {
    const steps = activeTurn?.steps ?? [];
    const stepTypes = new Set(steps.map((s) => s.type));
    const choice = activeTurn?.routerDecision?.choice;
    const hasMemory = stepTypes.has("memory") || steps.length > 0;
    const hasRouter = stepTypes.has("router") || Boolean(choice);
    const usesQdrant =
      choice === "RAG_DOCUMENTAL" ||
      choice === "MIXED_HYBRID" ||
      (activeTurn?.citations?.length ?? 0) > 0;
    const usesCsv =
      choice === "STRUCTURED_CSV" || choice === "MIXED_HYBRID" || choice === "HITL_ACTION";
    const hasToolExec = stepTypes.has("action") || stepTypes.has("observation");
    const shieldTriggered = Boolean(activeTurn?.shieldTriggered);
    const hasHitl = Boolean(pendingInterrupt) || choice === "HITL_ACTION";
    const isCompleted = Boolean(activeTurn && !isStreaming && activeTurn.assistantAnswer);

    let livePhaseLabel = "EN ESPERA DE CONSULTA";
    let activeNode: NodeKey = "core";

    if (pendingInterrupt) {
      livePhaseLabel = "INTERRUPCIÓN HITL EN VIVO";
      activeNode = "hitl";
    } else if (shieldTriggered) {
      livePhaseLabel = "INYECCIÓN DETECTADA Y BLOQUEADA";
      activeNode = "shield";
    } else if (isStreaming) {
      const last = steps[steps.length - 1];
      if (!last || last.type === "memory") {
        livePhaseLabel = "SINCRONIZANDO MEMORIA DUAL";
        activeNode = "memory";
      } else if (last.type === "router") {
        livePhaseLabel = `ENRUTADOR JEV -> ${choice ?? "CLASIFICANDO"}`;
        activeNode = "router";
      } else if (last.type === "thought" || last.type === "action") {
        livePhaseLabel = usesCsv && !usesQdrant ? "EJECUTANDO CSV ENGINE" : "BÚSQUEDA HÍBRIDA QDRANT";
        activeNode = usesCsv && !usesQdrant ? "csv" : "qdrant";
      } else {
        livePhaseLabel = "SINTETIZANDO RESPUESTA CON CITAS";
        activeNode = "core";
      }
    } else if (isCompleted) {
      livePhaseLabel = "CICLO REACT COMPLETADO";
      activeNode = "core";
    } else if (trapEnabled) {
      livePhaseLabel = "TRAMPA DE INYECCIÓN ARMADA EN QDRANT";
      activeNode = "shield";
    }

    const activeSet = new Set<NodeKey>(["core"]);
    if (hasMemory) activeSet.add("memory");
    if (hasRouter) activeSet.add("router");
    if (usesQdrant && (hasRouter || hasToolExec)) activeSet.add("qdrant");
    if (usesCsv && (hasRouter || hasToolExec)) activeSet.add("csv");
    if (shieldTriggered || trapEnabled || (usesQdrant && hasToolExec)) activeSet.add("shield");
    if (hasHitl) activeSet.add("hitl");

    return {
      stepsCount: steps.length,
      choice,
      score: activeTurn?.routerDecision?.score,
      shieldTriggered,
      hasHitl,
      isCompleted,
      activeNode,
      activeSet,
      livePhaseLabel,
    };
  }, [activeTurn, isStreaming, pendingInterrupt, trapEnabled]);

  // Ref sincronizada para el bucle RAF sin reiniciar el canvas en cada evento SSE
  const liveRef = useRef({
    pipelineState,
    isStreaming,
    pendingInterrupt,
    trapEnabled,
    autoRotate,
    selectedNode,
    hoveredNode,
    llmModel: llmModel ?? "gemini-3.8-flash",
  });
  liveRef.current = {
    pipelineState,
    isStreaming,
    pendingInterrupt,
    trapEnabled,
    autoRotate,
    selectedNode,
    hoveredNode,
    llmModel: llmModel ?? "gemini-3.8-flash",
  };

  // Disparar ráfagas de partículas y ondas 3D cuando cambian los pasos SSE o alertas
  const prevSignatureRef = useRef("");
  useEffect(() => {
    const sig = `${activeTurn?.id ?? "idle"}|${pipelineState.stepsCount}|${pipelineState.activeNode}|${pipelineState.shieldTriggered}|${Boolean(pendingInterrupt)}|${isStreaming}`;
    if (sig === prevSignatureRef.current) return;
    prevSignatureRef.current = sig;

    const spawnBurst = (from: NodeKey, to: NodeKey, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          from,
          to,
          t: -(i * 0.08),
          speed: 0.018 + (i % 4) * 0.004,
          color,
          size: 2.2 + (i % 3) * 0.8,
        });
      }
    };

    if (pendingInterrupt) {
      spawnBurst("csv", "hitl", "#ffe600", 10);
      spawnBurst("hitl", "core", "#ff4d00", 10);
      shockwavesRef.current.push({ origin: "hitl", progress: 0, color: "#ffe600" });
    } else if (pipelineState.shieldTriggered) {
      spawnBurst("qdrant", "shield", "#ff4d00", 12);
      spawnBurst("shield", "core", "#ff4d00", 10);
      shockwavesRef.current.push({ origin: "shield", progress: 0, color: "#ff4d00" });
    } else if (pipelineState.activeNode !== "core") {
      spawnBurst(pipelineState.activeNode, "core", "#00f5ff", 9);
      if (pipelineState.activeNode === "qdrant" || pipelineState.activeNode === "csv") {
        spawnBurst("router", pipelineState.activeNode, "#d4ff00", 8);
      }
      if (pipelineState.activeNode === "router") {
        spawnBurst("memory", "router", "#00f5ff", 8);
      }
      shockwavesRef.current.push({
        origin: pipelineState.activeNode,
        progress: 0,
        color: "#00f5ff",
      });
    } else if (pipelineState.isCompleted) {
      shockwavesRef.current.push({ origin: "core", progress: 0, color: "#d4ff00" });
    }
  }, [activeTurn?.id, isStreaming, pendingInterrupt, pipelineState]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = container.clientWidth || 720;
    let height = container.clientHeight || 240;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth || 720;
      height = container.clientHeight || 240;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let rafId = 0;
    let time = 0;

    const renderFrame = () => {
      const state = liveRef.current;
      const cam = cameraRef.current;
      const dt = reducedMotion ? 0 : state.isStreaming ? 0.026 : 0.012;
      time += dt;

      if (!cam.isDragging && state.autoRotate && !reducedMotion) {
        cam.yaw += state.isStreaming ? 0.0055 : 0.0022;
      }

      const effYaw = cam.yaw + cam.targetParallaxX * 0.14;
      const effPitch = Math.max(-0.68, Math.min(0.68, cam.pitch + cam.targetParallaxY * 0.08));

      ctx.clearRect(0, 0, width, height);

      // Halo volumétrico central acorde al estado del agente
      const coreColor = state.pendingInterrupt
        ? "#ffe600"
        : state.pipelineState.shieldTriggered
          ? "#ff4d00"
          : state.isStreaming
            ? "#00f5ff"
            : "#d4ff00";

      const bgGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        12,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.55,
      );
      bgGlow.addColorStop(0, hexToRgba(coreColor, state.isStreaming ? 0.14 : 0.08));
      bgGlow.addColorStop(0.5, "rgba(0, 245, 255, 0.025)");
      bgGlow.addColorStop(1, "rgba(8, 8, 10, 0)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      // 1. Anillo azimutal / rejilla 3D en perspectiva
      ctx.lineWidth = 1;
      const gridY = 112;
      ctx.strokeStyle = "rgba(0, 245, 255, 0.1)";
      for (const ringRadius of [125, 215]) {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const ang = (i / 48) * Math.PI * 2;
          const rp = rotatePoint(
            { x: Math.cos(ang) * ringRadius, y: gridY, z: Math.sin(ang) * ringRadius },
            effYaw,
            effPitch,
          );
          const proj = projectPoint(rp, width, height, cam.zoom);
          if (i === 0) ctx.moveTo(proj.x, proj.y);
          else ctx.lineTo(proj.x, proj.y);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const pA = projectPoint(
          rotatePoint({ x: Math.cos(ang) * 90, y: gridY, z: Math.sin(ang) * 90 }, effYaw, effPitch),
          width,
          height,
          cam.zoom,
        );
        const pB = projectPoint(
          rotatePoint({ x: Math.cos(ang) * 230, y: gridY, z: Math.sin(ang) * 230 }, effYaw, effPitch),
          width,
          height,
          cam.zoom,
        );
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }

      // 2. Partículas espaciales ambientales
      for (const mote of dustRef.current) {
        const rp = rotatePoint(
          {
            x: mote.x,
            y: mote.y + Math.sin(time + mote.phase) * 7,
            z: mote.z,
          },
          effYaw * 0.55,
          effPitch,
        );
        const proj = projectPoint(rp, width, height, cam.zoom);
        if (proj.scale <= 0) continue;
        const alpha = Math.max(0.06, Math.min(0.55, mote.alpha * proj.scale));
        ctx.fillStyle = hexToRgba("#00f5ff", alpha);
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, Math.max(0.7, mote.size * proj.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Calcular posiciones 3D proyectadas de los 6 nodos y núcleo central
      const worldPositions: Record<NodeKey, Vec3> = {
        core: { x: 0, y: Math.sin(time * 1.4) * 5, z: 0 },
        memory: { x: 0, y: 0, z: 0 },
        router: { x: 0, y: 0, z: 0 },
        qdrant: { x: 0, y: 0, z: 0 },
        csv: { x: 0, y: 0, z: 0 },
        shield: { x: 0, y: 0, z: 0 },
        hitl: { x: 0, y: 0, z: 0 },
      };

      const projectedMap = {} as Record<NodeKey, ProjectedPoint>;
      projectedMap.core = projectPoint(rotatePoint(worldPositions.core, effYaw, effPitch), width, height, cam.zoom);

      for (const spec of NODE_SPECS) {
        const orbitAngle = spec.baseAngle + time * 0.14;
        const wPos: Vec3 = {
          x: Math.cos(orbitAngle) * spec.radius,
          y: spec.yOffset + Math.sin(time * spec.bobSpeed + spec.baseAngle) * 14,
          z: Math.sin(orbitAngle) * spec.radius,
        };
        worldPositions[spec.id] = wPos;
        projectedMap[spec.id] = projectPoint(rotatePoint(wPos, effYaw, effPitch), width, height, cam.zoom);
      }
      screenNodesRef.current = projectedMap;

      // 4. Dibujar conductos 3D entre nodos
      for (const [fromKey, toKey] of EDGES) {
        const pFrom = projectedMap[fromKey];
        const pTo = projectedMap[toKey];
        const bothActive =
          state.pipelineState.activeSet.has(fromKey) && state.pipelineState.activeSet.has(toKey);
        const isAlertEdge =
          (state.pipelineState.shieldTriggered && (fromKey === "shield" || toKey === "shield")) ||
          (Boolean(state.pendingInterrupt) && (fromKey === "hitl" || toKey === "hitl"));

        const edgeColor = isAlertEdge
          ? "#ff4d00"
          : bothActive
            ? "#00f5ff"
            : "#3b4c68";
        const edgeAlpha = isAlertEdge ? 0.85 : bothActive ? 0.5 : 0.22;

        ctx.strokeStyle = hexToRgba(edgeColor, edgeAlpha);
        ctx.lineWidth = bothActive || isAlertEdge ? 1.7 : 0.9;
        ctx.beginPath();
        ctx.moveTo(pFrom.x, pFrom.y);
        ctx.lineTo(pTo.x, pTo.y);
        ctx.stroke();

        // Inyectar partículas continuas discretas sobre conexiones activas mientras transmite
        if (!reducedMotion && state.isStreaming && bothActive && Math.random() < 0.08) {
          particlesRef.current.push({
            from: fromKey,
            to: toKey,
            t: 0,
            speed: 0.022,
            color: isAlertEdge ? "#ff4d00" : "#d4ff00",
            size: 2.3,
          });
        }
      }

      // 5. Dibujar anillos giroscópicos y poliedro 3D del núcleo central
      const coreScreen = projectedMap.core;
      const coreRadius = 32 * coreScreen.scale;

      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const ringRad = 44 + rIdx * 13;
        const tiltA = rIdx * 0.9 + time * (rIdx % 2 === 0 ? 0.9 : -0.7);
        const tiltB = rIdx * 0.7 - time * 0.55;
        ctx.strokeStyle = hexToRgba(coreColor, 0.58 - rIdx * 0.14);
        ctx.lineWidth = rIdx === 0 ? 1.8 : 1.1;
        ctx.beginPath();
        for (let seg = 0; seg <= 36; seg++) {
          const theta = (seg / 36) * Math.PI * 2;
          const local: Vec3 = {
            x: Math.cos(theta) * ringRad,
            y: Math.sin(theta) * ringRad * Math.sin(tiltA),
            z: Math.sin(theta) * ringRad * Math.cos(tiltB),
          };
          const wp = rotatePoint(local, effYaw, effPitch);
          const pr = projectPoint(wp, width, height, cam.zoom);
          if (seg === 0) ctx.moveTo(pr.x, pr.y);
          else ctx.lineTo(pr.x, pr.y);
        }
        ctx.stroke();
      }

      // Octaedro 3D sombreado del Núcleo Central
      const octVerts: Vec3[] = [
        { x: 0, y: -32, z: 0 },
        { x: 30, y: 0, z: 0 },
        { x: 0, y: 0, z: 30 },
        { x: -30, y: 0, z: 0 },
        { x: 0, y: 0, z: -30 },
        { x: 0, y: 32, z: 0 },
      ];
      const coreSpin = time * (state.isStreaming ? 1.6 : 0.65);
      const octProjected = octVerts.map((v) => {
        const spun = rotatePoint(v, coreSpin, coreSpin * 0.4);
        return projectPoint(rotatePoint(spun, effYaw, effPitch), width, height, cam.zoom);
      });
      const octFaces: Array<[number, number, number]> = [
        [0, 1, 2],
        [0, 2, 3],
        [0, 3, 4],
        [0, 4, 1],
        [5, 2, 1],
        [5, 3, 2],
        [5, 4, 3],
        [5, 1, 4],
      ];
      const sortedFaces = octFaces
        .map((face, idx) => {
          const avgZ = (octProjected[face[0]].z + octProjected[face[1]].z + octProjected[face[2]].z) / 3;
          return { face, avgZ, idx };
        })
        .sort((a, b) => b.avgZ - a.avgZ);

      for (const { face, idx } of sortedFaces) {
        const a = octProjected[face[0]];
        const b = octProjected[face[1]];
        const c = octProjected[face[2]];
        ctx.fillStyle = hexToRgba(coreColor, 0.11 + (idx % 3) * 0.05);
        ctx.strokeStyle = hexToRgba(coreColor, 0.78);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 6. Paquetes de energía 3D viajando por los conductos
      const nextParticles: EnergyPacket[] = [];
      for (const pkt of particlesRef.current) {
        pkt.t += pkt.speed;
        if (pkt.t > 1) continue;
        nextParticles.push(pkt);
        if (pkt.t < 0) continue;

        const wA = worldPositions[pkt.from];
        const wB = worldPositions[pkt.to];
        const curWorld: Vec3 = {
          x: wA.x + (wB.x - wA.x) * pkt.t,
          y: wA.y + (wB.y - wA.y) * pkt.t + Math.sin(pkt.t * Math.PI) * -18,
          z: wA.z + (wB.z - wA.z) * pkt.t,
        };
        const pr = projectPoint(rotatePoint(curWorld, effYaw, effPitch), width, height, cam.zoom);
        ctx.fillStyle = hexToRgba(pkt.color, 0.95);
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pkt.size * pr.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = hexToRgba(pkt.color, 0.28);
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pkt.size * 2.5 * pr.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      particlesRef.current = nextParticles.slice(-140);

      // 7. Ondas de choque 3D
      const nextWaves: Shockwave[] = [];
      for (const wave of shockwavesRef.current) {
        wave.progress += 0.022;
        if (wave.progress >= 1) continue;
        nextWaves.push(wave);

        const pt = projectedMap[wave.origin];
        const radius = (18 + wave.progress * 72) * pt.scale;
        ctx.strokeStyle = hexToRgba(wave.color, (1 - wave.progress) * 0.72);
        ctx.lineWidth = 2 * (1 - wave.progress);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      shockwavesRef.current = nextWaves;

      // 8. Ordenar nodos por profundidad Z y dibujar nodos orbitales + etiquetas HUD
      const drawableNodes = NODE_SPECS.map((spec) => ({
        spec,
        proj: projectedMap[spec.id],
      })).sort((a, b) => b.proj.z - a.proj.z);

      for (const { spec, proj } of drawableNodes) {
        const isAlert =
          (spec.id === "shield" && (state.pipelineState.shieldTriggered || state.trapEnabled)) ||
          (spec.id === "hitl" && Boolean(state.pendingInterrupt));
        const isCurrent = state.pipelineState.activeNode === spec.id;
        const isActive = state.pipelineState.activeSet.has(spec.id);
        const isFocused = state.selectedNode === spec.id || state.hoveredNode === spec.id;

        const nodeColor = isAlert ? "#ff4d00" : spec.color;
        const r = (isCurrent || isFocused ? 14.5 : 11) * proj.scale;

        // Halo exterior
        if (isActive || isAlert || isFocused) {
          ctx.fillStyle = hexToRgba(nodeColor, isCurrent || isAlert ? 0.25 : 0.13);
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, r * 2.1, 0, Math.PI * 2);
          ctx.fill();
        }

        // Rombo octogonal 3D estilizado
        ctx.fillStyle = hexToRgba("#0f0f15", 0.92);
        ctx.strokeStyle = hexToRgba(nodeColor, isActive || isAlert ? 0.95 : 0.45);
        ctx.lineWidth = isCurrent || isFocused ? 2.2 : 1.4;
        ctx.beginPath();
        ctx.moveTo(proj.x, proj.y - r);
        ctx.lineTo(proj.x + r, proj.y);
        ctx.lineTo(proj.x, proj.y + r);
        ctx.lineTo(proj.x - r, proj.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Núcleo interior luminoso
        ctx.fillStyle = hexToRgba(nodeColor, isActive || isAlert ? 0.95 : 0.45);
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, r * 0.34, 0, Math.PI * 2);
        ctx.fill();

        // Etiqueta flotante calibrada
        ctx.font = `600 ${Math.max(9, Math.round(10 * proj.scale))}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle =
          isActive || isAlert || isFocused ? "rgba(238, 244, 252, 0.96)" : "rgba(155, 173, 198, 0.72)";
        ctx.fillText(spec.shortLabel, proj.x, proj.y + r + 14);
      }

      // Etiqueta del núcleo central encima de todas las capas
      ctx.font = `600 ${Math.max(10, Math.round(11 * coreScreen.scale))}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = coreColor;
      ctx.fillText(
        state.llmModel.replace(" (google_genai)", "").toUpperCase(),
        coreScreen.x,
        coreScreen.y + coreRadius + 24,
      );

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    cameraRef.current.isDragging = true;
    cameraRef.current.lastPointerX = e.clientX;
    cameraRef.current.lastPointerY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;

    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    cam.targetParallaxX = nx;
    cam.targetParallaxY = ny;

    if (cam.isDragging) {
      const dx = e.clientX - cam.lastPointerX;
      const dy = e.clientY - cam.lastPointerY;
      cam.yaw += dx * 0.008;
      cam.pitch = Math.max(-0.68, Math.min(0.68, cam.pitch + dy * 0.006));
      cam.lastPointerX = e.clientX;
      cam.lastPointerY = e.clientY;
      return;
    }

    // Detectar nodo bajo el cursor para resaltado 3D interactivo
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let found: NodeKey | null = null;
    for (const [key, pt] of Object.entries(screenNodesRef.current) as Array<
      [NodeKey, ProjectedPoint]
    >) {
      const dist = Math.hypot(px - pt.x, py - pt.y);
      if (dist <= 26 * pt.scale) {
        found = key;
        break;
      }
    }
    if (found !== hoveredNode) {
      setHoveredNode(found);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    cameraRef.current.isDragging = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (hoveredNode) {
      setSelectedNode((prev) => (prev === hoveredNode ? null : hoveredNode));
    }
  };

  const resetCamera = () => {
    cameraRef.current.yaw = 0.35;
    cameraRef.current.pitch = 0.24;
    cameraRef.current.zoom = 1.0;
    setSelectedNode(null);
  };

  const focusedId = selectedNode ?? hoveredNode ?? pipelineState.activeNode;
  const focusedSpec = NODE_SPECS.find((n) => n.id === focusedId);

  return (
    <section
      aria-label="Reactor 3D en tiempo real del agente LangGraph"
      className={`relative mx-4 mt-3 overflow-hidden rounded-2xl border transition-all duration-300 ${
        pipelineState.shieldTriggered || pendingInterrupt
          ? "border-[#ff4d00]/55 shadow-[0_0_32px_rgba(255,77,0,0.18)]"
          : isStreaming
            ? "border-[#00f5ff]/45 shadow-[0_0_28px_rgba(0,245,255,0.16)]"
            : "border-[#00f5ff]/20 shadow-[0_14px_38px_rgba(0,0,0,0.6)]"
      } bg-[#08080a]/90`}
    >
      {/* Barrido láser superior al procesar */}
      {(isStreaming || Boolean(pendingInterrupt) || pipelineState.shieldTriggered) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <div
            className={`h-full w-1/3 animate-hazard-scan ${
              pipelineState.shieldTriggered || pendingInterrupt ? "bg-[#ff4d00]" : "bg-[#00f5ff]"
            }`}
          />
        </div>
      )}

      {/* HUD Superior del Reactor 3D */}
      <div className="pointer-events-none relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-[#0f0f15]/75 px-3.5 py-2 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${
              pendingInterrupt || pipelineState.shieldTriggered
                ? "border-[#ff4d00]/60 bg-[#ff4d00]/15 text-[#ff8652]"
                : isStreaming
                  ? "border-[#00f5ff]/60 bg-[#00f5ff]/15 text-[#00f5ff]"
                  : "border-[#d4ff00]/45 bg-[#d4ff00]/10 text-[#d4ff00]"
            }`}
          >
            {pendingInterrupt || pipelineState.shieldTriggered ? (
              <ShieldAlert className="h-3 w-3" />
            ) : isStreaming ? (
              <Zap className="h-3 w-3 animate-pulse" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            {pipelineState.livePhaseLabel}
          </span>

          {pipelineState.choice && (
            <span className="rounded border border-white/10 bg-[#161622] px-2 py-0.5 font-mono text-[10px] text-[#eef4fc]">
              JEV: <strong className="text-[#d4ff00]">{pipelineState.choice}</strong>
              {typeof pipelineState.score === "number" && (
                <span className="text-[#8b9bb4]"> ({Math.round(pipelineState.score * 100)}%)</span>
              )}
            </span>
          )}

          {langsmithActive && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded border border-[#00f5ff]/25 bg-[#00f5ff]/8 px-2 py-0.5 font-mono text-[10px] text-[#00f5ff]">
              <Sparkles className="h-2.5 w-2.5" />
              LANGSMITH TRACE ON
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <span className="hidden md:inline font-mono text-[10px] text-[#8b9bb4] mr-1">
            Arrastra para orbitar 3D · Qdrant {qdrantPoints ?? 0} pts
          </span>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            title={autoRotate ? "Pausar rotación 3D" : "Reanudar rotación 3D"}
            aria-label={autoRotate ? "Pausar rotación 3D" : "Reanudar rotación 3D"}
            className="inline-flex h-7 items-center gap-1 rounded border border-white/12 bg-[#161622] px-2 font-mono text-[10px] text-[#eef4fc] hover:border-[#00f5ff]/50 hover:text-[#00f5ff] transition-colors"
          >
            {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            Orbita
          </button>
          <button
            type="button"
            onClick={resetCamera}
            title="Reiniciar cámara 3D"
            aria-label="Reiniciar cámara 3D"
            className="inline-flex h-7 items-center gap-1 rounded border border-white/12 bg-[#161622] px-2 font-mono text-[10px] text-[#eef4fc] hover:border-[#00f5ff]/50 hover:text-[#00f5ff] transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            title={expanded ? "Compactar escenario 3D" : "Expandir escenario 3D"}
            aria-label={expanded ? "Compactar escenario 3D" : "Expandir escenario 3D"}
            className="inline-flex h-7 items-center gap-1 rounded border border-[#00f5ff]/35 bg-[#00f5ff]/10 px-2 font-mono text-[10px] text-[#00f5ff] hover:bg-[#00f5ff]/20 transition-colors"
          >
            {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {expanded ? "Compactar" : "Teatro 3D"}
          </button>
        </div>
      </div>

      {/* Lienzo 3D Interactivo */}
      <div
        ref={containerRef}
        className={`relative w-full transition-[height] duration-300 ${
          expanded ? "h-[360px]" : "h-[210px]"
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            cameraRef.current.isDragging = false;
            cameraRef.current.targetParallaxX = 0;
            cameraRef.current.targetParallaxY = 0;
            setHoveredNode(null);
          }}
          className="h-full w-full cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Tarjeta flotante del módulo enfocado */}
        <div className="pointer-events-none absolute bottom-2.5 left-3 rounded-lg border border-white/12 bg-[#0f0f15]/85 px-2.5 py-1.5 backdrop-blur-md">
          <div className="font-mono text-[10px] text-[#8b9bb4]">MÓDULO EN FOCO</div>
          <div className="text-xs font-semibold text-[#eef4fc]">
            {focusedSpec ? focusedSpec.label : `NÚCLEO ${llmModel ?? "GEMINI 3.8 FLASH"}`}
          </div>
          <div className="font-mono text-[10px] text-[#00f5ff]">
            {focusedSpec ? focusedSpec.subtitle : "Síntesis LangChain v1 + Fallback Ollama"}
          </div>
        </div>

        {/* Telemetría derecha de nodos */}
        <div className="pointer-events-auto absolute bottom-2.5 right-3 hidden sm:flex flex-wrap items-center gap-1 max-w-[60%] justify-end">
          {NODE_SPECS.map((node) => {
            const active = pipelineState.activeSet.has(node.id);
            const current = pipelineState.activeNode === node.id;
            const alert =
              (node.id === "shield" && (pipelineState.shieldTriggered || trapEnabled)) ||
              (node.id === "hitl" && Boolean(pendingInterrupt));
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedNode((prev) => (prev === node.id ? null : node.id))}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-all ${
                  alert
                    ? "border-[#ff4d00] bg-[#ff4d00]/20 text-[#ff9366]"
                    : current
                      ? "border-[#00f5ff] bg-[#00f5ff]/20 text-[#00f5ff] shadow-[0_0_12px_rgba(0,245,255,0.3)]"
                      : active
                        ? "border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00]"
                        : "border-white/10 bg-[#161622]/80 text-[#8b9bb4] hover:border-white/30"
                }`}
              >
                {node.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
