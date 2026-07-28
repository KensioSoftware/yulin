import type { SimSsmParameterValue } from "./sim-ssm-parameter-value.js";

/**
 * The data type of a parameter's value.
 *
 * Only plain text is simulated. `aws:ec2:image` and `aws:ssm:integration` are
 * validated against other services by real Parameter Store, which this
 * simulation does not do.
 */
export const ssmTextDataType = "text";

/**
 * The details one write of a parameter carries, beyond its value.
 */
export interface SimSsmParameterVersionDetails {
  readonly description?: string | undefined;
  readonly dataType?: string | undefined;
  readonly lastModifiedUser?: string | undefined;
}

interface SimSsmParameterVersionProperties extends SimSsmParameterVersionDetails {
  readonly version: number;
  readonly value: SimSsmParameterValue;
  readonly lastModifiedDate: Date;
}

/**
 * One version of a simulated parameter.
 *
 * Every write makes a new version rather than replacing the value, because
 * that is what makes the `name:version` selector mean anything: a caller can
 * still read what the parameter said two deployments ago.
 */
export class SimSsmParameterVersion {
  public readonly version: number;
  public readonly value: SimSsmParameterValue;
  public readonly lastModifiedDate: Date;
  public readonly lastModifiedUser: string | undefined;
  public readonly description: string | undefined;
  public readonly dataType: string;

  constructor(properties: SimSsmParameterVersionProperties) {
    this.version = properties.version;
    this.value = properties.value;
    this.lastModifiedDate = properties.lastModifiedDate;
    this.lastModifiedUser = properties.lastModifiedUser;
    this.description = properties.description;
    this.dataType = properties.dataType ?? ssmTextDataType;
  }
}
