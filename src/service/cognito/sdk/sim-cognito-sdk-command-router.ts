import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import { simCognitoSdkAuthRoutes } from "./sim-cognito-sdk-auth-routes.js";
import { simCognitoSdkDirectoryRoutes } from "./sim-cognito-sdk-directory-routes.js";
import { simCognitoSdkFederationRoutes } from "./sim-cognito-sdk-federation-routes.js";
import { simCognitoSdkPoolRoutes } from "./sim-cognito-sdk-pool-routes.js";
import { simCognitoSdkWebAuthnRoutes } from "./sim-cognito-sdk-web-authn-routes.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Cognito.
 *
 * The routes are grouped the way the operations themselves are, into pools and
 * their app clients, the users and groups in them, the domain and identity
 * providers they federate through, signing in, and the passkeys a user
 * registers, so that adding an operation touches the group it belongs to.
 */
export class SimCognitoSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simCognito: SimCognitoIdentityProvider) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      ...simCognitoSdkPoolRoutes(simCognito),
      ...simCognitoSdkDirectoryRoutes(simCognito),
      ...simCognitoSdkAuthRoutes(simCognito),
      ...simCognitoSdkFederationRoutes(simCognito),
      ...simCognitoSdkWebAuthnRoutes(simCognito),
    ]);
  }

  /**
   * The SDK Command names simulated Cognito can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Cognito supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
