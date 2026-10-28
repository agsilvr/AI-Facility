import type { Agent, FacilityState, Room, Wing } from "./types";

// The starting facility: a shared core, the Etsy wing, and a sealed level
// reserved for the next business. Adding a business means adding a wing here
// (later, a row in the database) with its rooms, workflows and agents.

export const wings: Wing[] = [
  {
    id: "core",
    name: "Command Core",
    color: "#38bdf8",
    budgetMonthly: 10,
    workflows: [
      {
        id: "briefing",
        label: "Daily briefing",
        stages: [{ id: "brief", label: "Compile briefing", roomId: "command" }],
      },
    ],
  },
  {
    id: "etsy",
    name: "Etsy Wing",
    color: "#f59e0b",
    budgetMonthly: 30,
    workflows: [
      {
        id: "listing",
        label: "New product",
        stages: [
          { id: "research", label: "Research trend", roomId: "etsy-lab" },
          { id: "design", label: "Design product", roomId: "etsy-studio" },
          { id: "list", label: "Draft listing", roomId: "etsy-bay", needsApproval: true },
          { id: "publish", label: "Publish to shop", roomId: "dock" },
        ],
      },
      {
        id: "message",
        label: "Customer message",
        stages: [
          { id: "reply", label: "Draft reply", roomId: "etsy-comms", needsApproval: true },
          { id: "send", label: "Send reply", roomId: "etsy-comms" },
        ],
      },
    ],
  },
  {
    id: "expansion",
    name: "Expansion Level",
    color: "#64748b",
    budgetMonthly: 0,
    workflows: [],
    sealed: true,
  },
];

export const rooms: Room[] = [
  { id: "dock", wingId: "core", name: "Surface Dock", kind: "dock" },
  { id: "command", wingId: "core", name: "Command Center", kind: "command" },
  { id: "vault", wingId: "core", name: "Vault", kind: "vault" },
  { id: "etsy-lab", wingId: "etsy", name: "Research Lab", kind: "lab" },
  { id: "etsy-studio", wingId: "etsy", name: "Design Studio", kind: "studio" },
  { id: "etsy-bay", wingId: "etsy", name: "Listing Bay", kind: "bay" },
  { id: "etsy-comms", wingId: "etsy", name: "Comms", kind: "comms" },
  { id: "expansion-1", wingId: "expansion", name: "Sealed", kind: "sealed" },
  { id: "expansion-2", wingId: "expansion", name: "Sealed", kind: "sealed" },
];

function agent(
  id: string,
  name: string,
  role: string,
  wingId: string,
  skills: string[],
  roomId: string,
  suit: string,
  visor: string,
): Agent {
  return { id, name, role, wingId, skills, status: "idle", roomId, taskId: null, sprite: { suit, visor } };
}

export const agents: Agent[] = [
  agent("warden", "Warden", "Operations overseer", "core", ["brief"], "command", "#0ea5e9", "#e0f2fe"),
  agent("scout", "Scout", "Trend researcher", "etsy", ["research"], "etsy-lab", "#22c55e", "#bbf7d0"),
  agent("muse", "Muse", "Product designer", "etsy", ["design"], "etsy-studio", "#a855f7", "#f3e8ff"),
  agent("muse-2", "Pixel", "Product designer", "etsy", ["design"], "etsy-studio", "#d946ef", "#fae8ff"),
  agent("quill", "Quill", "Listing writer", "etsy", ["list", "publish"], "etsy-bay", "#f59e0b", "#fef3c7"),
  agent("echo", "Echo", "Customer care", "etsy", ["reply", "send"], "etsy-comms", "#ef4444", "#fee2e2"),
];

export function initialState(): FacilityState {
  return {
    wings,
    rooms,
    agents: agents.map((a) => ({ ...a })),
    tasks: [],
    approvals: [],
    log: [
      { id: "log-boot", at: Date.now(), wingId: null, level: "success", text: "Facility online. All crew reporting for duty." },
    ],
    spend: { core: 0, etsy: 0, expansion: 0 },
  };
}
