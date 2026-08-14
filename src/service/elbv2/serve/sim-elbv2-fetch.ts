import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { SimElbV2ServiceController } from "./sim-elbv2-controller.js";

/**
 * Send an HTTP request to whichever simulated load balancer its host name
 * names.
 *
 * This is the in-process way to reach a load balancer, taking the same
 * arguments as `fetch`. The host name of the URL is the load balancer's DNS
 * name and the port is the listener's, which is what a client writes on real
 * AWS too. Nothing is sent over a socket.
 *
 * A host name no load balancer answers on, and a port no listener holds, both
 * throw rather than answering: on real AWS neither reaches a load balancer at
 * all, so there is no status for either.
 */
export async function simElbV2Fetch(
  simAws: SimAws,
  input: Request | string,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);

  return await new SimElbV2ServiceController({ simAws }).handleRequest(
    new SimAwsServiceRequest({
      target: {
        service: "elbV2",
        resourceName: new URL(request.url).hostname,
      },
      request,
    }),
  );
}
