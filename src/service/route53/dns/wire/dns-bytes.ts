/**
 * Join byte runs into one contiguous message section.
 *
 * DNS messages are assembled from small independently-encoded pieces — a
 * header, a question, then each resource record — so this is the seam where
 * they become a single datagram.
 */
export function concatenateBytes(runs: readonly Uint8Array[]): Uint8Array {
  const totalLength = runs.reduce((total, run) => total + run.length, 0);
  const joined = new Uint8Array(totalLength);
  let offset = 0;

  for (const run of runs) {
    joined.set(run, offset);
    offset += run.length;
  }

  return joined;
}
