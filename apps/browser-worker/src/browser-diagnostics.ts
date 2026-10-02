export const MAX_MESSAGE_LENGTH = 300;
export const MAX_NAME_LENGTH = 64;
export const MAX_CODE_LENGTH = 64;

const HOST_PATH = /(\/home\/|\/root\/|\/Users\/|\/workspace\/|\/runner\/)[^\s]*/g;

export function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function stripControlCharacters(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    output += code < 0x20 || code === 0x7f ? " " : char;
  }
  return output;
}

/**
 * Bounds and sanitizes a Playwright/Chromium error message: strips control
 * characters and redacts host home/repository paths while preserving in-root
 * paths (/browser, /runtime, /app, /tmp, /dev, ...) needed for diagnosis.
 */
export function sanitizeDiagnosticMessage(message: string): string {
  return truncate(
    stripControlCharacters(message).replace(HOST_PATH, "$1<redacted>"),
    MAX_MESSAGE_LENGTH,
  );
}

export class BrowserRuntimeError extends Error {
  constructor(
    readonly stage: string,
    readonly errorClass: string,
    readonly errorCode: string,
    readonly causeMessage: string,
  ) {
    super("browser runtime failure");
    this.name = "BrowserRuntimeError";
  }
}

export function toBrowserRuntimeError(stage: string, error: unknown): BrowserRuntimeError {
  if (error instanceof Error) {
    return new BrowserRuntimeError(
      stage,
      truncate(error.name || "Error", MAX_NAME_LENGTH),
      truncate((error as NodeJS.ErrnoException).code ?? "", MAX_CODE_LENGTH),
      sanitizeDiagnosticMessage(error.message ?? ""),
    );
  }
  return new BrowserRuntimeError(stage, "Unknown", "", "");
}
