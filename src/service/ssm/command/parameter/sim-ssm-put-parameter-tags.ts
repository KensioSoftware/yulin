import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  type SimAwsTagInput,
  simAwsTagPairs,
} from "../../../aws/tag/sim-aws-resource-tags.js";
import { simIamRequestTagRecordConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type { SimPutParameterCommandInput } from "./parameter.command.js";

/**
 * What an authorized PutParameter request may go on to write.
 */
interface SimSsmAuthorizedPut {
  readonly caller: SimAwsResolvedCaller;
  readonly tags: SimAwsTagInput;
}

/**
 * Authorize a PutParameter request, and read the tags it creates its
 * parameter with.
 *
 * A request carrying tags may not overwrite. Tags on an existing parameter
 * change through AddTagsToResource and RemoveTagsFromResource. A request
 * carrying tags needs `ssm:AddTagsToResource` as well as `ssm:PutParameter`,
 * and both see the tags as `aws:RequestTag/<key>` and `aws:TagKeys`.
 */
export function simSsmAuthorizePutParameter(
  authorizer: SimSsmAuthorizer,
  input: SimPutParameterCommandInput,
  resource: string,
  caller: SimAwsCaller | undefined,
): SimSsmAuthorizedPut {
  const tags = simAwsTagPairs(
    (input.Tags ?? []).map((tag) => [tag.Key, tag.Value]),
  );
  const tagged = tags.length > 0;

  if (tagged && input.Overwrite === true) {
    throw new SimSsmValidationException(
      "Invalid request: tags and overwrite can't be used together. To " +
        "create a parameter with tags, please remove overwrite flag. To " +
        "update tags for an existing parameter, please use AddTagsToResource " +
        "or RemoveTagsFromResource.",
    );
  }

  const conditions = simIamRequestTagRecordConditions(Object.fromEntries(tags));

  const resolved = authorizer.authorizeParameterResource(
    "ssm:PutParameter",
    resource,
    caller,
    conditions,
  );

  if (tagged) {
    authorizer.authorizeParameterResource(
      "ssm:AddTagsToResource",
      resource,
      caller,
      conditions,
    );
  }

  return { caller: resolved, tags };
}
