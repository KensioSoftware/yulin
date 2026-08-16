import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import { SimCloudWatch } from "../../cloudwatch/index.js";
import { SimDynamoDb as SimDynamoDatabase } from "../../dynamodb/index.js";
import { SimSecretsManager } from "../../secretsmanager/index.js";
import { SimSqs } from "../../sqs/index.js";
import { SimSsm } from "../../ssm/index.js";
import type { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import type { SimAwsScopedServiceProperties } from "./sim-aws-scoped-service-properties.js";

interface SimAwsSelfContainedServiceBuilderProperties {
  readonly accountServices: SimAwsAccountServiceCache;
}

/**
 * Builder for the simulated services that reach nothing outside their own
 * Account and Region.
 *
 * These are the services wired from the collaborators every scoped service
 * gets, and at most from another service in the same scope: no simulation-wide
 * registry, no delivery across Accounts, nothing that has to be resolved from
 * somewhere else in the simulation. That is what makes them worth keeping
 * apart from SimAwsAccountRegionServiceBuilder, where the wiring for a service
 * is about what it reaches for.
 *
 * It is also what stops that file growing without end. Both grow by one method
 * per simulated service, and a service belongs here when its build method says
 * nothing but which scope it is in.
 */
export class SimAwsSelfContainedServiceBuilder {
  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsSelfContainedServiceBuilderProperties) {
    this.accountServices = properties.accountServices;
  }

  /**
   * Create simulated CloudWatch metrics for an Account Region scope.
   *
   * Metrics are Region-scoped on real AWS: a metric published in one Region is
   * invisible from another, and there is no ARN by which to reach one across
   * the boundary.
   */
  createCloudWatch(scope: SimAwsAccountRegionContainer): SimCloudWatch {
    return new SimCloudWatch(this.scoped(scope));
  }

  /** Create simulated DynamoDB for an Account Region scope. */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDatabase {
    return new SimDynamoDatabase(this.scoped(scope));
  }

  /**
   * Create simulated Secrets Manager for an Account Region scope, whose secret
   * values are encrypted through that same scope's simulated KMS.
   */
  createSecretsManager(scope: SimAwsAccountRegionContainer): SimSecretsManager {
    return new SimSecretsManager({ ...this.scoped(scope), kms: scope.kms() });
  }

  /**
   * Create simulated SQS for an Account Region scope.
   *
   * Queues are Region-scoped on real AWS: a queue URL and ARN both name the
   * Region, and a queue cannot be reached from another one.
   */
  createSqs(scope: SimAwsAccountRegionContainer): SimSqs {
    return new SimSqs(this.scoped(scope));
  }

  /**
   * Create simulated SSM for an Account Region scope.
   *
   * Parameters are Region-scoped on real AWS: a parameter name is unique
   * within one Account and Region, and its ARN names the Region. SecureString
   * values are encrypted through that same scope's simulated KMS.
   */
  createSsm(scope: SimAwsAccountRegionContainer): SimSsm {
    return new SimSsm({ ...this.scoped(scope), kms: scope.kms() });
  }

  /**
   * The collaborators every service built here takes.
   */
  private scoped(
    scope: SimAwsAccountRegionContainer,
  ): SimAwsScopedServiceProperties {
    return this.accountServices.scopedServiceProperties(scope);
  }
}
