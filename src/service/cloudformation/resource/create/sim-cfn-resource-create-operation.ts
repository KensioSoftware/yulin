import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { SimCfnResourceCreator } from "./sim-cfn-resource-creator.js";
import { simCfnInertResourceReason } from "../inert/sim-cfn-inert-resource.js";
import { isSimCfnUnsupportedResourceError } from "../unsupported/sim-cfn-unsupported-resource.js";
import { simCfnSkippedPhysicalName } from "../unsupported/sim-cfn-named-skip.js";

interface SimCfnResourceCreateOperationProperties<T extends object> {
  readonly background: BackgroundScheduler;
  readonly resource: SimCfnResource<T>;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Runs the asynchronous CloudFormation Resource creation lifecycle.
 *
 * This class owns the CloudFormation-facing operation concerns: scheduling the
 * create work in the background, moving the Resource through create states, and
 * translating thrown creation errors into Resource failure state.
 *
 * It does not know how to construct the underlying simulated AWS service
 * Resource. That responsibility belongs to {@link SimCfnResourceCreator}.
 */
export class SimCfnResourceCreateOperation<T extends object = object> {
  private readonly background: BackgroundScheduler;
  private readonly resource: SimCfnResource<T>;
  private readonly creator: SimCfnResourceCreator<T>;

  constructor(properties: SimCfnResourceCreateOperationProperties<T>) {
    this.background = properties.background;
    this.resource = properties.resource;
    this.creator = new SimCfnResourceCreator({
      resource: properties.resource,
      cfnResourceFactory: properties.cfnResourceFactory,
    });
  }

  /**
   * Start Resource creation as a background operation.
   *
   * The returned Promise resolves or rejects with the background creation work,
   * while the Resource itself is updated through CloudFormation create states:
   * in progress before scheduling, complete after the creator returns, or
   * failed if the creator or background sequence throws.
   */
  run(context: SimCloudFormationResourceCreateContext): Promise<void> {
    this.resource.markCreateInProgress();

    return new Promise<void>((resolve, reject) => {
      this.background.schedule(async () => {
        try {
          await this.background.sequence();

          const simResource = await this.creator.create(context);
          this.resource.markCreateComplete(simResource as T | undefined);
          resolve();
        } catch (error) {
          if (isSimCfnUnsupportedResourceError(error)) {
            this.recordUncreated(error, context);
            resolve();

            return;
          }

          const resourceError = this.resourceCreationError(error);

          this.resource.markCreateFailed(resourceError);
          reject(resourceError);
        }
      });
    });
  }

  /**
   * Record a Resource no factory would create.
   *
   * Asked after the refusal rather than before it, so a Resource a service can
   * create is still created whatever this would have said. That keeps the
   * decision to one of reporting: a Resource whose type is unsupported here is
   * a gap and is skipped, unless nothing this simulator models could have told
   * it apart from one that was created, in which case saying it is missing
   * sends a reader after something that is not lost.
   *
   * Either way the Resource keeps whatever name the refusal carried. A
   * template reading a Ref of it then gets the name real CloudFormation would
   * have produced.
   */
  private recordUncreated(
    error: unknown,
    context: SimCloudFormationResourceCreateContext,
  ): void {
    this.resource.recordUncreatedPhysicalName(simCfnSkippedPhysicalName(error));

    const inertReason = simCfnInertResourceReason(
      this.resource,
      context.resources,
    );

    if (inertReason !== undefined) {
      this.resource.markCreateInert(inertReason);

      return;
    }

    this.resource.markCreateSkipped(
      error instanceof Error ? error.message : String(error),
    );
  }

  private resourceCreationError(error: unknown): Error {
    const messagePrefix = `Sim CloudFormation Resource ${this.resource.logicalId} creation failed`;

    if (error instanceof Error) {
      error.message = `${messagePrefix}: ${error.message}`;

      return error;
    }

    return new Error(`${messagePrefix}: ${String(error)}`);
  }
}
