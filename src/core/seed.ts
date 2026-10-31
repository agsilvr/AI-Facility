import { monthKey } from "./ledger";
import type { Agent, AgentCapability, FacilityState, Room, Wing } from "./types";

// The starting facility: a shared core, the Etsy wing, and a sealed district
// reserved for the next business. Adding a business means adding a wing here
// (later, a row in the database) with its rooms, workflows and agents.

export const wings: Wing[] = [
  {
    id: "core",
    name: "Command Core",
    color: "#81936f",
    budgetMonthly: 10,
    workflows: [
      {
        id: "briefing",
        label: "Daily briefing",
        stages: [{ id: "brief", label: "Compile briefing", roomId: "command", executor: "code" }],
      },
    ],
  },
  {
    id: "etsy",
    name: "Etsy Wing",
    color: "#b38c56",
    budgetMonthly: 30,
    workflows: [
      { id: "artwork-pilot", label: "Research to artwork review", stages: [
        { id: "research", label: "Select a research direction", roomId: "etsy-lab", job: "research", data: "shop" },
        { id: "design", label: "Generate original artwork", roomId: "etsy-studio", job: "design", data: "shop", executor: "code" },
        { id: "quality", label: "Review artwork quality", roomId: "etsy-qc", executor: "code", needsApproval: true },
        { id: "accept-artwork", label: "Archive accepted artwork", roomId: "dock", action: "internal.acceptArtwork" },
      ] },
      { id: "research-test", label: "Research notebook", stages: [
        { id: "research-test", label: "Review public evidence", roomId: "etsy-lab", job: "research", data: "public" },
      ] },
      {
        id: "listing",
        label: "New product",
        stages: [
          { id: "research", label: "Develop idea", roomId: "etsy-lab", job: "research", data: "shop" },
          { id: "design", label: "Design product", roomId: "etsy-studio", job: "design", data: "public" },
          { id: "quality", label: "Check artwork", roomId: "etsy-qc", executor: "code" },
          { id: "list", label: "Draft listing", roomId: "etsy-factory", needsApproval: true, job: "write", data: "shop" },
          { id: "publish", label: "Publish to shop", roomId: "dock", action: "etsy.publishListing" },
        ],
      },
      {
        id: "message",
        label: "Customer message",
        stages: [
          { id: "reply", label: "Draft reply", roomId: "etsy-comms", needsApproval: true, job: "write", data: "customer" },
          { id: "send", label: "Send reply", roomId: "etsy-comms", action: "etsy.sendReply" },
        ],
      },
    ],
  },
  {
    id: "expansion",
    name: "Expansion",
    color: "#8c9b8e",
    budgetMonthly: 0,
    workflows: [],
    sealed: true,
  },
];

export const rooms: Room[] = [
  { id: "dock", wingId: "core", name: "Archive / Outbox", kind: "dock" },
  { id: "command", wingId: "core", name: "Command Bridge", kind: "command" },
  { id: "security", wingId: "core", name: "Security Control", kind: "security" },
  { id: "vault", wingId: "core", name: "Treasury", kind: "vault" },
  { id: "etsy-lab", wingId: "etsy", name: "Research Lab", kind: "lab" },
  { id: "etsy-studio", wingId: "etsy", name: "Design Studio", kind: "studio" },
  { id: "etsy-qc", wingId: "etsy", name: "Quality Control", kind: "qc" },
  { id: "etsy-factory", wingId: "etsy", name: "Product & Listing", kind: "factory", theme: "prints" },
  { id: "etsy-comms", wingId: "etsy", name: "Customer Care", kind: "comms" },
  { id: "expansion-1", wingId: "expansion", name: "Sealed", kind: "sealed" },
];

function agent(
  id: string,
  name: string,
  role: string,
  capability: AgentCapability,
  wingId: string,
  skills: string[],
  roomId: string,
  suit: string,
  visor: string,
): Agent {
  return { id, name, role, capability, wingId, skills, status: "idle", roomId, taskId: null, sprite: { suit, visor } };
}

export const agents: Agent[] = [
  agent("warden", "Warden", "Status reporter · code", "briefing", "core", ["brief"], "command", "#7d9974", "#e0f2fe"),
  agent("scout", "Scout", "Trend researcher", "research", "etsy", ["research", "research-test"], "etsy-lab", "#72945b", "#d8e7b9"),
  agent("muse", "Muse", "Product designer", "design", "etsy", ["design"], "etsy-studio", "#9e87a1", "#f3e8ff"),
  agent("muse-2", "Pixel", "Product designer", "design", "etsy", ["design"], "etsy-studio", "#b795a5", "#fae8ff"),
  agent("quill", "Quill", "Listing writer", "listing", "etsy", ["list"], "etsy-factory", "#b38c56", "#fef3c7"),
  agent("echo", "Echo", "Reply writer", "reply", "etsy", ["reply"], "etsy-comms", "#ad7e69", "#fee2e2"),
  agent("pip", "Pip", "Artwork file checker", "quality", "etsy", ["quality"], "etsy-qc", "#78a3a0", "#d6ebd9"),
  agent("relay", "Relay", "Approved publishing · code", "publish", "etsy", ["publish"], "dock", "#7da49c", "#ccfbf1"),
  agent("post", "Post", "Approved delivery · code", "send", "etsy", ["send"], "etsy-comms", "#8c9b8e", "#e2e8f0"),
  agent("keeper", "Keeper", "Accepted artwork archive · code", "artworkArchive", "etsy", ["accept-artwork"], "dock", "#8c9b8e", "#e2e8f0"),
];

export function initialState(): FacilityState {
  return {
    businessGoal: { monthlyNetProfitUsd: 10000, currency: "USD" },
    wings,
    rooms,
    agents: agents.map((a) => ({ ...a, skills: [...a.skills], sprite: { ...a.sprite } })),
    tasks: [],
    approvals: [],
    log: [
      { id: "log-boot", at: Date.now(), wingId: null, level: "success", text: "Facility initialized. Connections must be verified before work runs." },
    ],
    spend: { core: 0, etsy: 0, expansion: 0 },
    modelSpend: {},
    spendMonth: monthKey(Date.now()),
    completed: {},
    etsyPublishAttempts: [],
  };
}
