/**
 * Where an HTTP request leaving sim Lambda function code is answered by the
 * simulation instead of by the network.
 *
 * A simulated environment serves hostnames of two kinds. There are the AWS
 * service API endpoints an SDK resolves, which carry a serialized Command, and
 * there are the hostnames a simulated resource answers on: a Cognito user pool
 * domain, an API Gateway HTTP API, a load balancer, anything simulated Route53
 * resolves. Function code reaching either belongs in the simulation, and
 * reaching anything else belongs on the network, which is where it goes.
 *
 * The two questions are separate because the client has to decide before it
 * has a request to send: `http.request` hands back a stream that is written to
 * long before there is a body, so whether the simulation is answering has to
 * be settled from the hostname alone.
 */
export interface SimLambdaOutboundHttp {
  /**
   * Whether the simulation answers requests addressed to a hostname.
   */
  serves(hostname: string): boolean;

  /**
   * Answer one request the simulation serves.
   */
  fetch(request: Request): Promise<Response>;
}
