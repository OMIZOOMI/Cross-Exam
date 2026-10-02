import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";

export class AccessDeniedError extends Error {
  constructor(
    readonly operation: string,
    readonly label: string,
    readonly code: string,
  ) {
    super(`${operation} ${label}: ${code}`);
    this.name = "AccessDeniedError";
  }
}

/**
 * Requires a filesystem path to be denied with an intentional error code.
 * Unexpected I/O errors and successful access both fail loudly; only the
 * allowed denial codes (ENOENT/EACCES/EPERM by default) count as denial.
 */
export async function expectDeniedPath(
  file: string,
  operation: string,
  label: string,
  allowedCodes: readonly string[] = ["ENOENT", "EACCES", "EPERM"],
): Promise<string> {
  try {
    await access(file, fsConstants.F_OK);
    throw new AccessDeniedError(operation, label, "ACCESS_SUCCEEDED");
  } catch (error) {
    if (error instanceof AccessDeniedError) throw error;
    const code = (error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    if (!allowedCodes.includes(code)) throw new AccessDeniedError(operation, label, code);
    return code;
  }
}
