import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { SimCfnResourceCreator } from "./sim-cfn-resource-creator.js";

interface SimCfnResourceCreateOperationProps<T extends object> {
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

  constructor(props: SimCfnResourceCreateOperationProps<T>) {
    this.background = props.background;
    this.resource = props.resource;
    this.creator = new SimCfnResourceCreator({
      resource: props.resource,
      cfnResourceFactory: props.cfnResourceFactory,
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
          if (this.isUnsupportedResourceError(error)) {
            const reason =
              error instanceof Error ? error.message : String(error);

            this.resource.markCreateSkipped(reason);
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

  private isUnsupportedResourceError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes("Unsupported sim") &&
      error.message.includes("CloudFormation")
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
