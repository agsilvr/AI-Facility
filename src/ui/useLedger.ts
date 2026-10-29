import { useSyncExternalStore } from "react";
import type { Ledger } from "../core/ledger";

export function useLedger(ledger: Ledger) {
  return useSyncExternalStore(ledger.subscribe, ledger.getState);
}
