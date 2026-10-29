import { useEffect, useMemo, useRef, useState } from "react";
import type { FacilityPort } from "../core/port";
import {
  clampCamera,
  focusCamera,
  startCamera,
  stepZoom,
  toWorld,
  wingArea,
  zoomAround,
  zoomToFit,
  type Camera,
  type Viewport,
} from "./camera";
import { buildLayout, layoutKey, TILE } from "./layout";
import { placeWalker, step, type Walker } from "./movement";
import { drawFacility, earthPattern, hitTest, paintBackground } from "./render";
import type { Selection } from "./status";
import { targetFor } from "./targets";

// The facility map: an underground pixel-art station you can drag around,
// zoom into and click. Everything on it comes from the ledger.

interface Props {
  ledger: FacilityPort;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

const CLICK_SLOP_PX = 5;
const FLY_SECONDS = 0.5;

interface Flight {
  from: Camera;
  to: Camera;
  t: number;
}

export function FacilityView({ ledger, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const hoveredRef = useRef<Selection | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hint, setHint] = useState(true);

  const initial = ledger.getState();
  const key = layoutKey(initial.wings, initial.rooms);
  // Rebuilt only when the wings or rooms really change, not on every snapshot.
  const layout = useMemo(() => buildLayout(initial.wings, initial.rooms), [key]);
  const walkers = useRef(new Map<string, Walker>());
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const view = useRef<Viewport>({ width: 1, height: 1 });
  const flight = useRef<Flight | null>(null);

  const setCamera = (next: Camera) => {
    flight.current = null;
    camera.current = clampCamera(next, layout, view.current);
  };
  const flyTo = (to: Camera) => {
    const target = clampCamera(to, layout, view.current);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setCamera(target);
    else flight.current = { from: camera.current, to: target, t: 0 };
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const background = paintBackground(layout, ledger.getState());
    const earth = earthPattern(ctx);
    let frame = 0;
    let last = performance.now();
    let placed = false;

    const resize = () => {
      const width = wrap.clientWidth;
      const height = Math.round(Math.max(340, Math.min(720, window.innerHeight - 150, width < 600 ? width * 1.2 : Infinity)));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      view.current = { width, height };
      camera.current = placed ? clampCamera(camera.current, layout, view.current) : startCamera(layout, view.current);
      placed = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    // The wheel zooms the map, so it mustn't scroll the page too.
    const stopScroll = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener("wheel", stopScroll, { passive: false });

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const state = ledger.getState();

      for (const agent of state.agents) {
        const target = targetFor(state, layout, agent.id);
        if (!target) continue;
        const current = walkers.current.get(agent.id) ?? placeWalker(target);
        // At rest, people at work face their workstation; everyone else faces you.
        walkers.current.set(agent.id, step(layout, current, target, dt, agent.status === "working" ? "up" : "down"));
      }

      if (flight.current) {
        const f = flight.current;
        f.t = Math.min(1, f.t + dt / FLY_SECONDS);
        const k = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2;
        camera.current = {
          x: f.from.x + (f.to.x - f.from.x) * k,
          y: f.from.y + (f.to.y - f.from.y) * k,
          zoom: f.from.zoom + (f.to.zoom - f.from.zoom) * k,
        };
        if (f.t >= 1) flight.current = null;
      }

      const dpr = window.devicePixelRatio || 1;
      const { width, height } = view.current;
      const cam = camera.current;
      // Snap the offset to whole device pixels so the art doesn't shimmer as it moves.
      const scale = cam.zoom * dpr;
      ctx.setTransform(scale, 0, 0, scale, Math.round((width / 2 - cam.x * cam.zoom) * dpr), Math.round((height / 2 - cam.y * cam.zoom) * dpr));
      ctx.imageSmoothingEnabled = false;
      // Dirt everywhere the facility doesn't reach, when zoomed out past its edges.
      const halfW = width / cam.zoom / 2 + TILE;
      const halfH = height / cam.zoom / 2 + TILE;
      ctx.fillStyle = earth;
      ctx.fillRect(Math.floor(cam.x - halfW), Math.floor(cam.y - halfH), Math.ceil(halfW * 2), Math.ceil(halfH * 2));
      drawFacility(
        ctx,
        { state, layout, walkers: walkers.current, selection: selectionRef.current, hovered: hoveredRef.current, time: now / 1000 },
        background,
      );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("wheel", stopScroll);
    };
  }, [ledger, layout]);

