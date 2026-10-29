import { useEffect, useMemo, useRef, useState } from "react";
import type { FacilityPort } from "../core/port";
import { buildLayout, layoutKey } from "../facility/layout";
import type { Selection } from "../facility/status";
import { FacilityScene } from "./scene";

interface Props {
  ledger: FacilityPort;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** Called when this computer can't draw 3D, so the 2D map can take over. */
  onUnsupported: () => void;
}

const CLICK_SLOP_PX = 5;

export function Facility3DView({ ledger, selection, onSelect, onUnsupported }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FacilityScene | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [hint, setHint] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const initial = ledger.getState();
  const key = layoutKey(initial.wings, initial.rooms);
  // Rebuilt only when the wings or rooms really change, not on every snapshot.
  const layout = useMemo(() => buildLayout(initial.wings, initial.rooms), [key]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    let scene: FacilityScene;
    try {
      scene = new FacilityScene(canvas, layout, ledger.getState());
    } catch {
      onUnsupported();
      return;
    }
    sceneRef.current = scene;
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const width = wrap.clientWidth;
      // The facility is wider than it is tall, so size the view to match it.
      // On phones leave room above and below for the level buttons and the hint.
      const height = Math.round(Math.min(Math.max(width * (width < 600 ? 0.9 : 0.74), 320), window.innerHeight - 110));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      scene.resize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    scene.resetView();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scene.frame(ledger.getState(), selectionRef.current, now / 1000, dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [ledger, layout, onUnsupported]);

  // Fly the camera to whatever gets selected, here or in the sidebar.
  useEffect(() => {
    if (selection) sceneRef.current?.focus(selection);
  }, [selection]);

  const down = useRef<{ x: number; y: number } | null>(null);

  // Hover: highlight and name what's under the pointer (checked at most ~12 times a second).
  const lastHover = useRef(0);
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (down.current || e.timeStamp - lastHover.current < 80) return;
    lastHover.current = e.timeStamp;
    const scene = sceneRef.current;
    if (!scene) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = scene.pick(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    scene.setHover(hit);
    const text = hit ? describe(hit) : null;
    setTip(text ? { x: e.clientX - rect.left, y: e.clientY - rect.top, text } : null);
  };
  const handlePointerLeave = () => {
    sceneRef.current?.setHover(null);
    setTip(null);
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

  // Tell a click from a drag: dragging moves the camera, clicking selects.
  const handlePointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
    setHint(false);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = down.current;
    down.current = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    onSelect(sceneRef.current?.pick(x, y) ?? null);
  };

  return (
    <div ref={wrapRef} className="facility-wrap facility-3d">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        role="img"
        aria-label="3D underground facility seen from above, showing rooms and crew. Drag to move, right-drag or two fingers to turn, scroll or pinch to zoom."
      />
      <nav className="view-levels" aria-label="Fly to a level">
        <button type="button" onClick={() => sceneRef.current?.overview()}>
          Overview
        </button>
        {layout.levels.map((level) => {
          const wing = initial.wings.find((w) => w.id === level.wingId);
          return (
            <button
              type="button"
              key={level.wingId}
              title={wing?.name}
              style={{ borderColor: wing?.sealed ? undefined : wing?.color }}
              onClick={() => sceneRef.current?.focusLevel(level.index)}
            >
              B{level.index + 1}
              <span className="view-level-name"> {wing?.name}</span>
            </button>
          );
        })}
      </nav>
      {tip && (
        <div className="view-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
      {hint && <p className="view-hint">
          <span className="view-hint-wide">Drag to move · right-drag to turn · scroll to zoom · click to inspect</span>
          <span className="view-hint-touch">Drag to move · pinch or twist · tap to inspect</span>
        </p>}
    </div>
  );
}
