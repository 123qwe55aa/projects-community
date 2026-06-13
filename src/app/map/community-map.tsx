'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MapProject, MapDecisionMarker } from './page';

// ─── Types ────────────────────────────────────────────

type BuildingStyle = 'workshop' | 'data-center' | 'studio' | 'community-hall';
type GrowthStage = 'seedling' | 'sprouting' | 'growing' | 'mature';

interface BuildingDef {
  id: string;
  label: string;
  style: BuildingStyle;
  growth: GrowthStage;
  decisionCount: number;
  adoptionCount: number;
  gridX: number;
  gridY: number;
}

interface DecisionPin {
  decisionId: string;
  projectId: string | null;
  question: string;
  screenX: number;
  screenY: number;
}

interface Point {
  x: number;
  y: number;
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  decisionCount: number;
  adoptionCount: number;
}

// ─── Constants ────────────────────────────────────────

const GROWTH_SCALE: Record<GrowthStage, number> = {
  seedling: 0.4,
  sprouting: 0.6,
  growing: 0.8,
  mature: 1.0,
};

const STYLE_COLORS: Record<BuildingStyle, { wall: string; roof: string; accent: string; highlight: string }> = {
  workshop: { wall: '#b45309', roof: '#92400e', accent: '#fbbf24', highlight: '#f59e0b' },
  'data-center': { wall: '#0e7490', roof: '#155e75', accent: '#22d3ee', highlight: '#06b6d4' },
  studio: { wall: '#7e22ce', roof: '#6b21a8', accent: '#c084fc', highlight: '#a855f7' },
  'community-hall': { wall: '#15803d', roof: '#14532d', accent: '#4ade80', highlight: '#22c55e' },
};

const GRID_COLS = 5;
const GRID_ROW_HEIGHT = 160;
const GRID_COL_WIDTH = 200;

// ─── Growth stage from adoption count ─────────────────

function adoptionCountToGrowthStage(adoptionCount: number, dbGrowthStage?: string | null): GrowthStage {
  // Dynamic stage: based on adoption count (number of decided decisions)
  if (adoptionCount >= 10) return 'mature';
  if (adoptionCount >= 5) return 'growing';
  if (adoptionCount >= 2) return 'sprouting';
  if (adoptionCount >= 1) return 'seedling';

  // Fall back to DB stage if no adoptions yet
  const stageMap: Record<string, GrowthStage> = {
    seed: 'seedling',
    seedling: 'seedling',
    sprouting: 'sprouting',
    growing: 'growing',
    thriving: 'growing',
    mature: 'mature',
  };
  return stageMap[dbGrowthStage ?? ''] ?? 'seedling';
}

// ─── Isometric Helpers ───────────────────────────────

function isoProject(cartX: number, cartY: number): Point {
  return {
    x: (cartX - cartY) * 0.866,
    y: (cartX + cartY) * 0.5,
  };
}

// ─── Drawing Helpers ──────────────────────────────────

function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawWorkshop(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  scale: number,
  colors: typeof STYLE_COLORS.workshop,
  isHovered: boolean
) {
  const s = scale;
  const w = 50 * s;
  const h = 60 * s;
  const d = 30 * s;

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y },
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
  ], isHovered ? colors.highlight : colors.wall, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w, y: origin.y },
  ], isHovered ? colors.highlight : colors.roof, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h + d * 0.5 },
  ], colors.accent, colors.highlight);

  const chW = 8 * s;
  const chH = 20 * s;
  const chX = origin.x + w * 0.2;
  const chY = origin.y - h - d * 0.5;
  drawPolygon(ctx, [
    { x: chX, y: chY - chH },
    { x: chX + chW * 0.5, y: chY - chH - chW * 0.25 },
    { x: chX + chW, y: chY - chH },
    { x: chX + chW, y: chY },
    { x: chX, y: chY },
  ], '#78350f', colors.accent);

  if (s > 0.5) {
    const winY = origin.y - h * 0.6;
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(origin.x + 6 * s, winY, 12 * s, 10 * s);
  }
}

