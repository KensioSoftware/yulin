import type { SimCfnStackDeploymentLifecycle } from "../deploy/sim-cfn-stack-deployment-lifecycle.js";
import type { SimCfnStackDeletionLifecycle } from "../teardown/sim-cfn-stack-deletion-lifecycle.js";
import type { SimCfnStackUpdateLifecycle } from "../update/sim-cfn-stack-update-lifecycle.js";
import type { SimCloudFormationStackStatus } from "../sim-cfn-stack.js";

interface SimCfnStackOperationStatusProperties {
  readonly deployment: SimCfnStackDeploymentLifecycle;
  readonly update: SimCfnStackUpdateLifecycle;
  readonly deletion: SimCfnStackDeletionLifecycle;
}

/**
 * Which of a Stack's operations its status and error are reported from.
 *
 * A Stack keeps the status the last operation left it with, so the deletion
 * answers first, then the update, and the deployment last: a Stack that was
 * never updated or deleted has only the status its deployment gave it. This is
 * the Stack-level shape of what SimCfnResource does per Resource.
 *
 * A deployment failure is not the reason a later update or deletion is in
 * progress, so the error comes from the same operation the status does.
 */
export class SimCfnStackOperationStatus {
  private readonly properties: SimCfnStackOperationStatusProperties;

  constructor(properties: SimCfnStackOperationStatusProperties) {
    this.properties = properties;
  }

  /** The externally visible Stack status. */
  public get status(): SimCloudFormationStackStatus {
    const { deployment, update, deletion } = this.properties;

    return deletion.status ?? update.status ?? deployment.status;
  }

  /** The error captured by the operation the status is reporting, if any. */
  public get error(): Error | undefined {
    const { deployment, update, deletion } = this.properties;

    if (deletion.status !== undefined) {
      return deletion.error;
    }

    if (update.status !== undefined) {
      return update.error;
    }

    return deployment.error;
  }
}
