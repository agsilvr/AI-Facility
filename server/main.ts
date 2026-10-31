import { rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qwenReady, runReader } from "./agents/reader";
import { Designs } from "./crew/designs";
import { LiveCrew } from "./crew/live";
import { Facility } from "./facility";
import { createFacilityServer } from "./http";
import { Store } from "./store";

// Settings come from environment variables so the macOS service file can set them.
const port = Number(process.env.FACILITY_PORT ?? 8787);
// Only this Mac can reach the facility unless FACILITY_HOST says otherwise.
const host = process.env.FACILITY_HOST ?? "127.0.0.1";
const dataDir = process.env.FACILITY_DATA_DIR ?? join(homedir(), "Library", "Application Support", "AI Facility");
const allowedHosts = ["localhost", "127.0.0.1", ...(process.env.FACILITY_ALLOWED_HOSTS ?? "").split(",").filter(Boolean)];
const here = fileURLToPath(new URL(".", import.meta.url));
const staticDir = process.env.FACILITY_STATIC_DIR ?? resolve(here, "..", "..", "dist");

const store = new Store(join(dataDir, "facility.db"));
// FACILITY_MODE=live puts the real crew to work; otherwise it's the labelled demo.
const live = process.env.FACILITY_MODE === "live";
const designs = new Designs(dataDir);
const facility = new Facility(
  store,
  live
    ? (ledger) =>
        new LiveCrew(ledger, {
          think: (model, req) => runReader({ ...req, model }, { audit: (e) => store.addAudit(e) }),
          designs,
          qwenReady: () => qwenReady(),
          shop: () => store.getSetting("shop_brief") ?? "",
          automaticProducts: () => store.getSetting("automatic_products") === "true",
          timezone: "America/New_York",
        })
    : undefined,
);
// An explicit deployment reset is applied exactly once. It archives unfinished
// work, preserves account settings and prevents the old placeholder queue refilling.
if (process.env.FACILITY_RESET_QUEUE_ID) {
  const reset = facility.resetQueue(process.env.FACILITY_RESET_QUEUE_ID, "Owner requested a fresh launch with new niche research and design.");
  if (!reset.alreadyApplied) {
    facility.ledger.createTask("etsy", "research-test", "Fresh niche comparison — launch reset");
    facility.save();
  }
}
facility.start();

// Until the owner sets an approval PIN, nothing can be approved. The first PIN
// needs a one-time link, kept in the data folder (which AI tools are denied)
// and opened for the owner by the installer. It's never printed to the log.
const setupFile = join(dataDir, "owner-setup-link.txt");
const setupCode = facility.owner.newSetupCode();
if (setupCode) {
  writeFileSync(setupFile, `http://localhost:${port}/?setup=${setupCode}\n`, { mode: 0o600 });
  console.log(`No approval PIN yet. The one-time link to set it is in ${setupFile}`);
} else {
  rmSync(setupFile, { force: true });
}

const server = createFacilityServer(facility, { staticDir, allowedHosts, designs });
server.listen(port, host, () => {
  console.log(`AI Facility running at http://${host === "127.0.0.1" ? "localhost" : host}:${port}`);
  console.log(`Data: ${dataDir}`);
});

function shutdown() {
  console.log("Shutting down; saving facility state.");
  facility.stop();
  store.close();
  server.close(() => process.exit(0));
  // Open event streams keep the server alive; don't wait on them forever.
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