function drawDataCenter(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  scale: number,
  colors: typeof STYLE_COLORS['data-center'],
  isHovered: boolean
) {
  const s = scale;
  const w = 40 * s;
  const h = 90 * s;
  const d = 24 * s;

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y },
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
  ], isHovered ? colors.highlight : colors.wall, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w, y: origin.y },
  ], isHovered ? colors.highlight : colors.roof, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h + d * 0.5 },
  ], colors.accent, colors.highlight);

  const antX = origin.x + w * 0.5;
  const antBottom = origin.y - h - d * 0.5;
  const antTop = antBottom - 25 * s;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(antX, antBottom);
  ctx.lineTo(antX, antTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(antX, antTop, 6 * s, 0, Math.PI, true);
  ctx.fillStyle = colors.accent;
  ctx.fill();
  ctx.strokeStyle = colors.highlight;
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();

  if (s > 0.5) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 0 ? '#4ade80' : i === 1 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(origin.x + 4 * s, origin.y - h * (0.3 + i * 0.2), 4 * s, 3 * s);
    }
  }
}

function drawStudio(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  scale: number,
  colors: typeof STYLE_COLORS.studio,
  isHovered: boolean
) {
  const s = scale;
  const w = 70 * s;
  const h = 40 * s;
  const d = 24 * s;

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y },
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
  ], isHovered ? colors.highlight : colors.wall, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w, y: origin.y },
  ], isHovered ? colors.highlight : colors.roof, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x - 4 * s, y: origin.y - h },
    { x: origin.x + w * 0.5 - 2 * s, y: origin.y - h - d * 0.5 - 2 * s },
    { x: origin.x + w + 4 * s, y: origin.y - h },
    { x: origin.x + w * 0.5 + 2 * s, y: origin.y - h + d * 0.5 + 2 * s },
  ], colors.accent, colors.highlight);

  if (s > 0.4) {
    ctx.fillStyle = '#e9d5ff22';
    ctx.beginPath();
    ctx.moveTo(origin.x + 8 * s, origin.y - h * 0.85);
    ctx.lineTo(origin.x + 8 * s, origin.y - h * 0.25);
    ctx.lineTo(origin.x + w * 0.5 - 4 * s, origin.y - h * 0.25 - d * 0.25);
    ctx.lineTo(origin.x + w * 0.5 - 4 * s, origin.y - h * 0.85 - d * 0.25);
    ctx.closePath();
    ctx.fillStyle = '#c4b5fd33';
    ctx.fill();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawCommunityHall(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  scale: number,
  colors: typeof STYLE_COLORS['community-hall'],
  isHovered: boolean
) {
  const s = scale;
  const w = 65 * s;
  const h = 65 * s;
  const d = 30 * s;

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y },
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
  ], isHovered ? colors.highlight : colors.wall, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x + w * 0.5, y: origin.y - d * 0.5 },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 0.5 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w, y: origin.y },
  ], isHovered ? colors.highlight : colors.roof, colors.accent);

  drawPolygon(ctx, [
    { x: origin.x, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h - d * 1.8 },
    { x: origin.x + w, y: origin.y - h },
    { x: origin.x + w * 0.5, y: origin.y - h + d * 0.5 },
  ], colors.accent, colors.highlight);

  if (s > 0.5) {
    const columnW = 3 * s;
    const colPositions = [0.15, 0.3, 0.7, 0.85];
    for (const frac of colPositions) {
      const cx = origin.x + w * frac;
      ctx.fillStyle = '#bbf7d0';
      ctx.fillRect(cx - columnW / 2, origin.y - h * 0.8, columnW, h * 0.75);
    }
    for (const frac of [0.15, 0.3]) {
      const cx = origin.x + w * frac;
      ctx.fillStyle = '#86efac55';
      ctx.fillRect(cx - columnW / 2, origin.y - h * 0.85, columnW, h * 0.8);
    }
  }

  if (s > 0.5) {
    const doorX = origin.x + w * 0.35;
    const doorY = origin.y;
    ctx.beginPath();
    ctx.moveTo(doorX, doorY);
    ctx.lineTo(doorX, doorY - h * 0.3);
    ctx.arc(doorX + w * 0.15, doorY - h * 0.3, w * 0.15, Math.PI, 0);
    ctx.lineTo(doorX + w * 0.3, doorY);
    ctx.closePath();
    ctx.fillStyle = '#052e16';
    ctx.fill();
  }
}

