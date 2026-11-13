import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";

/**
 * How many times each function has been invoked in one chain of requests,
 * keyed by a short hash of the function.
 */
export type SimAwsLineage = ReadonlyMap<string, number>;

interface SimAwsLineageStore {
  /** The chain the running invocation is part of. */
  readonly current?: SimAwsLineage | undefined;

  /** The chain the next invocation starts from, where a hop said so. */
  readonly incoming?: SimAwsLineage | undefined;
}

const storage = new AsyncLocalStorage<SimAwsLineageStore>();
const noLineage: SimAwsLineage = new Map();

/**
 * The most times one function runs in one chain of requests before real
 * Lambda stops the next invocation.
 */
export const simAwsLineageLimit = 16;

/**
 * The chain of requests an invocation belongs to, which real Lambda tracks in
 * the `Lineage` field of the X-Ray trace header to stop recursive loops.
 *
 * The chain travels with Node.js asynchronous context tracking. Whatever a
 * handler does, and the simulated work it starts, runs inside its context, so
 * a function invoking another directly, or an SNS or S3 delivery its write
 * schedules, carries the chain on. A queue holds a message for later and
 * mixes messages of different chains in one batch, so a message carries its
 * chain in its `AWSTraceHeader` instead, as on AWS.
 */
export const simAwsLineage = {
  /**
   * Run an invocation of a function as one more step of its chain, or refuse
   * it once the function has run as often as a chain allows.
   */
  async invoking<T>(
    functionKey: string,
    refuse: (() => never) | undefined,
    invocation: () => Promise<T>,
  ): Promise<T> {
    const store = storage.getStore();
    const base = store?.incoming ?? store?.current ?? noLineage;
    const key = hashOf(functionKey);
    const count = (base.get(key) ?? 0) + 1;

    if (count > simAwsLineageLimit) {
      refuse?.();
    }

    const current = new Map(base).set(key, count);

    return await storage.run({ current }, invocation);
  },

  /**
   * Run a delivery as part of the chain a message carried, or of none.
   */
  async passing<T>(
    lineage: SimAwsLineage | undefined,
    delivery: () => Promise<T>,
  ): Promise<T> {
    return await storage.run({ incoming: lineage ?? noLineage }, delivery);
  },

  /**
   * The chain running now, for a hop that carries it on later.
   */
  current(): SimAwsLineage | undefined {
    const store = storage.getStore();

    return store?.incoming ?? store?.current;
  },

  /**
   * The X-Ray trace header a write made now carries, holding the chain it is
   * part of, or nothing outside an invocation.
   */
  traceHeader(): string | undefined {
    const lineage = storage.getStore()?.current;

    if (lineage === undefined) {
      return undefined;
    }

    const root = `1-${randomBytes(4).toString("hex")}-${randomBytes(12).toString("hex")}`;
    const entries = lineage
      .entries()
      .map(([key, count]) => `${key}:${String(count)}`)
      .toArray();

    return `Root=${root};Sampled=0;Lineage=${entries.join("|")}`;
  },

  /**
   * The chains a set of trace headers carry, merged by taking each function's
   * highest count.
   */
  fromTraceHeaders(headers: readonly (string | undefined)[]): SimAwsLineage {
    const merged = new Map<string, number>();

    for (const header of headers) {
      for (const [key, count] of lineageIn(header)) {
        merged.set(key, Math.max(count, merged.get(key) ?? 0));
      }
    }

    return merged;
  },
};

function hashOf(functionKey: string): string {
  return createHash("sha256").update(functionKey).digest("hex").slice(0, 8);
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
