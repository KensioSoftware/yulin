import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../iam/error/sim-iam-caller-identifier.js";
import { SimBackupAccessDeniedException } from "../error/sim-backup.error.js";
import type { SimBackupRequestOptions } from "./sim-backup-request-options.js";

/**
 *
 */
export class SimBackupAuthorizer {
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(private readonly iam: SimIamInterServiceAuthZ) {}

  authorize(
    action: string,
    resource: string,
    options?: SimBackupRequestOptions,
  ): void {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options?.caller,
    });

    if (decision.isDenied) {
      const caller = this.callerIdentifier.format(decision.caller.principal);

      throw new SimBackupAccessDeniedException(
        `User: ${caller} is not authorized to perform: ${action} on ` +
          `resource: ${resource}`,
      );
    }
  }
}