const DRAW_FUNCTIONS: Record<BuildingStyle, typeof drawWorkshop> = {
  workshop: drawWorkshop,
  'data-center': drawDataCenter,
  studio: drawStudio,
  'community-hall': drawCommunityHall,
};

// ─── Main Component ──────────────────────────────────

interface CommunityMapProps {
  projects: MapProject[];
  decisionMarkers: MapDecisionMarker[];
}

export function CommunityMap({ projects, decisionMarkers }: CommunityMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [decisionPins, setDecisionPins] = useState<DecisionPin[]>([]);
  const [hoveredDecisionId, setHoveredDecisionId] = useState<string | null>(null);
  const router = useRouter();
  const animFrameRef = useRef<number>(0);
  const glowPhaseRef = useRef<number>(0);

  const buildings = useRef<BuildingDef[]>([]);

  const recalcBuildings = useCallback(() => {
    const defs: BuildingDef[] = projects.map((p, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const zigzagOffset = row % 2 === 1 ? GRID_COL_WIDTH / 2 : 0;
      // Derive growth stage dynamically from adoption count
      const growth = adoptionCountToGrowthStage(p.adoptionCount, p.growthStage);
      return {
        id: p.id,
        label: (p.summary || p.background || 'Untitled').slice(0, 30),
        style: (p.buildingStyle || 'workshop') as BuildingStyle,
        growth,
        decisionCount: p.decisionCount,
        adoptionCount: p.adoptionCount,
        gridX: col * GRID_COL_WIDTH + zigzagOffset + 120,
        gridY: row * GRID_ROW_HEIGHT + 120,
      };
    });

    // Empty lots (coming soon) if fewer than 8 projects
    const lotCount = Math.max(0, 8 - projects.length);
    for (let l = 0; l < lotCount; l++) {
      const i = projects.length + l;
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const zigzagOffset = row % 2 === 1 ? GRID_COL_WIDTH / 2 : 0;
      defs.push({
        id: `lot-${l}`,
        label: 'Coming soon',
        style: 'workshop',
        growth: 'seedling',
        decisionCount: 0,
        adoptionCount: 0,
        gridX: col * GRID_COL_WIDTH + zigzagOffset + 120,
        gridY: row * GRID_ROW_HEIGHT + 120,
      });
    }

    buildings.current = defs;
  }, [projects]);

  // Compute screen-space positions for decision pins
  const recalcDecisionPins = useCallback(() => {
    const pins: DecisionPin[] = [];
    for (const marker of decisionMarkers) {
      if (!marker.projectId) continue;
      const building = buildings.current.find((b) => b.id === marker.projectId);
      if (!building) continue;

      const iso = isoProject(building.gridX, building.gridY);
      const scale = GROWTH_SCALE[building.growth] ?? 0.6;
      const baseSize = building.style === 'studio' ? 70 : building.style === 'community-hall' ? 65 : building.style === 'data-center' ? 40 : 50;
      const baseH = building.style === 'data-center' ? 90 : building.style === 'community-hall' ? 65 : building.style === 'studio' ? 40 : 60;
      const ox = iso.x + canvasSize.width / 2 - GRID_COLS * GRID_COL_WIDTH * 0.43;
      const oy = iso.y + 80;

      // Pin floats above the building, offset slightly per decision
      const pinIdx = pins.filter((p) => p.projectId === marker.projectId).length;
      pins.push({
        decisionId: marker.decisionId,
        projectId: marker.projectId,
        question: marker.question,
        screenX: ox + (baseSize * scale * 0.5) + (pinIdx * 14),
        screenY: oy - baseH * scale - 20 - (pinIdx * 6),
      });
    }
    setDecisionPins(pins);
  }, [decisionMarkers, canvasSize]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasSize;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear with dark background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Grid dots
    ctx.fillStyle = '#27272a22';
    for (let x = 0; x < width; x += 40) {
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sort by Y (back to front)
    const sorted = [...buildings.current].sort((a, b) => a.gridY - b.gridY);

    for (const building of sorted) {
      const isLot = building.id.startsWith('lot-');
      const scale = GROWTH_SCALE[building.growth] ?? 0.6;
      const colors = STYLE_COLORS[building.style];
      const isHovered = hoveredId === building.id;

      if (isLot) {
        const glowIntensity = 0.3 + 0.15 * Math.sin(glowPhaseRef.current + building.gridX * 0.01);
        const centerX = building.gridX + 30;
        const centerY = building.gridY - 25;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50 * scale);
        gradient.addColorStop(0, `rgba(251, 191, 36, ${glowIntensity})`);
        gradient.addColorStop(0.5, `rgba(251, 191, 36, ${glowIntensity * 0.3})`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(centerX - 60, centerY - 60, 120, 120);

        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = `rgba(251, 191, 36, ${glowIntensity * 2})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(building.gridX - 5, building.gridY - 40 * scale - 5, 60 * scale, 45 * scale);
        ctx.setLineDash([]);

        ctx.fillStyle = `rgba(251, 191, 36, ${glowIntensity * 2.5})`;
        ctx.font = `${Math.max(10, 11 * scale)}px "Geist", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✨ Coming soon', centerX, centerY + 35 * scale);
        continue;
      }

      const iso = isoProject(building.gridX, building.gridY);
      const origin: Point = { x: iso.x + width / 2 - GRID_COLS * GRID_COL_WIDTH * 0.43, y: iso.y + 80 };

      ctx.save();
      const drawFn = DRAW_FUNCTIONS[building.style];
      drawFn(ctx, origin, scale, colors, isHovered);
      ctx.restore();

      if (isHovered) {
        ctx.save();
        ctx.shadowColor = colors.highlight;
        ctx.shadowBlur = 20;
        drawFn(ctx, origin, scale, colors, true);
        ctx.restore();
      }

      // Label
      ctx.fillStyle = isHovered ? colors.highlight : '#a1a1aa';
      ctx.font = `${Math.max(10, 11 * scale)}px "Geist", sans-serif`;
      ctx.textAlign = 'center';
      const labelX = origin.x + (building.style === 'studio' ? 35 : building.style === 'community-hall' ? 32 : 25) * scale;
      const labelY = origin.y + 16;
      ctx.fillText(building.label, labelX, labelY);

      // Growth stage indicator dot
      const stageColors: Record<GrowthStage, string> = {
        seedling: '#a3e635',
        sprouting: '#22c55e',
        growing: '#14b8a6',
        mature: '#f59e0b',
      };
      ctx.beginPath();
      ctx.arc(labelX, labelY + 12, 3 * scale, 0, Math.PI * 2);
      ctx.fillStyle = stageColors[building.growth] ?? stageColors.seedling;
      ctx.fill();
    }
  }, [canvasSize, hoveredId]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    recalcBuildings();
  }, [projects, recalcBuildings]);

  useEffect(() => {
    const frame = requestAnimationFrame(recalcDecisionPins);
    return () => cancelAnimationFrame(frame);
  }, [decisionMarkers, canvasSize, recalcDecisionPins]);

  // Animation loop
  useEffect(() => {
    let running = true;
    const hasEmptyLots = buildings.current.some((b) => b.id.startsWith('lot-'));

    if (hasEmptyLots) {
      const animate = () => {
        if (!running) return;
        glowPhaseRef.current += 0.03;
        render();
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } else {
      render();
    }

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  // Mouse move for buildings
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let found: BuildingDef | null = null;
      for (const building of buildings.current) {
        if (building.id.startsWith('lot-')) continue;
        const scale = GROWTH_SCALE[building.growth] ?? 0.6;
        const iso = isoProject(building.gridX, building.gridY);
        const ox = iso.x + canvasSize.width / 2 - GRID_COLS * GRID_COL_WIDTH * 0.43;
        const oy = iso.y + 80;
        const baseSize = building.style === 'studio' ? 70 : building.style === 'community-hall' ? 65 : building.style === 'data-center' ? 40 : 50;
        const w = baseSize * scale;
        const baseH = building.style === 'data-center' ? 90 : building.style === 'community-hall' ? 65 : building.style === 'studio' ? 40 : 60;
        const h = baseH * scale;

        const centerX = ox + w * 0.5;
        const boxW = w + 20;

        if (
          mouseX > centerX - boxW / 2 &&
          mouseX < centerX + boxW / 2 &&
          mouseY > oy - h - 10 &&
          mouseY < oy + 25
        ) {
          found = building;
          break;
        }
      }

      if (found) {
        setHoveredId(found.id);
        setHoverInfo({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          name: found.label,
          decisionCount: found.decisionCount,
          adoptionCount: found.adoptionCount,
        });
        canvas.style.cursor = 'pointer';
      } else {
        setHoveredId(null);
        setHoverInfo(null);
        canvas.style.cursor = 'default';
      }
    },
    [canvasSize]
  );

  const handleClick = useCallback(() => {
    if (hoveredId && !hoveredId.startsWith('lot-')) {
      router.push(`/projects/${hoveredId}`);
    }
  }, [hoveredId, router]);

  return (
    <div className="relative w-full h-full" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => {
          setHoveredId(null);
          setHoverInfo(null);
        }}
        className="w-full h-full block"
      />

      {/* Decision pins rendered as HTML overlay */}
      {decisionPins.map((pin) => (
        <button
          key={pin.decisionId}
          onClick={() => router.push(`/decisions/${pin.decisionId}`)}
          onMouseEnter={() => setHoveredDecisionId(pin.decisionId)}
          onMouseLeave={() => setHoveredDecisionId(null)}
          title={pin.question}
          className="absolute z-10 group"
          style={{
            left: pin.screenX - 6,
            top: pin.screenY - 6,
          }}
        >
          {/* Pin dot */}
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-600 shadow-lg shadow-emerald-400/40 group-hover:scale-150 transition-transform duration-150" />
            {/* Tooltip */}
            {hoveredDecisionId === pin.decisionId && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none">
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-1.5 shadow-xl backdrop-blur-sm whitespace-nowrap max-w-[200px]">
                  <div className="text-xs text-emerald-400 font-medium mb-0.5">✓ Decided</div>
                  <div className="text-xs text-zinc-300 truncate">{pin.question}</div>
                </div>
              </div>
            )}
          </div>
        </button>
      ))}

      {/* Building hover tooltip */}
      {hoverInfo && !hoverInfo.name.startsWith('lot-') && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur-sm"
          style={{
            left: hoverInfo.x + 12,
            top: hoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-white">{hoverInfo.name}</div>
          <div className="text-xs text-zinc-400">
            {hoverInfo.decisionCount} decision{hoverInfo.decisionCount !== 1 ? 's' : ''} ·{' '}
            <span className="text-emerald-400">{hoverInfo.adoptionCount} adopted</span>
          </div>
        </div>
      )}
    </div>
  );
}
