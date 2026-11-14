import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";
import { simIamFound } from "../sim-iam-found.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type { SimIamEmptyOutput } from "./sim-iam-entity-policy.command.js";

/**
 * A Role or a User, as far as carrying a permissions boundary goes.
 */
interface SimIamBoundaryHolder {
  permissionsBoundaryArn?: SimArn | undefined;
}

interface SimIamBoundaryCommandsProperties {
  readonly kind: "Role" | "User";
  readonly identity: SimIamIdentityAuthorizer;
  readonly find: (name: string) => SimIamBoundaryHolder | undefined;
  readonly background: BackgroundScheduler;
}

/**
 * The commands that put a permissions boundary on a Role or a User after it
 * is created, or take it off: `PutRolePermissionsBoundary` and the rest.
 *
 * The boundary caps what the entity's identity policies allow from the next
 * request on. A boundary being put is tested as `iam:PermissionsBoundary`.
 */
export class SimIamBoundaryCommands {
  constructor(private readonly properties: SimIamBoundaryCommandsProperties) {}

  /**
   * Set or replace the entity's permissions boundary.
   */
  async put(
    name: string | undefined,
    permissionsBoundary: string | undefined,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const boundary = simIamRequired(
      permissionsBoundary,
      "permissionsBoundary",
    ) as SimArn;
    const holder = await this.holder("Put", name, options, {
      "iam:PermissionsBoundary": boundary,
    });
    holder.permissionsBoundaryArn = boundary;

    return {};
  }

  /**
   * Remove the entity's permissions boundary.
   */
  async delete(
    name: string | undefined,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const holder = await this.holder("Delete", name, options);
    holder.permissionsBoundaryArn = undefined;

    return {};
  }

  private async holder(
    verb: string,
    name: string | undefined,
    options: SimIamRequestOptions | undefined,
    conditions: Readonly<Record<string, string>> = {},
  ): Promise<SimIamBoundaryHolder> {
    const { kind, identity, find, background } = this.properties;
    const lower = kind.toLowerCase();
    const required = simIamRequired(name, `${lower}Name`);
    const action = `iam:${verb}${kind}PermissionsBoundary`;
    identity.authorize(action, required, options, conditions);
    await background.sequence();

    return simIamFound(find(required), lower, required);
  }
}
