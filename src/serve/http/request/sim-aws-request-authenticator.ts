import type { SimAws } from "../../../service/aws/sim-aws.js";
import { simAwsServiceSigningName } from "../../controller/sim-aws-service-signing-name.js";
import {
  SimAwsServiceRequest,
  type SimAwsServiceTarget,
} from "../../controller/sim-service-controller.js";
import { SimAwsReceivedRequest } from "./sim-aws-received-request.js";

interface SimAwsRequestAuthenticatorProperties {
  readonly simAws: SimAws;
}

/**
 * Turns a received HTTP request into a request a simulated service can serve.
 *
 * This is where the serving layer meets simulated IAM: the body is buffered
 * once, the principal is resolved by IAM, and the result is the request a
 * controller is given. Controllers therefore never see an unattributed
 * request, and never have to decide for themselves what an unsigned one means.
 */
export class SimAwsRequestAuthenticator {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsRequestAuthenticatorProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Authenticate a request routed to a simulated service.
   *
   * The request handed to IAM is the one received, headers and all. A signature
   * covers the host header as it arrived, and serving rewrites AWS hostnames to
   * localhost ones, so reconstructing the real AWS hostname here would break
   * every signature made against the URL actually called.
   *
   * Throws a SimAwsRequestAuthFailure when the request states an identity that
   * cannot be accepted.
   */
  async authenticate(
    target: SimAwsServiceTarget,
    request: Request,
  ): Promise<SimAwsServiceRequest> {
    const received = await SimAwsReceivedRequest.receive(request);

    const caller = this.simAws.resolveRequestCaller(request, {
      body: received.body,
      expectedScope: {
        serviceName: simAwsServiceSigningName(target.service),
        regionName: target.regionName,
      },
    });

    return new SimAwsServiceRequest({
      target,
      request: received.forService(),
      caller,
      body: received.body,
    });
  }
}
