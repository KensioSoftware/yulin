import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import {
  simAwsEventBridgeDeliveryTargets,
  simAwsRekognitionImages,
  simAwsSchedulerDeliveryTargets,
} from "./sim-aws-cross-account-collaborators.js";
import { SimCloudFormation } from "../../cloudformation/index.js";
import { SimCloudWatch } from "../../cloudwatch/index.js";
import { simAwsCloudWatchCollaborators } from "./sim-aws-cloudwatch-collaborators.js";
import { SimCognitoIdentityProvider } from "../../cognito/index.js";
import { SimEcs } from "../../ecs/index.js";
import { simAwsCognitoTriggerFunctions } from "../../cognito/user-pool/trigger/sim-aws-cognito-trigger-functions.js";
import { SimEventBridge } from "../../eventbridge/index.js";
import type { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import { SimLambda } from "../../lambda/index.js";
import { SimLogs } from "../../logs/index.js";
import { simAwsLogsCollaborators } from "./sim-aws-logs-collaborators.js";
import type { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import { SimRekognition } from "../../rekognition/index.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { SimScheduler } from "../../scheduler/index.js";
import { simAwsEcsCollaborators } from "./sim-aws-ecs-collaborators.js";
import { simAwsLambdaCollaborators } from "./sim-aws-lambda-collaborators.js";
import { simAwsS3NotificationDestinations } from "./sim-aws-s3-notification-destinations.js";
import { SimSns } from "../../sns/index.js";
import { SimAwsSnsDeliveryEndpoints } from "../../sns/delivery/sim-aws-sns-delivery-endpoints.js";
import { SimSts } from "../../sts/sim-sts.js";
import type { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import type { SimAwsScopedServiceProperties } from "./sim-aws-scoped-service-properties.js";
import type { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";

interface SimAwsAccountRegionServiceBuilderProperties {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly registries: SimAwsScopedServiceRegistries;
  readonly iamRegistry: SimIamRegistry;
  readonly lambdaUrlRegistry: SimLambdaUrlRegistry;
  readonly accountServices: SimAwsAccountServiceCache;
}

/**
 * Builder for simulated AWS services scoped to one Account and Region.
 *
 * SimAwsServiceFactory owns the top-level policy of which scope a service
 * belongs to. This class is the half of that split holding the services whose
 * AWS state is scoped to an account/region pair, as SimAwsAccountServiceCache
 * is the half holding the services scoped to a whole account.
 *
 * A service whose wiring says nothing but which scope it is in belongs in
 * SimAwsSelfContainedServiceBuilder instead, so what is left here is the
 * services that reach for something outside their own scope.
 *
 * Nothing is cached here, which is the point of the split: a service in this
 * class is built fresh for the scope that asks for it, because on real AWS its
 * state does not cross a Region boundary. Each build method is therefore just
 * the wiring for one service, and says in its own doc comment what makes that
 * service Region-scoped.
 *
 * Services here reach account-scoped ones, IAM above all, through the same
 * account cache the factory uses, so a Region's services decide against the
 * one IAM its Account owns.
 */
export class SimAwsAccountRegionServiceBuilder {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly registries: SimAwsScopedServiceRegistries;
  private readonly iamRegistry: SimIamRegistry;
  private readonly lambdaUrlRegistry: SimLambdaUrlRegistry;
  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsAccountRegionServiceBuilderProperties) {
    this.simAws = properties.simAws;
    this.background = properties.background;
    this.registries = properties.registries;
    this.iamRegistry = properties.iamRegistry;
    this.lambdaUrlRegistry = properties.lambdaUrlRegistry;
    this.accountServices = properties.accountServices;
  }

  /** Create simulated ACM for an Account Region scope. */
  /** Create simulated CloudFormation for an Account Region scope. */
  createCloudFormation(scope: SimAwsAccountRegionContainer): SimCloudFormation {
    return new SimCloudFormation({
      ...this.scoped(scope),
      simAws: this.simAws,
    });
  }

  /**
   * Create simulated CloudWatch metrics and alarms for an Account Region
   * scope.
   *
   * Metrics are Region-scoped on real AWS: a metric published in one Region is
   * invisible from another, and there is no ARN by which to reach one across
   * the boundary. An alarm's SNS topic has to be in that Region too, which is
   * what this reaches the rest of the simulation for.
   */
  createCloudWatch(scope: SimAwsAccountRegionContainer): SimCloudWatch {
    return new SimCloudWatch({
      ...this.scoped(scope),
      ...simAwsCloudWatchCollaborators(this.simAws, scope.accountRegionScope),
    });
  }

  /**
   * Create simulated Cognito user pools for an Account Region scope.
   *
   * User pools are Region-scoped on real AWS: a pool id names its Region, and
   * a pool cannot be reached from another one.
   */
  createCognitoIdentityProvider(
    scope: SimAwsAccountRegionContainer,
  ): SimCognitoIdentityProvider {
    return new SimCognitoIdentityProvider({
      ...this.scoped(scope),
      userPoolRegistry: this.registries.cognito,
      domainRegistry: this.registries.cognitoDomains,
      triggerFunctions: simAwsCognitoTriggerFunctions(this.simAws),
    });
  }

  /** Create simulated ECS for an Account Region scope. */
  createEcs(scope: SimAwsAccountRegionContainer): SimEcs {
    return new SimEcs({
      ...this.scoped(scope),
      ...simAwsEcsCollaborators(this.simAws, scope),
    });
  }

  /**
   * Create simulated EventBridge for an Account Region scope.
   *
   * Event buses are Region-scoped on real AWS: a bus ARN names its Region, and
   * an event put in one Region reaches no rule in another.
   */
  createEventBridge(scope: SimAwsAccountRegionContainer): SimEventBridge {
    return new SimEventBridge({
      ...this.scoped(scope),
      deliveryTargets: simAwsEventBridgeDeliveryTargets(this.simAws),
    });
  }

  /** Create simulated CloudWatch Logs for an Account Region scope. */
  createLogs(scope: SimAwsAccountRegionContainer): SimLogs {
    return new SimLogs({
      ...this.scoped(scope),
      ...simAwsLogsCollaborators(this.simAws, scope.accountRegionScope),
    });
  }

  /** Create simulated Lambda for an Account Region scope. */
  createLambda(scope: SimAwsAccountRegionContainer): SimLambda {
    return new SimLambda({
      ...this.scoped(scope),
      ...simAwsLambdaCollaborators({
        simAws: this.simAws,
        scope,
        urlRegistry: this.lambdaUrlRegistry,
        registries: this.registries,
      }),
    });
  }

  /**
   * Create simulated Rekognition for an Account Region scope.
   *
   * Rekognition is Region-scoped because the results declared against it are:
   * a detection made in one Region is answered by that Region's rules.
   */
  createRekognition(scope: SimAwsAccountRegionContainer): SimRekognition {
    return new SimRekognition({
      iam: this.accountServices.createIam(scope),
      background: this.background,
      images: simAwsRekognitionImages(this.simAws, scope),
    });
  }

  /**
   * Create simulated S3 for an Account Region scope.
   *
   * Bucket event notification destinations are resolved when a configuration
   * is applied or an event is delivered, never here. Simulated Lambda already
   * reaches this scope's simulated S3 as it is built, for function code in a
   * Bucket, so building S3 by reaching for Lambda would be a cycle: the memo
   * only records a service once its factory has returned, and has no
   * re-entrancy guard. That holds for a service that would not close the cycle
   * today as well, since a later one could.
   */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    return new SimS3({
      accountRegionScope: scope.accountRegionScope,
      s3GlobalRegistry: this.registries.s3,
      iam: this.accountServices.createIam(scope),
      background: this.background,
      notificationDestinations: simAwsS3NotificationDestinations(this.simAws),
    });
  }

  /**
   * Create simulated SNS for an Account Region scope.
   *
   * Topics are Region-scoped on real AWS: a topic ARN names the Region. Where a
   * subscription delivers is not, since real SNS delivers to a queue or function
   * in any Account or Region, so the endpoints come from the whole simulation
   * and are resolved on delivery rather than here.
   */
  createSns(scope: SimAwsAccountRegionContainer): SimSns {
    const endpoints = new SimAwsSnsDeliveryEndpoints({ simAws: this.simAws });

    return new SimSns({ ...this.scoped(scope), deliveryEndpoints: endpoints });
  }

  /** Create simulated EventBridge Scheduler for an Account Region scope. */
  createScheduler(scope: SimAwsAccountRegionContainer): SimScheduler {
    return new SimScheduler({
      ...this.scoped(scope),
      deliveryTargets: simAwsSchedulerDeliveryTargets(this.simAws),
    });
  }

  /** Create simulated STS for an Account/Region scope. */
  createSts(scope: SimAwsAccountRegionContainer): SimSts {
    this.accountServices.createIam(scope);

    return new SimSts({
      accountRegionScope: scope.accountRegionScope,
      background: this.background,
      iamResolver: this.iamRegistry,
    });
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
