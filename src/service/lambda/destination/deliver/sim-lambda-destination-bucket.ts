import type { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaError } from "../../error/sim-lambda.error.js";
import type { SimLambdaDestinationStoreRequest } from "../sim-lambda-destination-targets.js";

/**
 * A Bucket a stream mapping writes a failed batch to, wherever the Bucket
 * lives.
 *
 * Real Lambda needs `s3:ListBucket` as well as `s3:PutObject` on the execution
 * role for an S3 destination. The Bucket is checked with HeadBucket, which is
 * what `s3:ListBucket` authorizes, and the object is then written with
 * PutObject. Both go through simulated S3 as the role, so a role missing
 * either is refused there as an SDK caller would be.
 */
export class SimLambdaDestinationBucket {
  readonly #simAws: SimAws;

  constructor(simAws: SimAws) {
    this.#simAws = simAws;
  }

  /**
   * Write the object to the Bucket.
   */
  async store(request: SimLambdaDestinationStoreRequest): Promise<void> {
    const { bucketName: Bucket } = request;
    const found = this.#simAws.s3().findBucketScope(Bucket);

    if (found === undefined) {
      throw new SimLambdaError(`${Bucket} is not a simulated S3 Bucket.`);
    }

    const s3 = this.#simAws
      .accountRegionScope(found.accountId, found.regionName)
      .s3();
    const options = {
      caller: { kind: "arn", arn: request.sourceFunctionRoleArn },
      sourceArn: request.sourceFunctionArn,
    } as const;

    await s3.headBucket({ input: { Bucket } }, options);
    await s3.putObject(
      { input: { Bucket, Key: request.key, Body: request.body } },
      options,
    );
  }
}
