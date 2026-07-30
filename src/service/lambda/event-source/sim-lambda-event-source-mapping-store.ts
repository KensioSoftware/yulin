import { SimLambdaResourceNotFoundException } from "../error/sim-lambda.error.js";
import type { SimLambdaEventSourceMapping } from "./sim-lambda-event-source-mapping.js";

/**
 * What a listing of event source mappings is narrowed by.
 *
 * Both are optional and both apply, as they do on real Lambda: a request naming
 * neither lists every mapping in the Account and Region.
 */
export interface SimLambdaEventSourceMappingFilter {
  readonly eventSourceArn?: string | undefined;
  readonly functionName?: string | undefined;
}

/**
 * The event source mappings of one simulated Lambda scope.
 *
 * Mappings are keyed by their UUID because that is what addresses them: Get and
 * Delete name a mapping by UUID and nothing else, and a queue and a function can
 * have more than one mapping between them.
 */
export class SimLambdaEventSourceMappingStore {
  private readonly mappings = new Map<string, SimLambdaEventSourceMapping>();

  /**
   * Every mapping in this scope, in creation order.
   */
  get all(): readonly SimLambdaEventSourceMapping[] {
    return this.mappings.values().toArray();
  }

  /**
   * Store a newly created mapping.
   */
  add(mapping: SimLambdaEventSourceMapping): void {
    this.mappings.set(mapping.uuid, mapping);
  }

  /**
   * Find a mapping by UUID.
   */
  find(uuid: string): SimLambdaEventSourceMapping | undefined {
    return this.mappings.get(uuid);
  }

  /**
   * Resolve a mapping by UUID, or fail as real Lambda does.
   */
  require(uuid: string): SimLambdaEventSourceMapping {
    const found = this.find(uuid);

    if (found === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `The resource you requested does not exist: no event source mapping ` +
          `with UUID ${uuid}`,
      );
    }

    return found;
  }

  /**
   * The mappings matching a listing request.
   */
  matching(
    filter: SimLambdaEventSourceMappingFilter,
  ): readonly SimLambdaEventSourceMapping[] {
    return this.all.filter(
      (mapping) =>
        matches(filter.eventSourceArn, mapping.eventSourceArn) &&
        matches(filter.functionName, mapping.functionName),
    );
  }

  /**
   * Forget a deleted mapping.
   */
  remove(mapping: SimLambdaEventSourceMapping): void {
    this.mappings.delete(mapping.uuid);
  }
}

function matches(wanted: string | undefined, held: string): boolean {
  return wanted === undefined || wanted === held;
}
