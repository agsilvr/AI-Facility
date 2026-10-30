import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Claude Code and Codex settings that fence in any AI working on this
// repository. These tests fail if a later change quietly loosens them.

const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
const deny: string[] = settings.permissions.deny;
const allow: string[] = settings.permissions.allow ?? [];

describe("Claude Code lockdown settings", () => {
  it("can't be switched into skip-all-permissions mode", () => {
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
    expect(settings.permissions.defaultMode).toBeUndefined();
  });

  it("pre-approves nothing", () => {
    expect(allow).toEqual([]);
    expect(settings.sandbox.autoAllowBashIfSandboxed).toBe(false);
    expect(settings.enableAllProjectMcpServers).toBe(false);
  });

  it("keeps file reads inside the facility folder", () => {
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
  });

  it.each(["sudo", "su", "security", "osascript", "ssh", "crontab", "tccutil", "dscl"])("never runs %s", (cmd) => {
    expect(deny).toContain(`Bash(${cmd}:*)`);
  });

  it.each(["~/.ssh/**", "~/Library/Keychains/**", "~/Library/Cookies/**", "~/Library/Safari/**", "./.env", "./data/**"])(
    "never reads %s",
    (path) => {
      expect(deny).toContain(`Read(${path})`);
    },
  );

  it("can't read the facility's database or PIN setup link, even from a shell command", () => {
    expect(settings.sandbox.filesystem.denyRead).toContain("./data");
  });

  it("can't edit its own rules or the facility's database", () => {
    expect(deny).toContain("Edit(./.claude/settings.json)");
    expect(deny).toContain("Edit(./data/**)");
    expect(settings.sandbox.filesystem.denyWrite).toEqual(expect.arrayContaining(["./.claude/settings.json", "./data"]));
  });

  it("sandboxes commands, with network limited to code downloads", () => {
    expect(settings.sandbox.enabled).toBe(true);
    expect(settings.sandbox.network.allowedDomains.sort()).toEqual(
      ["codeload.github.com", "github.com", "objects.githubusercontent.com", "registry.npmjs.org"].sort(),
    );
  });

  it("writes outside the folder only to the npm cache and the facility's own start-up file", () => {
    expect(settings.sandbox.filesystem.allowWrite).toEqual(["~/.npm", "~/Library/LaunchAgents/com.aifacility.server.plist"]);
  });
});

// Codex's file is TOML; its few settings are plain `key = value` lines.
const codex = readFileSync(new URL("../.codex/config.toml", import.meta.url), "utf8");
const codexSetting = (key: string) => codex.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1].trim();

describe("Codex lockdown settings", () => {
  it("writes only inside the facility folder and asks before anything more", () => {
    expect(codexSetting("sandbox_mode")).toBe('"workspace-write"');
    expect(codexSetting("approval_policy")).toBe('"on-request"');
  });

  it("has no network from its commands", () => {
    expect(codexSetting("network_access")).toBe("false");
  });

  it("gives its commands no keys or tokens", () => {
    expect(codexSetting("inherit")).toBe('"core"');
  });

  it("can't be widened from inside the file", () => {
    expect(codex).not.toMatch(/danger-full-access|"never"|mcp_servers|trust_level|default_permissions/);
  });
});
