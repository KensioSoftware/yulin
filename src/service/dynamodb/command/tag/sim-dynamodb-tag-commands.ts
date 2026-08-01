import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import { SimDynamoDbTagPage } from "./sim-dynamodb-tag-page.js";
import {
  reachSimDynamoDbTagResource,
  readSimDynamoDbTagKeys,
  readSimDynamoDbTags,
} from "./sim-dynamodb-tag-request.js";
import type {
  SimListTagsOfResourceCommand,
  SimListTagsOfResourceCommandOutput,
  SimTagResourceCommand,
  SimTagResourceCommandOutput,
  SimUntagResourceCommand,
  SimUntagResourceCommandOutput,
} from "./tag.command.js";

interface SimDynamoDbTagCommandsProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbTagCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that tag, untag and list the tags of a resource.
 *
 * All three name their resource by ARN, and all three reach it the same way, so
 * an ARN naming no table gives ResourceNotFoundException and an unauthorized
 * caller is refused before the lookup. Each authorizes the `dynamodb:` action of
 * its own name.
 */
export class SimDynamoDbTagCommands {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbTagCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Add tags to a resource, replacing the value of any key already there.
   *
   * The answer is empty, as DynamoDB's is, so ListTagsOfResource is how a
   * caller sees what this did.
   */
  tagResource(
    command: SimTagResourceCommand,
    options?: SimDynamoDbTagCommandsOptions,
  ): SimTagResourceCommandOutput {
    // The request is read before the resource is reached, so a request
    // DynamoDB would refuse is refused whether or not the table is there.
    const tags = readSimDynamoDbTags(command.input.Tags);
    const table = reachSimDynamoDbTagResource({
      access: this.access,
      action: "dynamodb:TagResource",
      resourceArn: command.input.ResourceArn,
      caller: options?.caller,
    });

    table.tags.apply(tags);

    return { $metadata: {} };
  }

  /**
   * Take tags off a resource.
   *
   * A key that is not there is not an error: the request asks for a resource
   * without that key, and that is what it gets either way.
   */
  untagResource(
    command: SimUntagResourceCommand,
    options?: SimDynamoDbTagCommandsOptions,
  ): SimUntagResourceCommandOutput {
    const keys = readSimDynamoDbTagKeys(command.input.TagKeys);
    const table = reachSimDynamoDbTagResource({
      access: this.access,
      action: "dynamodb:UntagResource",
      resourceArn: command.input.ResourceArn,
      caller: options?.caller,
    });

    table.tags.remove(keys);

    return { $metadata: {} };
  }

  /**
   * List the tags a resource holds, a page at a time.
   */
  listTagsOfResource(
    command: SimListTagsOfResourceCommand,
    options?: SimDynamoDbTagCommandsOptions,
  ): SimListTagsOfResourceCommandOutput {
    const table = reachSimDynamoDbTagResource({
      access: this.access,
      action: "dynamodb:ListTagsOfResource",
      resourceArn: command.input.ResourceArn,
      caller: options?.caller,
    });
    const page = new SimDynamoDbTagPage(
      table.tags.ordered(),
      command.input.NextToken,
    );
    const tags = page.tags.map((tag) => tag.toTag());

    // The token is left off the last page, rather than answered as undefined,
    // so a caller looping until it is gone terminates.
    if (page.nextToken === undefined) {
      return { Tags: tags, $metadata: {} };
    }

    return { Tags: tags, NextToken: page.nextToken, $metadata: {} };
  }
}
