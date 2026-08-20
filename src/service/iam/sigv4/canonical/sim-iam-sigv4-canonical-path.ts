import { escapeSigV4Uri } from "../sigv4-uri-escape.js";

/**
 * The signing services that sign a path encoded once, as it arrived.
 *
 * SigV4 encodes the canonical path a second time, and real S3 is the exception
 * to that. The name comes from the credential scope the request was signed
 * under. The client picked its own rule from that same scope. Any further
 * exception is one more entry here.
 */
const singlyEncodedServices = new Set(["s3"]);

/**
 * Build the canonical URI of a signed request.
 *
 * The path is normalized, dropping empty and `.` segments and resolving `..`,
 * and then encoded a second time. The already-encoded path arriving in the
 * request is the first encoding, which is why a literal `/` in a path segment
 * and a separator are still distinguishable here.
 *
 * A request signed for S3 gets neither step, and is signed over the path it
 * arrived with. An Object key holds any byte S3 accepts (a space, an
 * ampersand, a `.` segment, a doubled slash), and the path naming it survives
 * to the signature untouched.
 */
export function simIamSigV4CanonicalPath(
  path: string,
  serviceName: string,
): string {
  if (singlyEncodedServices.has(serviceName)) {
    return path.length === 0 ? "/" : path;
  }

  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
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