  // Bring whatever gets selected, here or in the sidebar, into view.
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === "room") {
      const room = layout.rooms.get(selection.id);
      if (room) flyTo(focusCamera(room.rect, layout, view.current, 1.6, Math.max(camera.current.zoom, 2)));
      return;
    }
    const w = walkers.current.get(selection.id);
    if (w) flyTo({ x: w.x, y: w.y - 10, zoom: Math.max(camera.current.zoom, 3) });
  }, [selection, layout]);

  // Pointer handling: one finger or the mouse drags the map, two fingers pinch to zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    press.current = pointers.current.size === 1 ? { ...local(e), moved: false } : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: camera.current.zoom };
    }
    setHint(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (prev) {
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoom = pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance);
        setCamera(zoomAround(camera.current, zoom, mid, view.current));
        return;
      }
      if (press.current && Math.hypot(p.x - press.current.x, p.y - press.current.y) > CLICK_SLOP_PX) press.current.moved = true;
      if (press.current?.moved) {
        const c = camera.current;
        setCamera({ ...c, x: c.x - (p.x - prev.x) / c.zoom, y: c.y - (p.y - prev.y) / c.zoom });
        setTip(null);
      }
      return;
    }
    // Hover: highlight and name what's under the pointer.
    const w = toWorld(camera.current, p, view.current);
    const hit = hitTest(layout, walkers.current, w.x, w.y);
    hoveredRef.current = hit;
    const text = hit ? describe(hit) : null;
    setTip(text ? { x: p.x, y: p.y, text } : null);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const start = press.current;
    press.current = null;
    if (!start || start.moved) return;
    const w = toWorld(camera.current, local(e), view.current);
    onSelect(hitTest(layout, walkers.current, w.x, w.y));
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (e.deltaY === 0) return;
    setHint(false);
    setCamera(zoomAround(camera.current, stepZoom(camera.current.zoom, e.deltaY < 0 ? 1 : -1), local(e), view.current));
  };

  // Keyboard: arrow keys move, + and - zoom.
  const handleKey = (e: React.KeyboardEvent) => {
    const c = camera.current;
    const move = 48 / c.zoom;
    const keys: Record<string, () => Camera> = {
      ArrowLeft: () => ({ ...c, x: c.x - move }),
      ArrowRight: () => ({ ...c, x: c.x + move }),
      ArrowUp: () => ({ ...c, y: c.y - move }),
      ArrowDown: () => ({ ...c, y: c.y + move }),
      "+": () => ({ ...c, zoom: stepZoom(c.zoom, 1) }),
      "=": () => ({ ...c, zoom: stepZoom(c.zoom, 1) }),
      "-": () => ({ ...c, zoom: stepZoom(c.zoom, -1) }),
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    setCamera(next());
  };

  const describe = (hit: Selection) => {
    const state = ledger.getState();
    if (hit.kind === "room") {
      const room = state.rooms.find((r) => r.id === hit.id);
      return room?.kind === "sealed" ? "Sealed: reserved for the next business" : (room?.name ?? null);
    }
    const agent = state.agents.find((a) => a.id === hit.id);
    if (!agent) return null;
    const task = agent.taskId ? state.tasks.find((t) => t.id === agent.taskId) : undefined;
    return `${agent.name} · ${agent.status === "working" && task ? task.title : agent.status}`;
  };

  const overview = () => flyTo({ x: layout.width / 2, y: layout.height / 2, zoom: zoomToFit({ w: layout.width, h: layout.height }, view.current) });
  const showWing = (wingId: string) => {
    const area = wingArea(layout, wingId);
    if (area) flyTo(focusCamera(area, layout, view.current, 1.05, 3));
  };

  return (
    <div ref={wrapRef} className="facility-wrap">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          hoveredRef.current = null;
          setTip(null);
        }}
        onWheel={handleWheel}
        onKeyDown={handleKey}
        role="img"
        aria-label="Map of the underground facility showing rooms and crew. Drag to move, scroll or pinch to zoom, arrow keys to move."
      />
      <nav className="map-buttons" aria-label="Jump to part of the facility">
        <button type="button" onClick={overview}>
          Overview
        </button>
        {initial.wings.map((wing) => (
          <button type="button" key={wing.id} style={{ borderColor: wing.sealed ? undefined : wing.color }} onClick={() => showWing(wing.id)}>
            {wing.name}
          </button>
        ))}
        <span className="map-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setCamera({ ...camera.current, zoom: stepZoom(camera.current.zoom, -1) })}>
            −
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setCamera({ ...camera.current, zoom: stepZoom(camera.current.zoom, 1) })}>
            +
          </button>
        </span>
      </nav>
      {tip && (
        <div className="map-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
      {hint && (
        <p className="map-hint">
          <span className="map-hint-wide">Drag to move · scroll to zoom · click to inspect</span>
          <span className="map-hint-touch">Drag to move · pinch to zoom · tap to inspect</span>
        </p>
      )}
    </div>
  );
}
