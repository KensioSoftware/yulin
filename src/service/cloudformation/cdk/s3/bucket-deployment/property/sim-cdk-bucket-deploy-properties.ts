import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../template/value/sim-cfn-template-value.js";
import { SimCdkBucketDeployValues } from "./sim-cdk-bucket-deploy-values.js";

/**
 * The parts of a `Custom::CDKBucketDeployment` that say what to copy where.
 *
 * The CDK `BucketDeployment` construct compiles down to these properties, which
 * its provider function turns into one `aws s3 sync` invocation. Reading them
 * into one object keeps the parsing and the validation away from the copying.
 */
export class SimCdkBucketDeployProperties {
  readonly destinationBucketName: string;
  readonly destinationKeyPrefix: string;
  readonly sourceObjectKeys: readonly string[];
  readonly exclude: readonly string[];
  readonly include: readonly string[];
  readonly prune: boolean;
  readonly systemMetadata: ReadonlyMap<string, string>;

  constructor(resource: SimCfnResource, properties: SimCfnTemplateValueRecord) {
    const values = new SimCdkBucketDeployValues(resource, properties);

    this.destinationBucketName = values.requiredString("DestinationBucketName");
    this.destinationKeyPrefix = normaliseKeyPrefix(
      values.optionalString("DestinationBucketKeyPrefix"),
    );
    this.sourceObjectKeys = values.stringList("SourceObjectKeys");
    this.exclude = values.stringList("Exclude");
    this.include = values.stringList("Include");
    // A `BucketDeployment` prunes unless told not to, and the property is only
    // synthesized when it is set, so absent means the construct default.
    this.prune = values.boolean("Prune", true);
    this.systemMetadata = values.headers("SystemMetadata");
  }

  /**
   * The Object key a source file relative path is stored under.
   */
  objectKey(relativePath: string): string {
    return `${this.destinationKeyPrefix}${relativePath}`;
  }
}

/**
 * The destination prefix is synthesized without a trailing slash, and is a key
 * prefix rather than a directory, so it grows one here and only here.
 */
function normaliseKeyPrefix(value: string | undefined): string {
  if (value === undefined || value === "") {
    return "";
  }

  return value.endsWith("/") ? value : `${value}/`;
}
