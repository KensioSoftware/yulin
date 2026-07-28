import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSsmParameterVersionNotFound } from "../error/sim-ssm.error.js";
import { SimSsmParameterArn } from "./sim-ssm-parameter-arn.js";
import type { SimSsmParameterName } from "./sim-ssm-parameter-name.js";
import type { SimSsmParameterType } from "./sim-ssm-parameter-type.js";
import type { SimSsmParameterValue } from "./sim-ssm-parameter-value.js";
import {
  SimSsmParameterVersion,
  type SimSsmParameterVersionDetails,
} from "./sim-ssm-parameter-version.js";

interface SimSsmParameterProperties {
  readonly name: SimSsmParameterName;
  readonly type: SimSsmParameterType;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * One simulated parameter and its versions.
 *
 * The type belongs to the parameter rather than to a version because real
 * Parameter Store refuses to change it: a `String` parameter cannot be
 * overwritten as a `StringList`, and the caller has to delete it and make a
 * new one.
 */
export class SimSsmParameter {
  public readonly name: SimSsmParameterName;
  public readonly type: SimSsmParameterType;
  public readonly arn: SimSsmParameterArn;

  private readonly versions = new Map<number, SimSsmParameterVersion>();
  private latest = 0;

  constructor(properties: SimSsmParameterProperties) {
    this.name = properties.name;
    this.type = properties.type;
    this.arn = new SimSsmParameterArn({
      resource: properties.name.resource,
      accountRegionScope: properties.accountRegionScope,
    });
  }

  /**
   * The version a request that names no version reads.
   */
  get currentVersion(): SimSsmParameterVersion {
    return this.versionNumbered(this.latest);
  }

  /**
   * Add a version holding a new value, and make it the current one.
   */
  addVersion(
    value: SimSsmParameterValue,
    lastModifiedDate: Date,
    details: SimSsmParameterVersionDetails = {},
  ): SimSsmParameterVersion {
    this.latest += 1;

    const version = new SimSsmParameterVersion({
      ...details,
      version: this.latest,
      value,
      lastModifiedDate,
    });

    this.versions.set(version.version, version);

    return version;
  }

  /**
   * Read one numbered version of this parameter, or refuse.
   */
  versionNumbered(version: number): SimSsmParameterVersion {
    const found = this.versions.get(version);

    if (found === undefined) {
      throw new SimSsmParameterVersionNotFound(
        `Parameter '${this.name.value}' has no version ${String(version)}`,
      );
    }

    return found;
  }
}
