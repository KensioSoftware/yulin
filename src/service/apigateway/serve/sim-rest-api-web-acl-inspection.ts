import {
  type SimWafInspected,
  SimWafRequestInspection,
} from "../../wafv2/association/sim-waf-request-inspection.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

interface SimRestApiInspectionInput {
  readonly restApi: SimRestApi;
  /** The first path segment of the request, which names the stage. */
  readonly stageName: string;
  readonly request: Request;
}

/**
 * Puts a request to the web ACL in front of the stage it reached.
 *
 * This runs before the method is matched and before any authorizer, which is
 * the order real API Gateway evaluates in: the web ACL comes ahead of resource
 * policies, IAM, a Lambda authorizer and a Cognito authorizer alike. A blocked
 * request therefore reaches neither the authorizer nor the integration.
 */
export class SimRestApiWebAclInspection {
  private readonly inspection = new SimWafRequestInspection();

  /**
   * Put one request to whatever protects the stage it addressed.
   */
  async inspect(input: SimRestApiInspectionInput): Promise<SimWafInspected> {
    const { request, restApi } = input;

    // API Gateway forwards the request body to AWS WAF, so a rule inspecting
    // the body of a request to a stage sees it.
    return await this.inspection.inspect({
      protection: restApi.webAcls,
      resourceArn: restApi.stageArn(input.stageName),
      request,
      forwardBody: true,
    });
  }
}
