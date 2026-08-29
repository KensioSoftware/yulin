/**
 * What an Origin's `Cache-Control` header says about holding the object at an
 * edge.
 *
 * Only the directives that move CloudFront's own cache duration are read.
 * `stale-while-revalidate` and `stale-if-error` are left out, because serving
 * a stale object is a behaviour of its own that this simulation does not have.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
 */
export interface SimCfCacheControl {
  /**
   * Whether the Origin asked for the object to stay out of a shared cache,
   * through `no-store`, `no-cache` or `private`.
   */
  readonly uncacheable: boolean;

  /** The seconds `s-maxage` names, where it names a usable number of them. */
  readonly sharedMaxAgeSec: number | undefined;

  /** The seconds `max-age` names, where it names a usable number of them. */
  readonly maxAgeSec: number | undefined;
}

/**
 * The three directives CloudFront and a browser both respect as a refusal.
 */
const uncacheableDirectives = ["no-store", "no-cache", "private"];

/**
 * Read the `Cache-Control` directives a response carries.
 *
 * A directive naming something other than a whole number of seconds is read as
 * absent. `max-age=soon` falls through to whatever the response says next.
 */
export function simCfCacheControl(header: string | null): SimCfCacheControl {
  const directives = cacheControlDirectives(header);

  return {
    uncacheable: uncacheableDirectives.some((directive) =>
      directives.has(directive),
    ),
    sharedMaxAgeSec: directiveSeconds(directives.get("s-maxage")),
    maxAgeSec: directiveSeconds(directives.get("max-age")),
  };
}

/**
 * Split a header into its directives, by lower-cased name.
 *
 * A directive carrying no value is held under an empty string, which is what
 * makes `no-store` findable the same way as `max-age=60`.
 */
function cacheControlDirectives(header: string | null): Map<string, string> {
  const directives = new Map<string, string>();
  const parts = (header ?? "").split(",");

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.length === 0) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    const name =
      separator === -1 ? trimmed : trimmed.slice(0, Math.max(0, separator));

    directives.set(
      name.trim().toLowerCase(),
      separator === -1 ? "" : trimmed.slice(separator + 1).trim(),
    );
  }

  return directives;
}

/**
 * The seconds a directive's value names, or none where it names no whole
 * number of them.
 */
function directiveSeconds(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const seconds = value.replace(/^"(.*)"$/, "$1");

  return /^\d+$/.test(seconds) ? Number(seconds) : undefined;
}
