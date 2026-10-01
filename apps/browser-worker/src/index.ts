import {
  BrowserIsolationUnavailableError,
  browserIsolationStatus,
  ISOLATION_UNAVAILABLE,
} from "./isolation";

export type { BrowserIsolationCapability } from "./isolation";
export { BrowserIsolationUnavailableError, browserIsolationStatus, ISOLATION_UNAVAILABLE };

/**
 * Public browser launches fail closed until an independently enforced isolation
 * backend implements every capability reported by browserIsolationStatus.
 */
export async function launchBrowserWorker(): Promise<never> {
  throw new BrowserIsolationUnavailableError();
}
