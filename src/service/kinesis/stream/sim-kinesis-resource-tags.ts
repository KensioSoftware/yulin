import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimIamResourceTagAuthZ,
  simIamNamesResource,
} from "../../iam/tag/sim-iam-resource-tag-auth-z.js";
import type { SimKinesisStreamStore } from "./sim-kinesis-stream-store.js";

/**
 * IAM authorization that gives a policy the tags of the stream a request acts
 * on, as `aws:ResourceTag/<key>`.
 *
 * A consumer holds no tags of its own here. A request naming one reads the
 * tags of its stream.
 */
export function simKinesisTagConditionIam(
  iam: SimIamInterServiceAuthZ,
  streams: SimKinesisStreamStore,
): SimIamInterServiceAuthZ {
  return new SimIamResourceTagAuthZ(iam, (resource) => {
    const name = /:stream\/([^\/]+)/v.exec(resource)?.[1];
    const stream = name === undefined ? undefined : streams.find(name);

    return stream !== undefined &&
      simIamNamesResource(stream.arn, resource, "/")
      ? stream.tags
      : undefined;
  });
}
