import { countedSimCognitoAuth } from "../../metric/sim-cognito-counted-request.js";
import type { SimCognitoPoolMetrics } from "../../metric/sim-cognito-pool-metrics.js";
import type { SimCognitoAuthFlow } from "./sim-cognito-auth-flow.js";
import type {
  SimCognitoPasswordSignIn,
  SimCognitoAuthRequest,
} from "./sim-cognito-password-sign-in.js";
import type { SimCognitoRefreshSignIn } from "./sim-cognito-refresh-sign-in.js";
import type { SimCognitoUserAuthSignIn } from "./sim-cognito-user-auth-sign-in.js";
import type { SimCognitoAuthenticationOutput } from "./auth.command.js";

interface SimCognitoAuthFlowRunnerProperties {
  readonly poolMetrics: SimCognitoPoolMetrics;
  readonly passwordSignIn: SimCognitoPasswordSignIn;
  readonly refreshSignIn: SimCognitoRefreshSignIn;
  readonly userAuthSignIn: SimCognitoUserAuthSignIn;
}

/**
 * Runs whichever flow a request resolved to.
 *
 * `AdminInitiateAuth` and `InitiateAuth` accept different flow names and reach
 * the pool differently, and once a flow is resolved they run the same bodies,
 * so the running of one lives here rather than in either command.
 *
 * Running a flow is asynchronous because any of them may have to wait on the
 * pool's Lambda triggers. A password sign-in and a choice-based one run the
 * authentication triggers, and every flow runs `PreTokenGeneration` where it
 * issues tokens.
 */
export class SimCognitoAuthFlowRunner {
  private readonly poolMetrics: SimCognitoPoolMetrics;
  private readonly passwordSignIn: SimCognitoPasswordSignIn;
  private readonly refreshSignIn: SimCognitoRefreshSignIn;
  private readonly userAuthSignIn: SimCognitoUserAuthSignIn;

  constructor(properties: SimCognitoAuthFlowRunnerProperties) {
    this.poolMetrics = properties.poolMetrics;
    this.passwordSignIn = properties.passwordSignIn;
    this.refreshSignIn = properties.refreshSignIn;
    this.userAuthSignIn = properties.userAuthSignIn;
  }

  /**
   * Run a flow the app client is configured for, and count the request.
   *
   * Real Cognito keeps a token refresh out of `SignInSuccesses` and counts it
   * under `TokenRefreshSuccesses` instead, so which metric a request lands in
   * follows the flow it ran. A request answered with a challenge issued no
   * tokens and counts as a 0, and so does one the pool refused outright. The
   * response that finishes a challenged sign-in is counted where it completes.
   */
  async run(
    flow: SimCognitoAuthFlow,
    request: SimCognitoAuthRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    return await countedSimCognitoAuth(
      this.poolMetrics,
      flow.exchangesRefreshToken ? "TokenRefreshSuccesses" : "SignInSuccesses",
      request,
      async () => await this.ran(flow, request),
    );
  }

  private async ran(
    flow: SimCognitoAuthFlow,
    request: SimCognitoAuthRequest,
  ): Promise<SimCognitoAuthenticationOutput> {
    if (flow.exchangesRefreshToken) {
      return await this.refreshSignIn.handle(request);
    }

    if (flow.offersChoice) {
      return await this.userAuthSignIn.handle(request);
    }

    return await this.passwordSignIn.handle(request);
  }
}
