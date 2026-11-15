import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import { SimEventBridgeResourceNotFoundException } from "../../error/sim-event-bridge.error.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import { simIamTagKeyConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimAwsResourceTags } from "../../../aws/tag/sim-aws-resource-tags.js";
import type { SimEventBridgeAuthorizer } from "../authorize/sim-event-bridge-authorizer.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import { simEventBridgeRequestTags } from "./sim-event-bridge-request-tags.js";
import { simEventBridgeTagsOf } from "./sim-event-bridge-tagged-resource.js";
import type {
  SimEventBridgeListTagsForResourceCommand,
  SimEventBridgeListTagsForResourceCommandOutput,
  SimEventBridgeTagResourceCommand,
  SimEventBridgeTagResourceCommandOutput,
  SimEventBridgeUntagResourceCommand,
  SimEventBridgeUntagResourceCommandOutput,
} from "./tag.command.js";

interface SimEventBridgeTagCommandsProperties {
  readonly buses: SimEventBusStore;
  readonly rules: SimEventRuleStore;
  readonly authorizer: SimEventBridgeAuthorizer;
}

/**
 * The commands that tag a rule or event bus, take tags off it and list them.
 *
 * A request names the resource by its ARN. The caller is authorized against
 * that ARN before the resource is looked up.
 */
export class SimEventBridgeTagCommands {
  private readonly buses: SimEventBusStore;
  private readonly rules: SimEventRuleStore;
  private readonly authorizer: SimEventBridgeAuthorizer;

  constructor(properties: SimEventBridgeTagCommandsProperties) {
    this.buses = properties.buses;
    this.rules = properties.rules;
    this.authorizer = properties.authorizer;
  }

  /**
   * Add tags to a rule or bus, replacing the value of any key it holds.
   */
  tagResource(
    command: SimEventBridgeTagResourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimEventBridgeTagResourceCommandOutput {
    const request = simEventBridgeRequestTags(
      command.input.Tags,
      options,
      "events:TagResource",
    );

    this.tagsOf(
      "events:TagResource",
      command.input.ResourceARN,
      request.options,
    ).apply(request.tags);

    return { $metadata: {} };
  }

  /**
   * Take the keys a request names off a rule or bus.
   */
  untagResource(
    command: SimEventBridgeUntagResourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimEventBridgeUntagResourceCommandOutput {
    const keys = command.input.TagKeys ?? [];

    this.tagsOf("events:UntagResource", command.input.ResourceARN, {
      ...options,
      requestConditions: simIamTagKeyConditions(keys),
    }).remove(keys);

    return { $metadata: {} };
  }

  /**
   * The tags a rule or bus holds.
   */
  listTagsForResource(
    command: SimEventBridgeListTagsForResourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimEventBridgeListTagsForResourceCommandOutput {
    const tags = this.tagsOf(
      "events:ListTagsForResource",
      command.input.ResourceARN,
      options,
    );

    return { $metadata: {}, Tags: tags.list() };
  }

  private tagsOf(
    action: string,
    arn: string | undefined,
    options: SimEventBridgeRequestOptions | undefined,
  ): SimAwsResourceTags {
    const resource = arn ?? "";

    this.authorizer.authorizeBus(action, resource, options);

    const tags = simEventBridgeTagsOf(this.buses, this.rules, resource);

    if (tags === undefined) {
      throw new SimEventBridgeResourceNotFoundException(
        `Resource ${resource} does not exist.`,
      );
    }

    return tags;
  }
}
