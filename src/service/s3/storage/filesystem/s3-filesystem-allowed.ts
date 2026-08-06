/**
 * What filesystem-backed simulated S3 storage will touch.
 *
 * The lists themselves, kept apart from the checks in
 * `s3-filesystem-safety.ts` that apply them: this file answers "what is
 * allowed" and that one answers "is this allowed", and only this one changes
 * when the web grows another file type.
 */

/**
 * Default directory names that are safe to use as filesystem storage roots.
 */
export const defaultAllowedDirectoryNames = [
  "assets",
  "build",
  "dist",
  "out",
  "public",
  "static",
  "www",
] as const;

/**
 * Write an extension the way `path.extname` reports one.
 *
 * A caller thinking about their own files says `.freq` or `freq` without
 * meaning anything by the difference, and gets the same answer either way.
 *
 * An empty one is refused rather than normalised. `path.extname` reports `.`
 * for a name ending in a dot, so normalising `""` to `.` would quietly turn a
 * stray entry in a mount's list into permission to serve `secret.` — which is
 * not something anybody asked for by passing an empty string.
 */
export function normaliseExtension(extension: string): string {
  const lowered = extension.trim().toLowerCase();

  if (lowered === "" || lowered === ".") {
    throw new Error(
      `Filesystem S3 storage file extension must not be empty. Got: ${JSON.stringify(
        extension,
      )}`,
    );
  }

  return lowered.startsWith(".") ? lowered : `.${lowered}`;
}

/**
 * Cautious list of allowed file extensions for simulated S3 objects. This is to
 * try and avoid reading or writing other files that might be unsafe.
 *
 * A mount adds to this rather than replacing it — see
 * `additionalFileExtensions` on the mount options. The list is long, general
 * and the reason the check is worth having, so a project needing one more
 * extension should not have to restate the other twenty-odd to get it, nor be
 * able to drop `.html` by forgetting it.
 */
export const defaultAllowedObjectFileExtensions = new Set([
  ".css",
  ".eot",
  ".gif",
  ".htm",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".otf",
  ".png",
  ".svg",
  ".ttc",
  ".ttf",
  ".txt",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);
