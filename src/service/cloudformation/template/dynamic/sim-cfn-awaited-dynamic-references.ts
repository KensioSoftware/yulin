import {
  simCfnDynamicReferenceMarking,
  simCfnDynamicReferencePlaceholder,
} from "./sim-cfn-dynamic-reference-placeholder.js";
import type { SimCfnDynamicReferenceResolution } from "./sim-cfn-dynamic-reference.type.js";

/**
 * One reference, once the service reading it has answered.
 *
 * The property the reference sat on is carried here rather than looked up
 * later. The path is only knowable while resolution is inside that property,
 * and by the time the service answers, resolution has moved on.
 */
export interface SimCfnSettledDynamicReference {
  readonly placeholder: string;
  readonly path: string;
  readonly resolution: SimCfnDynamicReferenceResolution;
}

interface SimCfnAwaitedDynamicReference {
  readonly placeholder: string;
  readonly path: string;
  readonly resolution: Promise<SimCfnDynamicReferenceResolution>;
}

/**
 * The references of one property resolution that a service is still reading.
 *
 * Each one is held behind a marker while the properties resolve around it. The
 * markers come back in the order the properties were resolved in, so a
 * template holding two references records them in the order it wrote them.
 */
export class SimCfnAwaitedDynamicReferences {
  private readonly awaited: SimCfnAwaitedDynamicReference[] = [];

  /**
   * What this resolution's markers are marked with.
   *
   * A marker is text in a resolved property until the service answers, so it
   * has to be one nothing else can produce. A property that was written to
   * look like a marker misses this marking and is left as it was written.
   */
  private readonly marking = simCfnDynamicReferenceMarking();

  /** Whether every reference was answered as the properties resolved. */
  get isEmpty(): boolean {
    return this.awaited.length === 0;
  }

  /**
   * Hold one reference, and take the marker standing in for it.
   */
  hold(
    resolution: Promise<SimCfnDynamicReferenceResolution>,
    path: string,
  ): string {
    const placeholder = simCfnDynamicReferencePlaceholder(
      this.marking,
      this.awaited.length,
    );

    this.awaited.push({ placeholder, path, resolution });

    return placeholder;
  }

  /**
   * Wait for every service to answer.
   */
  async settled(): Promise<readonly SimCfnSettledDynamicReference[]> {
    return await Promise.all(
      this.awaited.map(async (reference) => ({
        ...reference,
        resolution: await reference.resolution,
      })),
    );
  }
}
