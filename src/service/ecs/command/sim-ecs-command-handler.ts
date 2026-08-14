import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimEcsAuthorizer } from "./authorize/sim-ecs-authorizer.js";
import { SimEcsUnsimulatedInput } from "./sim-ecs-unsimulated-input.js";

interface SimEcsHandlerCollaborators {
  readonly authorizer: SimEcsAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * What every simulated ECS command handler starts by doing.
 *
 * Each operation refuses the inputs it does not hold, waits at the simulator's
 * sequencing point, and authorizes the caller. Those are the same three steps
 * in each of them, in that order, so they are here rather than written out
 * nine times.
 */
export abstract class SimEcsCommandHandler {
  protected readonly authorizer: SimEcsAuthorizer;
  protected readonly background: BackgroundScheduler;

  private readonly unsimulated: SimEcsUnsimulatedInput;
  private readonly accepted: readonly string[];

  constructor(
    collaborators: SimEcsHandlerCollaborators,
    operation: string,
    accepted: readonly string[],
  ) {
    this.authorizer = collaborators.authorizer;
    this.background = collaborators.background;
    this.unsimulated = new SimEcsUnsimulatedInput(operation);
    this.accepted = accepted;
  }

  /**
   * Refuse anything the request declared that this operation does not hold.
   */
  protected refuseUnaccepted(input: object): void {
    this.unsimulated.refuseUnaccepted(input, this.accepted);
  }

  /**
   * Wait at the simulator's sequencing point.
   *
   * This allows for potential non-deterministic sequencing of async events. It
   * comes after a request has been read and before anything is authorized or
   * stored, so a malformed request is refused whatever else is in flight.
   */
  protected async sequence(): Promise<void> {
    await this.background.sequence();
  }
}
