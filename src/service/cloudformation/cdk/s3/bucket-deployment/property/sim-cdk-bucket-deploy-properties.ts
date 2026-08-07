import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../template/value/sim-cfn-template-value.js";

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
    this.destinationBucketName = requiredString(
      resource,
      properties,
      "DestinationBucketName",
    );
    this.destinationKeyPrefix = normaliseKeyPrefix(
      optionalString(resource, properties, "DestinationBucketKeyPrefix"),
    );
    this.sourceObjectKeys = stringList(
      resource,
      properties,
      "SourceObjectKeys",
    );
    this.exclude = stringList(resource, properties, "Exclude");
    this.include = stringList(resource, properties, "Include");
    // A `BucketDeployment` prunes unless told not to, and the property is only
    // synthesized when it is set, so absent means the construct default.
    this.prune = properties["Prune"] !== false;
    this.systemMetadata = systemMetadata(resource, properties);
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

function systemMetadata(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): ReadonlyMap<string, string> {
  const value = properties["SystemMetadata"];

  if (value === undefined) {
    return new Map();
  }

  if (typeof value !== "object" || Array.isArray(value) || value === null) {
    throw new TypeError(
      `Custom::CDKBucketDeployment ${resource.logicalId}: SystemMetadata must be an object`,
    );
  }

  const entries = Object.entries(value).map(([name, headerValue]) => {
    if (typeof headerValue !== "string") {
      throw new TypeError(
        `Custom::CDKBucketDeployment ${resource.logicalId}: SystemMetadata ${name} must be a string`,
      );
    }

    return [name.toLowerCase(), headerValue] as const;
  });

  return new Map(entries);
}

function requiredString(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
  name: string,
): string {
  const value = optionalString(resource, properties, name);

  if (value === undefined) {
    throw new TypeError(
      `Custom::CDKBucketDeployment ${resource.logicalId}: ${name} must resolve to a string`,
    );
  }

  return value;
}

function optionalString(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
  name: string,
): string | undefined {
  // eslint-disable-next-line security/detect-object-injection
  const value = properties[name];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError(
      `Custom::CDKBucketDeployment ${resource.logicalId}: ${name} must resolve to a string`,
    );
  }

  return value;
}

function stringList(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
  name: string,
): readonly string[] {
  // eslint-disable-next-line security/detect-object-injection
  const value = properties[name];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(
      `Custom::CDKBucketDeployment ${resource.logicalId}: ${name} must be an array of strings`,
    );
  }

  return value as readonly string[];
}
