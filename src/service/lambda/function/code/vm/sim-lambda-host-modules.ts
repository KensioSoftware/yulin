import { createRequire } from "node:module";
import path from "node:path";

const hostRequire = createRequire(import.meta.url);

/**
 * Require from the host a module the real Lambda runtime provides without it
 * being bundled: a Node.js built-in, or an AWS SDK package.
 *
 * The SDK packages are installed by the consuming project, as the real
 * runtime provides them rather than this package. Requiring from this
 * module's context covers hoisted installs; the working-directory fallback
 * covers stricter package layouts.
 */
export function requireHostModule(specifier: string): unknown {
  try {
    return hostRequire(specifier);
  } catch {
    /* v8 ignore next 4 -- only reachable in consumer package layouts where
       this package's own require context cannot see the SDK packages. */
    return createRequire(path.join(process.cwd(), "package.json"))(specifier);
  }
}

/**
 * Whether an error is a Node.js module resolution failure, as opposed to an
 * error thrown while a resolved module initializes.
 */
export function isModuleNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "MODULE_NOT_FOUND" || error.code === "ERR_MODULE_NOT_FOUND")
  );
}
