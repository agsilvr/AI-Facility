import { useSyncExternalStore } from "react";
import type { RemoteFacility } from "../client/remote";

/** Re-render whenever the server sends a new snapshot or the connection changes. */
export function useFacility(facility: RemoteFacility) {
  return useSyncExternalStore(facility.subscribe, facility.getVersion);
}
