import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type { SimIamTagsInput } from "../../tag/sim-iam-identity-tags.js";
import {
  simIamRequestTagConditions,
  simIamTagKeyConditions,
} from "../../tag/sim-iam-tag-conditions.js";
import type {
  SimIamAuthorizedIdentity,
  SimIamIdentityAuthorizer,
} from "../../tag/sim-iam-identity-authorizer.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type {
  SimIamListTagsCommandOutput,
  SimIamTaggingCommandOutput,
} from "./sim-iam-tag.command.js";

/**
 * Handles the commands that tag, untag and list the tags of one kind of
 * identity, Roles or Users.
 *
 * Each authorizes against the entity's current tags as `iam:ResourceTag/`,
 * and a request setting tags carries them as `aws:RequestTag/` with their
 * keys as `aws:TagKeys`. A policy can then confine who tags what, and with
 * which keys.
 */
export class SimIamTagCommandHandlers {
  constructor(
    private readonly entity: "Role" | "User",
    private readonly identity: SimIamIdentityAuthorizer,
    private readonly background: BackgroundScheduler,
  ) {}

  /**
   * Set tags on a Role or a User.
   */
  async tag(
    name: string | undefined,
    tags: SimIamTagsInput,
    options?: SimIamRequestOptions,
  ): Promise<SimIamTaggingCommandOutput> {
    const tagged = await this.authorized(
      `iam:Tag${this.entity}`,
      name,
      options,
      simIamRequestTagConditions(tags),
    );

    tagged.tags.set(tags ?? [], this.entity);

    return {};
  }

  /**
   * Remove tags from a Role or a User.
   */
  async untag(
    name: string | undefined,
    keys: readonly string[] | undefined,
    options?: SimIamRequestOptions,
  ): Promise<SimIamTaggingCommandOutput> {
    const tagged = await this.authorized(
      `iam:Untag${this.entity}`,
      name,
      options,
      simIamTagKeyConditions(keys),
    );

    tagged.tags.remove(keys ?? []);

    return {};
  }

  /**
   * List the tags of a Role or a User.
   */
  async list(
    name: string | undefined,
    options?: SimIamRequestOptions,
  ): Promise<SimIamListTagsCommandOutput> {
    const tagged = await this.authorized(
      `iam:List${this.entity}Tags`,
      name,
      options,
    );

    return { Tags: tagged.tags.all, IsTruncated: false };
  }

  /**
   * Authorize one action on a named entity and return the entity.
   *
   * IAM authorizes before it looks the entity up, so a caller denied the
   * action learns nothing about whether the entity exists. A request naming
   * no entity finds none.
   */
  private async authorized(
    action: string,
    name: string | undefined,
    options: SimIamRequestOptions | undefined,
    conditions = {},
  ): Promise<SimIamAuthorizedIdentity> {
    this.identity.authorize(action, name, options, conditions);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const tagged = this.identity.find(name ?? "");

    if (tagged === undefined) {
      throw new SimIamNoSuchEntity(
        `The ${this.entity.toLowerCase()} with name ${name} cannot be found.`,
      );
    }

    return tagged;
  }
}
