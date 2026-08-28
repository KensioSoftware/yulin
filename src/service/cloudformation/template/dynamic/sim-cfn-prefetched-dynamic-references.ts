import type { SimCfnDynamicReferenceResolution } from "./sim-cfn-dynamic-reference.type.js";

/**
 * One reference, once the pass reading it ahead of resolution has answered.
 */
interface SimCfnPrefetchedDynamicReference {
  readonly key: string;
  readonly resolution: SimCfnDynamicReferenceResolution;
}

/**
 * The references of one property resolution that were read before it ran.
 *
 * A service that has to be waited on cannot answer while the properties
 * resolve, because resolution is synchronous, so properties holding a
 * reference are resolved twice. The first pass leaves every reference as the
 * template wrote it and keeps what the services answer here. The second finds
 * the answers waiting, so an `Fn::Split` over a reference splits the value
 * rather than something standing in for it.
 *
 * A read that failed is not kept. The resolution pass asks its service again,
 * and the failure reaches the Resource from there, which is what fails a
 * Resource holding a reference the deployment may not read.
 */
export class SimCfnPrefetchedDynamicReferences {
  private readonly answers = new Map<
    string,
    SimCfnDynamicReferenceResolution
  >();

  private reads:
    | Map<string, Promise<SimCfnDynamicReferenceResolution>>
    | undefined;

  /** Whether the pass running now is the one reading references ahead. */
  get isReading(): boolean {
    return this.reads !== undefined;
  }

  /**
   * What one reference was already answered with, where it was.
   */
  answerFor(key: string): SimCfnDynamicReferenceResolution | undefined {
    return this.answers.get(key);
  }

  /**
   * Whether the pass running now has already started reading one reference.
   *
   * A property holding the same reference twice would otherwise read it twice.
   */
  isHeld(key: string): boolean {
    return this.reads?.has(key) === true;
  }

  /**
   * Keep one reference's answer for the resolution pass to use.
   */
  hold(
    key: string,
    resolution:
      | SimCfnDynamicReferenceResolution
      | Promise<SimCfnDynamicReferenceResolution>,
  ): void {
    this.reads?.set(key, Promise.resolve(resolution));
  }

  /**
   * Run one pass over the properties, keeping what its references answer.
   *
   * Nothing the pass throws escapes. The resolution pass after it resolves the
   * same properties, and that is the pass whose failure the Resource reports.
   */
  async read(pass: () => void): Promise<void> {
    const reads = new Map<string, Promise<SimCfnDynamicReferenceResolution>>();
    this.reads = reads;

    try {
      pass();
    } catch {
      // The resolution pass after this one is the one that reports it.
    } finally {
      this.reads = undefined;
    }

    const answers = await Promise.all(
      reads
        .entries()
        .map(async ([key, read]) => await prefetchedReference(key, read)),
    );

    for (const answer of answers) {
      if (answer !== undefined) {
        this.answers.set(answer.key, answer.resolution);
      }
    }
  }
}

/**
 * What one read answered, or nothing where it failed.
 */
async function prefetchedReference(
  key: string,
  read: Promise<SimCfnDynamicReferenceResolution>,
): Promise<SimCfnPrefetchedDynamicReference | undefined> {
  try {
    return { key, resolution: await read };
  } catch {
    return undefined;
  }
}
