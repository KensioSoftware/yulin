import { randomBytes } from "node:crypto";

/**
 * How many times each function has been invoked in one chain of requests,
 * keyed by a short hash of the function.
 */
export type SimAwsLineage = ReadonlyMap<string, number>;

/**
 * An X-Ray trace header carrying a chain of requests in its `Lineage` field,
 * the way real Lambda writes one, as `<hash>:<count>` entries joined by `|`.
 */
export function simAwsTraceHeaderOf(lineage: SimAwsLineage): string {
  const root = `1-${randomBytes(4).toString("hex")}-${randomBytes(12).toString("hex")}`;
  const entries = lineage
    .entries()
    .map(([key, count]) => `${key}:${String(count)}`)
    .toArray();

  return `Root=${root};Sampled=0;Lineage=${entries.join("|")}`;
}

/**
 * The chains a set of trace headers carry, merged by taking each function's
 * highest count.
 */
export function simAwsLineageFromTraceHeaders(
  headers: readonly (string | undefined)[],
): SimAwsLineage {
  const merged = new Map<string, number>();

  for (const header of headers) {
    for (const [key, count] of lineageIn(header)) {
      merged.set(key, Math.max(count, merged.get(key) ?? 0));
    }
  }

  return merged;
}

function lineageIn(header: string | undefined): [string, number][] {
  const field = header
    ?.split(";")
    .find((part) => part.startsWith("Lineage="))
    ?.slice("Lineage=".length);

  return (field ?? "")
    .split("|")
    .map((entry) => entry.split(":"))
    .filter(([key, count]) => key !== "" && Number.isSafeInteger(Number(count)))
    .map(([key = "", count]) => [key, Number(count)]);
}
