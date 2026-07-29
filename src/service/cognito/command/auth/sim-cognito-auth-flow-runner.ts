import type { SimCognitoAuthFlow } from "./sim-cognito-auth-flow.js";
import type {
  SimCognitoPasswordSignIn,
  SimCognitoAuthRequest,
} from "./sim-cognito-password-sign-in.js";
import type { SimCognitoRefreshSignIn } from "./sim-cognito-refresh-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoAuthFlowRunnerProperties {
  readonly passwordSignIn: SimCognitoPasswordSignIn;
  readonly refreshSignIn: SimCognitoRefreshSignIn;
}

/**
 * Runs whichever flow a request resolved to.
 *
 * `AdminInitiateAuth` and `InitiateAuth` accept different flow names and reach
 * the pool differently, and once a flow is resolved they run the same bodies,
 * so the running of one lives here rather than in either command.
 */
export class SimCognitoAuthFlowRunner {
  private readonly passwordSignIn: SimCognitoPasswordSignIn;
  private readonly refreshSignIn: SimCognitoRefreshSignIn;

  constructor(properties: SimCognitoAuthFlowRunnerProperties) {
    this.passwordSignIn = properties.passwordSignIn;
    this.refreshSignIn = properties.refreshSignIn;
  }

  /**
   * Run a flow the app client is configured for.
   */
  run(
    flow: SimCognitoAuthFlow,
    request: SimCognitoAuthRequest,
  ): SimCognitoAuthenticationOutput {
    if (flow.exchangesRefreshToken) {
      return this.refreshSignIn.handle(request);
    }

    return this.passwordSignIn.handle(request);
  }
}
