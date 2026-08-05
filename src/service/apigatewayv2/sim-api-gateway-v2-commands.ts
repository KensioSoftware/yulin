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
  type SimHttpApiJwtIssuerKeys,
  SimHttpApiNoJwtIssuerKeys,
} from "./api/authorizer/sim-http-api-jwt-issuer-keys.js";
import { SimHttpApiStore } from "./api/sim-http-api-store.js";
import { SimHttpApiCommands } from "./command/api/sim-http-api-commands.js";
import { SimHttpApiImportCommands } from "./command/api/sim-http-api-import-commands.js";
import { SimApiGatewayV2Authorizer } from "./command/authorize/sim-api-gateway-v2-authorizer.js";
import { SimHttpApiAuthorizerCommands } from "./command/authorizer/sim-http-api-authorizer-commands.js";
import { SimHttpApiIntegrationCommands } from "./command/integration/sim-http-api-integration-commands.js";
import { SimHttpApiRouteCommands } from "./command/route/sim-http-api-route-commands.js";
import { SimHttpApiAccess } from "./command/sim-http-api-access.js";
import { SimHttpApiStageCommands } from "./command/stage/sim-http-api-stage-commands.js";
import { SimHttpApiRegistry } from "./registry/sim-http-api-registry.js";

/**
 * How one simulated API Gateway v2 is put together.
 */
export interface SimApiGatewayV2Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly registry?: SimHttpApiRegistry;
  /**
   * The issuers this API Gateway's JWT authorizers can verify against. A
   * standalone simulated API Gateway has none, so a JWT route refuses every
   * request rather than admitting one it could not check.
   */
  readonly jwtIssuerKeys?: SimHttpApiJwtIssuerKeys;
}

/**
 * The command areas of one simulated API Gateway v2, and the state they share.
 *
 * Every command authorizes against the same IAM and reaches its API through
 * the same store, so the wiring lives here rather than being repeated once per
 * command in the service facade. That keeps SimApiGatewayV2 what it should be:
 * state plus delegation.
 */
export class SimApiGatewayV2Commands {
  public readonly apis = new SimHttpApiStore();
  public readonly api: SimHttpApiCommands;
  public readonly imports: SimHttpApiImportCommands;
  public readonly authorizers: SimHttpApiAuthorizerCommands;
  public readonly integrations: SimHttpApiIntegrationCommands;
  public readonly routes: SimHttpApiRouteCommands;
  public readonly stages: SimHttpApiStageCommands;
  public readonly background: BackgroundScheduler;

  constructor(properties: SimApiGatewayV2Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      registry = new SimHttpApiRegistry(),
      jwtIssuerKeys = new SimHttpApiNoJwtIssuerKeys(),
    } = properties;

    const access = new SimHttpApiAccess({
      apis: this.apis,
      authorizer: new SimApiGatewayV2Authorizer({ iam, accountRegionScope }),
    });

    this.background = background;
    this.api = new SimHttpApiCommands({
      apis: this.apis,
      registry,
      access,
      accountRegionScope,
      clock: background,
      jwtIssuerKeys,
    });
    this.authorizers = new SimHttpApiAuthorizerCommands({ access });
    this.integrations = new SimHttpApiIntegrationCommands({ access });
    this.routes = new SimHttpApiRouteCommands({ access });
    this.stages = new SimHttpApiStageCommands({ access, clock: background });
    this.imports = new SimHttpApiImportCommands({
      apis: this.apis,
      registry,
      apiCommands: this.api,
      authorizerCommands: this.authorizers,
      integrationCommands: this.integrations,
      routeCommands: this.routes,
    });
  }
}
