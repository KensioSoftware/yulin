import type {
  SimIamAccessKey,
  SimIamAccessKeyStatus,
} from "../../credential/sim-iam-access-key.js";
import {
  SimIamNoSuchEntity,
  SimIamValidationError,
} from "../../error/sim-iam.error.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import { simIamDefined, simIamRefuseWhen } from "../sim-iam-found.js";
import { simIamPage } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type { SimIamUserLookup } from "./sim-iam-user-lookup.js";
import type {
  SimAccessKeyCommand,
  SimListAccessKeysCommand,
  SimListAccessKeysCommandOutput,
  SimUpdateAccessKeyCommand,
} from "./sim-iam-user-read.command.js";

/**
 * The commands that list, deactivate and delete a User's access keys.
 *
 * Each names the calling User where it leaves UserName out.
 */
export class SimIamAccessKeyCommands {
  constructor(private readonly lookup: SimIamUserLookup) {}

  /**
   * List a User's access keys, without their secrets.
   */
  async listAccessKeys(
    command: SimListAccessKeysCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListAccessKeysCommandOutput> {
    const user = await this.lookup.user(
      "ListAccessKeys",
      command.input.UserName,
      options,
    );
    const { items, ...paging } = simIamPage(
      user.accessKeys.values().toArray(),
      (key) => key.accessKeyId,
      command.input,
    );

    return {
      AccessKeyMetadata: items.map((key) => ({
        UserName: user.userName,
        AccessKeyId: key.accessKeyId,
        Status: key.status,
        CreateDate: key.creationDate,
      })),
      ...paging,
    };
  }

  /**
   * Make an access key active or inactive. An inactive key authenticates
   * nothing until it is made active again.
   */
  async updateAccessKey(
    command: SimUpdateAccessKeyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const { Status } = command.input;

    simIamRefuseWhen(Status !== "Active" && Status !== "Inactive", () =>
      SimIamValidationError.member(
        "status",
        String(Status),
        "satisfy enum value set: [Active, Inactive]",
      ),
    );

    const { key } = await this.accessKey("UpdateAccessKey", command, options);
    key.status = Status as SimIamAccessKeyStatus;

    return {};
  }

  /**
   * Delete an access key, which stops authenticating at once.
   */
  async deleteAccessKey(
    command: SimAccessKeyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const { user, key } = await this.accessKey(
      "DeleteAccessKey",
      command,
      options,
    );
    // The registry keeps the key, so it fails the way an inactive key does.
    key.status = "Inactive";
    user.accessKeys.delete(key.accessKeyId);

    return {};
  }

  private async accessKey(
    action: string,
    command: SimAccessKeyCommand,
    options: SimIamRequestOptions | undefined,
  ): Promise<{ readonly user: SimIamUser; readonly key: SimIamAccessKey }> {
    const { UserName, AccessKeyId } = command.input;
    const accessKeyId = simIamRequired(AccessKeyId, "accessKeyId");
    const user = await this.lookup.user(action, UserName, options);
    const key = simIamDefined(
      user.accessKeys.get(accessKeyId),
      () =>
        new SimIamNoSuchEntity(
          `The Access Key with id ${accessKeyId} cannot be found.`,
        ),
    );

    return { user, key };
  }
}
