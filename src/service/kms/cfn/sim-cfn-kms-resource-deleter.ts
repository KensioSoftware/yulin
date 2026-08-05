import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimKms } from "../sim-kms.js";
import type { SimKmsKey } from "../key/sim-kms-key.js";
import type { SimKmsAlias } from "../key/sim-kms-alias.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnKmsResourceDeleterProperties {
  readonly kms: SimKms;
}

/**
 * Deletes the simulated KMS resources a CloudFormation Stack created.
 *
 * KMS has no DeleteKey. A key is scheduled for deletion and sits in
 * `PendingDeletion` until the window runs out, so that is what a Stack deletion
 * leaves behind: a key that is still there and can no longer be used. Anything
 * expecting the key to be gone is expecting something KMS does not do.
 */
export class SimCfnKmsResourceDeleter {
  private readonly kms: SimKms;

  constructor(properties: SimCfnKmsResourceDeleterProperties) {
    this.kms = properties.kms;
  }

  /**
   * Delete a simulated KMS resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Key": {
        const key = resource.simResource as SimKmsKey | undefined;
        assertDefined(
          key,
          `sim KMS Key for CloudFormation Resource ${resource.logicalId}`,
        );

        await this.kms.scheduleKeyDeletion({ input: { KeyId: key.keyId } });

        return;
      }
      case "Alias": {
        const alias = resource.simResource as SimKmsAlias | undefined;
        assertDefined(
          alias,
          `sim KMS Alias for CloudFormation Resource ${resource.logicalId}`,
        );

        await this.kms.deleteAlias({
          input: { AliasName: alias.aliasName },
        });

        return;
      }
      default: {
        throw new Error(
          `Unsupported sim KMS CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }
}
