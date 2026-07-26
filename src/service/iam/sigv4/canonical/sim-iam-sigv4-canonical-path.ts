import { escapeSigV4Uri } from "../sigv4-uri-escape.js";

/**
 * Build the canonical URI of a signed request.
 *
 * The path is normalized, dropping empty and `.` segments and resolving `..`,
 * and then encoded a second time. The already-encoded path arriving in the
 * request is the first encoding, which is why a literal `/` in a path segment
 * and a separator are still distinguishable here.
 *
 * S3 is the exception on real AWS: it signs the path singly encoded. Only
 * doubly encoded services are supported for now, which is every service the
 * simulator serves.
 */
export function simIamSigV4CanonicalPath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  const leadingSlash = path.startsWith("/") ? "/" : "";
  const trailingSlash = segments.length > 0 && path.endsWith("/") ? "/" : "";
  const normalized = `${leadingSlash}${segments.join("/")}${trailingSlash}`;

  return escapeSigV4Uri(normalized).replaceAll("%2F", "/");
}
