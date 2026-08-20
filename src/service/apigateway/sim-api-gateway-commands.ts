import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimRestApiNoUserPools,
  type SimRestApiUserPools,
} from "./api/authorizer/sim-rest-api-user-pools.js";
import { SimRestApiStore } from "./api/sim-rest-api-store.js";
import { SimRestApiCommands } from "./command/api/sim-rest-api-commands.js";
import { SimRestApiImportCommands } from "./command/api/sim-rest-api-import-commands.js";
import { SimApiGatewayAuthorizer } from "./command/authorize/sim-api-gateway-authorizer.js";
import { SimRestApiAuthorizerCommands } from "./command/authorizer/sim-rest-api-authorizer-commands.js";
import { SimRestApiDeploymentCommands } from "./command/deployment/sim-rest-api-deployment-commands.js";
import { SimRestApiIntegrationCommands } from "./command/integration/sim-rest-api-integration-commands.js";
import { SimRestApiMethodCommands } from "./command/method/sim-rest-api-method-commands.js";
import { SimRestApiResourceCommands } from "./command/resource/sim-rest-api-resource-commands.js";
import { SimRestApiAccess } from "./command/sim-rest-api-access.js";
import { SimRestApiStageCommands } from "./command/stage/sim-rest-api-stage-commands.js";
import { SimRestApiRegistry } from "./registry/sim-rest-api-registry.js";

/**
 * How one simulated API Gateway REST API service is put together.
 */
export interface SimApiGatewayProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly registry?: SimRestApiRegistry;
  /**
   * The user pools this API Gateway's Cognito authorizers verify tokens
   * against. A standalone simulated API Gateway has none, so a
   * `COGNITO_USER_POOLS` method refuses every request rather than admitting
   * one it could not check.
   */
  readonly userPools?: SimRestApiUserPools;
}

/**
 * The command areas of one simulated API Gateway, and the state they share.
 *
 * Every command authorizes against the same IAM and reaches its API through
 * the same store, so the wiring lives here rather than being repeated once per
 * command in the service facade. That leaves SimApiGateway as state plus
 * delegation.
 */
export class SimApiGatewayCommands {
  public readonly apis = new SimRestApiStore();
  public readonly api: SimRestApiCommands;
  public readonly imports: SimRestApiImportCommands;
  public readonly resources: SimRestApiResourceCommands;
  public readonly authorizers: SimRestApiAuthorizerCommands;
  public readonly methods: SimRestApiMethodCommands;
  public readonly integrations: SimRestApiIntegrationCommands;
  public readonly deployments: SimRestApiDeploymentCommands;
  public readonly stages: SimRestApiStageCommands;
  public readonly background: BackgroundScheduler;

  constructor(properties: SimApiGatewayProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      registry = new SimRestApiRegistry(),
      userPools = new SimRestApiNoUserPools(),
    } = properties;

    const access = new SimRestApiAccess({
      apis: this.apis,
      authorizer: new SimApiGatewayAuthorizer({ iam, accountRegionScope }),
    });

    this.background = background;
    this.api = new SimRestApiCommands({
      apis: this.apis,
      registry,
      access,
      accountRegionScope,
      clock: background,
      userPools,
    });
    this.resources = new SimRestApiResourceCommands({ access });
    this.authorizers = new SimRestApiAuthorizerCommands({ access });
    this.methods = new SimRestApiMethodCommands({ access });
    this.integrations = new SimRestApiIntegrationCommands({ access });
    this.deployments = new SimRestApiDeploymentCommands({
      access,
      clock: background,
    });
    this.stages = new SimRestApiStageCommands({ access, clock: background });
    this.imports = new SimRestApiImportCommands({
      apis: this.apis,
      registry,
      access,
      apiCommands: this.api,
      resourceCommands: this.resources,
      methodCommands: this.methods,
      integrationCommands: this.integrations,
      authorizerCommands: this.authorizers,
    });
  }
}
