import { jsonStringify } from "../../../../util/type-guard/json.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3 } from "../../sim-s3.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnS3BucketPolicyCreatorProperties {
  readonly simS3: SimS3;
}

/**
 * Creates simulated S3 Bucket policies from AWS::S3::BucketPolicy Resources.
 *
 * This is what CDK emits for every `grantRead`, `grantPut` and
 * `addToResourcePolicy`, so a synthesized template reaches it whether or not
 * the app mentions a Bucket policy itself. Creation goes through the normal
 * PutBucketPolicy command path, so a policy declared in a template is validated
 * and enforced exactly as one applied through the SDK.
 */
export class SimCfnS3BucketPolicyCreator {
  private readonly simS3: SimS3;

  constructor(properties: SimCfnS3BucketPolicyCreatorProperties) {
    this.simS3 = properties.simS3;
  }

  /**
   * Attach a policy to the Bucket named by the Resource.
   *
   * The simulated Bucket is returned as the Resource's simulated object,
   * because a Bucket policy has no existence of its own in S3: it is state on
   * the Bucket it is attached to.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimS3Bucket> {
    const bucketName = this.bucketNameForResource(resource, properties);
    const policyDocument = this.policyDocumentForResource(resource, properties);

    await this.simS3.putBucketPolicy(
      {
        input: {
          Bucket: bucketName,
          Policy: jsonStringify(policyDocument),
        },
      },
      options,
    );

    const bucket = this.simS3.getSimBucketByName(bucketName);
    assertDefined(
      bucket,
      `sim S3 Bucket ${bucketName} after CloudFormation Bucket policy creation`,
    );

    return bucket;
  }

  private bucketNameForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const bucketName = properties["Bucket"];

    if (typeof bucketName !== "string") {
      throw new TypeError(
        `AWS::S3::BucketPolicy ${resource.logicalId} requires a Bucket name string, got ${typeof bucketName}`,
      );
    }

    return bucketName;
  }

  private policyDocumentForResource(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): object {
    const policyDocument = properties["PolicyDocument"];

    if (
      policyDocument === undefined ||
      policyDocument === null ||
      typeof policyDocument !== "object" ||
      Array.isArray(policyDocument)
    ) {
      throw new TypeError(
        `AWS::S3::BucketPolicy ${resource.logicalId} requires a PolicyDocument object`,
      );
    }

    return policyDocument;
  }
}
