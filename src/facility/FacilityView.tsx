import { useEffect, useMemo, useRef } from "react";
import type { FacilityPort } from "../core/port";
import type { FacilityState } from "../core/types";
import { buildLayout, contains, WORLD_W, type FacilityLayout } from "./layout";
import { step, type Target, type Walker } from "./movement";
import { drawFacility, type Selection } from "./render";

interface Props {
  ledger: FacilityPort;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

/** Where an agent should stand: its current room, spaced out from room-mates. */
function targetFor(state: FacilityState, layout: FacilityLayout, agentId: string): Target | null {
  const agent = state.agents.find((a) => a.id === agentId);
  const room = agent && layout.rooms.get(agent.roomId);
  if (!agent || !room) return null;
  const mates = state.agents.filter((a) => a.roomId === agent.roomId);
  const slot = mates.findIndex((a) => a.id === agentId);
  const spacing = Math.min(30, (room.rect.w - 40) / Math.max(1, mates.length));
  return {
    x: room.rect.x + 24 + slot * spacing + spacing / 2,
    y: room.floorY,
    level: room.level,
  };
}

export function FacilityView({ ledger, selection, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const initial = ledger.getState();
  const layout = useMemo(() => buildLayout(initial.wings, initial.rooms), [initial.wings, initial.rooms]);
  const walkers = useRef(new Map<string, Walker>());
  const scaleRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const scale = wrap.clientWidth / WORLD_W;
      scaleRef.current = scale;
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${layout.height * scale}px`;
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(layout.height * scale * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const state = ledger.getState();

      for (const agent of state.agents) {
        const target = targetFor(state, layout, agent.id);
        if (!target) continue;
        const current = walkers.current.get(agent.id) ?? { ...target, facing: 1, moving: false };
        walkers.current.set(agent.id, step(current, target, dt));
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scaleRef.current * dpr, 0, 0, scaleRef.current * dpr, 0, 0);
      drawFacility(ctx, {
        state,
        layout,
        walkers: walkers.current,
        selection: selectionRef.current,
        time: now / 1000,
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ledger, layout]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scaleRef.current;
    const y = (e.clientY - rect.top) / scaleRef.current;
    for (const [id, w] of walkers.current) {
      if (Math.abs(x - w.x) < 10 && y < w.y + 4 && y > w.y - 30) {
        onSelect({ kind: "agent", id });
        return;
      }
    }
    for (const [id, room] of layout.rooms) {
      if (contains(room.rect, x, y)) {
        onSelect({ kind: "room", id });
        return;
      }
    }
    onSelect(null);
  };

  return (
    <div ref={wrapRef} className="facility-wrap">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        role="img"
        aria-label="Underground facility map showing rooms and agents"
      />
    </div>
  );
}
