import { useEffect, useMemo, useRef, useState } from "react";
import type { FacilityPort } from "../core/port";
import {
  clampCamera,
  focusCamera,
  startCamera,
  stepZoom,
  toWorld,
  zoomAround,
  zoomToFit,
  MAX_ZOOM,
  minZoom,
  type Camera,
  type Viewport,
} from "./camera";
import { buildLayout, layoutKey, TILE } from "./layout";
import { placeWalker, step, type Walker } from "./movement";
import { drawFacility, earthPattern, hitTest, paintBackground } from "./render";
import type { Selection } from "./status";
import { targetFor } from "./targets";
import { Icon } from "../ui/Icon";

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
  const [tip, setTip] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);

  const initial = ledger.getState();
  const key = layoutKey(initial.wings, initial.rooms);
  // Rebuilt only when the wings or rooms really change, not on every snapshot.
  const layout = useMemo(
    () => buildLayout(initial.wings, initial.rooms),
    [key],
  );
  const walkers = useRef(new Map<string, Walker>());
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const view = useRef<Viewport>({ width: 1, height: 1 });
  const flight = useRef<Flight | null>(null);
  const zoomMotion = useRef<{
    zoom: number;
    screen: { x: number; y: number };
  } | null>(null);

  const setCamera = (next: Camera) => {
    flight.current = null;
    zoomMotion.current = null;
    camera.current = clampCamera(next, layout, view.current);
  };
  const flyTo = (to: Camera) => {
    zoomMotion.current = null;
    const target = clampCamera(to, layout, view.current);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      setCamera(target);
    else flight.current = { from: camera.current, to: target, t: 0 };
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const background = paintBackground(layout, ledger.getState());
    const earth = earthPattern(ctx);
    // A new floor plan moves rooms, so everyone starts again at their workstation.
    walkers.current.clear();
    let frame = 0;
    let last = performance.now();
    let placed = false;
    let shownZoom = 0;

    const resize = () => {
      const width = wrap.clientWidth;
      const height = Math.max(1, wrap.clientHeight);
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      view.current = { width, height };
      const selected = selectionRef.current;
      const selectedRoom =
        selected?.kind === "room"
          ? layout.rooms.get(selected.id)
          : selected?.kind === "agent"
            ? layout.rooms.get(
                ledger.getState().agents.find((a) => a.id === selected.id)
                  ?.roomId ?? "",
              )
            : undefined;
      camera.current =
        placed && selectedRoom
          ? focusCamera(selectedRoom.rect, layout, view.current, 1.4, 3)
          : startCamera(layout, view.current);
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
        walkers.current.set(
          agent.id,
          step(
            layout,
            current,
            target,
            dt,
            agent.status === "working" ? "up" : "down",
          ),
        );
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

      if (zoomMotion.current) {
        const motion = zoomMotion.current;
        const next =
          camera.current.zoom +
          (motion.zoom - camera.current.zoom) * (1 - Math.exp(-dt * 16));
        camera.current = clampCamera(
          zoomAround(camera.current, next, motion.screen, view.current),
          layout,
          view.current,
        );
        if (Math.abs(next - motion.zoom) < 0.001) zoomMotion.current = null;
      }

      const dpr = window.devicePixelRatio || 1;
      const { width, height } = view.current;
      const cam = camera.current;
      const percent = Math.round(cam.zoom * 100);
      if (percent !== shownZoom) {
        shownZoom = percent;
        setZoomPercent(percent);
      }
      // Snap the offset to whole device pixels so the art doesn't shimmer as it moves.
      const scale = cam.zoom * dpr;
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        Math.round((width / 2 - cam.x * cam.zoom) * dpr),
        Math.round((height / 2 - cam.y * cam.zoom) * dpr),
      );
      ctx.imageSmoothingEnabled = false;
      // Dirt everywhere the facility doesn't reach, when zoomed out past its edges.
      const halfW = width / cam.zoom / 2 + TILE;
      const halfH = height / cam.zoom / 2 + TILE;
      ctx.fillStyle = earth;
      ctx.fillRect(
        Math.floor(cam.x - halfW),
        Math.floor(cam.y - halfH),
        Math.ceil(halfW * 2),
        Math.ceil(halfH * 2),
      );
      drawFacility(
        ctx,
        {
          state,
          layout,
          walkers: walkers.current,
          selection: selectionRef.current,
          hovered: hoveredRef.current,
          time: now / 1000,
        },
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
      if (room)
        flyTo(
          focusCamera(
            room.rect,
            layout,
            view.current,
            1.6,
            Math.max(camera.current.zoom, 2),
          ),
        );
      return;
    }
    const w = walkers.current.get(selection.id);
    if (w)
      flyTo({ x: w.x, y: w.y - 10, zoom: Math.max(camera.current.zoom, 3) });
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
    press.current =
      pointers.current.size === 1 ? { ...local(e), moved: false } : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: camera.current.zoom,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (prev) {
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoom =
          pinch.current.zoom *
          (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance);
        setCamera(zoomAround(camera.current, zoom, mid, view.current));
        return;
      }
      if (
        press.current &&
        Math.hypot(p.x - press.current.x, p.y - press.current.y) > CLICK_SLOP_PX
      )
        press.current.moved = true;
      if (press.current?.moved) {
        const c = camera.current;
        setCamera({
          ...c,
          x: c.x - (p.x - prev.x) / c.zoom,
          y: c.y - (p.y - prev.y) / c.zoom,
        });
        setTip(null);
      }
      return;
    }
    // Hover: highlight and name what's under the pointer.
    const w = toWorld(camera.current, p, view.current);
    const hit = hitTest(layout, walkers.current, w.x, w.y);
    hoveredRef.current = hit;
    const text = hit ? describe(hit) : null;
    setTip(text);
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
    flight.current = null;
    const base = zoomMotion.current?.zoom ?? camera.current.zoom;
    const delta = Math.max(
      -120,
      Math.min(120, e.deltaY * (e.deltaMode === 1 ? 16 : 1)),
    );
    const zoom = Math.max(
      minZoom(layout, view.current),
      Math.min(MAX_ZOOM, base * Math.exp(-delta * 0.002)),
    );
    const screen = local(e);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      setCamera(zoomAround(camera.current, zoom, screen, view.current));
    else zoomMotion.current = { zoom, screen };
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
    flyTo(next());
  };

  const describe = (hit: Selection) => {
    const state = ledger.getState();
    if (hit.kind === "room") {
      const room = state.rooms.find((r) => r.id === hit.id);
      return room?.kind === "sealed"
        ? "Sealed: reserved for the next business"
        : (room?.name ?? null);
    }
    const agent = state.agents.find((a) => a.id === hit.id);
    if (!agent) return null;
    const task = agent.taskId
      ? state.tasks.find((t) => t.id === agent.taskId)
      : undefined;
    return `${agent.name} · ${agent.status === "working" && task ? task.title : agent.status}`;
  };

  const overview = () =>
    flyTo({
      x: layout.width / 2,
      y: layout.height / 2,
      zoom: zoomToFit({ w: layout.width, h: layout.height }, view.current),
    });
  const selectedRoom =
    selection?.kind === "room"
      ? selection.id
      : selection?.kind === "agent"
        ? (initial.agents.find((a) => a.id === selection.id)?.roomId ?? "")
        : "";
  const working = initial.agents.filter((a) => a.status === "working").length;
  return (
    <div className="facility-view">
      <div className="map-toolbar">
        <span className="map-title">Facility</span>
        <label className="room-locator">
          <span className="sr-only">Locate room</span>
          <select
            id="room-locator"
            value={selectedRoom}
            onChange={(e) =>
              e.target.value
                ? onSelect({ kind: "room", id: e.target.value })
                : onSelect(null)
            }
          >
            <option value="">Locate room…</option>
            {initial.rooms
              .filter((room) => room.kind !== "sealed")
              .map((room) => (
                <option value={room.id} key={room.id}>
                  {room.name}
                </option>
              ))}
          </select>
        </label>
        <nav className="map-controls" aria-label="Map controls">
          <button
            type="button"
            onClick={overview}
            title="Show the entire facility"
          >
            <Icon name="fit" size={15} />
            <span>Fit</span>
          </button>
          <div className="map-zoom">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() =>
                flyTo({ ...camera.current, zoom: camera.current.zoom / 1.3 })
              }
            >
              −
            </button>
            <output aria-label="Map zoom">{zoomPercent}%</output>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() =>
                flyTo({ ...camera.current, zoom: camera.current.zoom * 1.3 })
              }
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Map controls help"
            aria-expanded={help}
            aria-controls="map-help"
            onClick={() => setHelp(!help)}
          >
            <Icon name="help" size={17} />
          </button>
        </nav>
      </div>
      {help && (
        <div id="map-help" className="map-help">
          <p>
            Drag to pan. Scroll or pinch to zoom around the pointer. Select a
            room or agent to inspect it.
          </p>
          <p>
            With the map focused: arrow keys pan, + / − zoom. Fit returns to the
            whole facility. Escape closes details.
          </p>
        </div>
      )}
      <div ref={wrapRef} className="facility-wrap">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            pointers.current.clear();
            press.current = null;
            pinch.current = null;
          }}
          onPointerLeave={() => {
            hoveredRef.current = null;
            setTip(null);
          }}
          onWheel={handleWheel}
          onKeyDown={handleKey}
          role="img"
          aria-label="Facility map. Drag to pan, scroll or pinch to zoom. Arrow keys pan; plus and minus zoom. Use Locate room or Crew for the same details without the map."
        />
      </div>
      <div className="map-status">
        <span>{tip ?? "Drag to pan · scroll to zoom · select to inspect"}</span>
        <span>
          {working} / {initial.agents.length} working
        </span>
      </div>
    </div>
  );
}
