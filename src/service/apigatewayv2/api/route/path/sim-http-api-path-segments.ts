/**
 * Split a URL path into the segments route matching works through.
 *
 * A leading slash produces no segment, so `/pets/dog` is `pets` then `dog`,
 * and `/` is no segments at all. One trailing slash is dropped, so `/pets/`
 * and `/pets` are the same path. That last part is observed rather than
 * documented: real API Gateway matches both to the same route.
 */
export function simHttpApiPathSegments(path: string): string[] {
  // The leading slash is taken off rather than tested for: a URL pathname
  // always has one, and a route key path without one is refused before this
  // is reached.
  const segments = path.slice(1).split("/");

  if (segments.at(-1) === "") {
    segments.pop();
  }

  return segments;
}
