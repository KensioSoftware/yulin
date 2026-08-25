import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simGlueDatabaseArn } from "../arn/sim-glue-arn.js";

interface SimGlueDatabaseProperties {
  readonly name: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createTime: Date;
  readonly description?: string | undefined;
  readonly locationUri?: string | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * A simulated Glue database, which is the grouping a table lives in.
 *
 * A database holds no data of its own. What it carries is a name, somewhere
 * for a table to belong, and the parameters a caller put on it.
 */
export class SimGlueDatabase {
  readonly name: string;
  readonly createTime: Date;
  readonly description: string | undefined;
  readonly locationUri: string | undefined;
  readonly parameters: Readonly<Record<string, string>>;

  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimGlueDatabaseProperties) {
    this.name = properties.name;
    this.createTime = properties.createTime;
    this.description = properties.description;
    this.locationUri = properties.locationUri;
    this.parameters = { ...properties.parameters };
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /** The catalog holding this database, which is the account id. */
  get catalogId(): string {
    return this.#accountRegionScope.accountId;
  }

  /** This database's ARN. */
  get arn(): string {
    return simGlueDatabaseArn(this.#accountRegionScope, this.name);
  }
}
