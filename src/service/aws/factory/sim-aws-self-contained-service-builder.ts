import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import { SimAthena } from "../../athena/index.js";
import { SimBedrock } from "../../bedrock/index.js";
import { SimDynamoDb as SimDynamoDatabase } from "../../dynamodb/index.js";
import { SimFirehose } from "../../firehose/index.js";
import { SimGlue } from "../../glue/index.js";
import { SimKinesis } from "../../kinesis/index.js";
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
   * Create simulated Athena for an Account Region scope.
   *
   * Workgroups, named queries and query executions are all Region-scoped on
   * real Athena. A query writes its result set into a Bucket through that same
   * scope's simulated S3, and resolves the tables it names against that same
   * scope's simulated Glue Data Catalog.
   */
  createAthena(scope: SimAwsAccountRegionContainer): SimAthena {
    return new SimAthena({
      ...this.scoped(scope),
      s3: scope.s3(),
      glue: scope.glue(),
    });
  }

  /**
   * Create simulated Bedrock for an Account Region scope.
   *
   * Bedrock is Region-scoped because the responses declared against it are: an
   * invocation made in one Region is answered by that Region's rules, as a
   * real Bedrock endpoint answers for the Region it belongs to.
   */
  createBedrock(scope: SimAwsAccountRegionContainer): SimBedrock {
    return new SimBedrock(this.scoped(scope));
  }

  /** Create simulated DynamoDB for an Account Region scope. */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDatabase {
    return new SimDynamoDatabase(this.scoped(scope));
  }

  /**
   * Create simulated Kinesis Data Firehose for an Account Region scope.
   *
   * Delivery streams are Region-scoped on real AWS. A delivery stream writes
   * into a Bucket through that same scope's simulated S3, and reads a source
   * stream through that same scope's simulated Kinesis.
   */
  createFirehose(scope: SimAwsAccountRegionContainer): SimFirehose {
    return new SimFirehose({
      ...this.scoped(scope),
      s3: scope.s3(),
      kinesis: scope.kinesis(),
    });
  }

  /**
   * Create simulated Kinesis Data Streams for an Account Region scope.
   *
   * Streams are Region-scoped on real AWS: a stream ARN names the Region, and a
   * stream cannot be reached from another one.
   */
  createKinesis(scope: SimAwsAccountRegionContainer): SimKinesis {
    return new SimKinesis(this.scoped(scope));
  }

  /**
   * Create simulated Glue for an Account Region scope.
   *
   * A Data Catalog belongs to one account, and a database ARN names the
   * region. Nothing here reads an S3 object or runs a query, so the catalog
   * reaches no other simulated service.
   */
  createGlue(scope: SimAwsAccountRegionContainer): SimGlue {
    return new SimGlue(this.scoped(scope));
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
