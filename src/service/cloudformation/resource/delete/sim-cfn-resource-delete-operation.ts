import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimCfnResource } from "../sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../sim-cfn-resource.type.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { SimCfnResourceDeleter } from "./sim-cfn-resource-deleter.js";
import { SimCfnResourceRetention } from "./sim-cfn-resource-retention.js";
import { isSimCfnUnsupportedResourceError } from "../unsupported/sim-cfn-unsupported-resource.js";

interface SimCfnResourceDeleteOperationProperties<T extends object> {
  readonly background: BackgroundScheduler;
  readonly resource: SimCfnResource<T>;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Runs the asynchronous CloudFormation Resource deletion lifecycle.
 *
 * The mirror image of `SimCfnResourceCreateOperation`: it schedules the
 * delete work in the background, moves the Resource through delete states, and
 * turns a thrown failure into Resource failure state.
 *
 * It does not know how to remove the underlying simulated AWS service Resource.
 * That responsibility belongs to {@link SimCfnResourceDeleter}.
 */
export class SimCfnResourceDeleteOperation<T extends object = object> {
  private readonly background: BackgroundScheduler;
  private readonly resource: SimCfnResource<T>;
  private readonly deleter: SimCfnResourceDeleter<T>;

  constructor(properties: SimCfnResourceDeleteOperationProperties<T>) {
    this.background = properties.background;
    this.resource = properties.resource;
    this.deleter = new SimCfnResourceDeleter({
      resource: properties.resource,
      cfnResourceFactory: properties.cfnResourceFactory,
    });
  }

  /**
   * Start Resource deletion as a background operation.
   *
   * The returned Promise resolves or rejects with the background delete work,
   * while the Resource itself is updated through CloudFormation delete states:
   * in progress before scheduling, complete after the deleter returns, skipped
   * if nothing can delete the Resource type, or failed if the deleter throws.
   *
   * A Resource the operation's retention keeps never reaches the deleter at
   * all. CloudFormation leaves it where it is and reports it as DELETE_SKIPPED,
   * so the Stack can finish deleting around it.
   */
  run(context: SimCloudFormationResourceDeleteContext): Promise<void> {
    const retention = context.retention ?? new SimCfnResourceRetention();

    if (retention.retains(this.resource)) {
      this.resource.markDeleteRetained();

      return Promise.resolve();
    }

    this.resource.markDeleteInProgress();

    return new Promise<void>((resolve, reject) => {
      this.background.schedule(async () => {
        try {
          await this.background.sequence();

          await this.deleter.delete(context);
          this.resource.markDeleteComplete();
          resolve();
        } catch (error) {
          if (isSimCfnUnsupportedResourceError(error)) {
            const reason =
              error instanceof Error ? error.message : String(error);

            this.resource.markDeleteSkipped(reason);
            resolve();

            return;
          }

          const resourceError = this.resourceDeletionError(error);

          this.resource.markDeleteFailed(resourceError);
          reject(resourceError);
        }
      });
    });
  }

  private resourceDeletionError(error: unknown): Error {
    const messagePrefix = `Sim CloudFormation Resource ${this.resource.logicalId} deletion failed`;

    if (error instanceof Error) {
      error.message = `${messagePrefix}: ${error.message}`;

      return error;
    }

    return new Error(`${messagePrefix}: ${String(error)}`);
  }
}
