import type { ActionId, Agent, AgentCapability, DataClass, Job, Stage, Wing } from "./types";

type Capability =
  | { job: Job; data: readonly DataClass[]; purposes: readonly string[] }
  | { action: ActionId }
  | { code: "quality" | "brief" };

// These are authority, unlike the agent's display name or its stage skills.
// Drafting and delivery never share a profile. New powers require a code change.
const CAPABILITIES: Record<AgentCapability, Capability> = {
  research: { job: "research", data: ["public", "shop"], purposes: ["etsy-research", "public-research-test"] },
  design: { job: "design", data: ["public", "shop"], purposes: [] },
  listing: { job: "write", data: ["public", "shop"], purposes: ["etsy-listing"] },
  reply: { job: "write", data: ["customer"], purposes: ["etsy-reply"] },
  briefing: { code: "brief" },
  publish: { action: "etsy.publishListing" },
  send: { action: "etsy.sendReply" },
  quality: { code: "quality" },
  artworkArchive: { action: "internal.acceptArtwork" },
};

function capabilityOf(agent: Agent): Capability | undefined {
  return Object.hasOwn(CAPABILITIES, agent.capability) ? CAPABILITIES[agent.capability] : undefined;
}

/** Deny by default, including unknown profiles, wildcard skills and mixed AI/action stages. */
export function canWorkStage(agent: Agent, wingId: string, stage: Stage): boolean {
  if (agent.wingId !== wingId || !agent.skills.includes(stage.id)) return false;
  const capability = capabilityOf(agent);
  if (!capability) return false;
  if ("code" in capability) return stage.id === capability.code && stage.executor === "code" && !stage.action && !stage.job && !stage.data;
  if ("action" in capability) {
    return stage.action === capability.action && !stage.job && !stage.data && !stage.needsApproval;
  }
  return !stage.action && stage.job === capability.job && stage.data !== undefined && capability.data.includes(stage.data);
}

/** Also fence the reader request: a valid assignment cannot borrow another role's prompt. */
export function canReadFor(agent: Agent, purpose: string): boolean {
  const capability = capabilityOf(agent);
  return !!capability && "job" in capability && capability.purposes.includes(purpose);
}

export function agentViolations(wings: Wing[], agents: Agent[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const agent of agents) {
    if (ids.has(agent.id)) problems.push(`${agent.id}: duplicate agent id`);
    ids.add(agent.id);
    if (!capabilityOf(agent)) problems.push(`${agent.id}: unknown capability`);
    if (!agent.skills.length) problems.push(`${agent.id}: no stage skills declared`);
    for (const skill of agent.skills) {
      const stages = wings.find((w) => w.id === agent.wingId)?.workflows.flatMap((wf) => wf.stages.filter((s) => s.id === skill)) ?? [];
      if (!stages.length || stages.some((stage) => !canWorkStage(agent, agent.wingId, stage))) {
        problems.push(`${agent.id}: stage "${skill}" is outside its capability or wing`);
      }
    }
  }
  for (const wing of wings) {
    for (const wf of wing.workflows) {
      for (const stage of wf.stages) {
        if (!agents.some((agent) => canWorkStage(agent, wing.id, stage))) {
          problems.push(`${wing.id}/${wf.id}/${stage.id}: no authorized agent`);
        }
      }
    }
  }
  return problems;
}

export function assertSafeAgents(wings: Wing[], agents: Agent[]) {
  const problems = agentViolations(wings, agents);
  if (problems.length) throw new Error(`Unsafe agent configuration:\n${problems.join("\n")}`);
}
