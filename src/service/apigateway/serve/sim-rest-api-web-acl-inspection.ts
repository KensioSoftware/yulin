import { simWafBlockedHttpResponse } from "../../wafv2/evaluate/sim-waf-blocked-response.js";
import type { SimWafHeader } from "../../wafv2/web-acl/sim-waf-custom-response.type.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

interface SimRestApiInspectionInput {
  readonly restApi: SimRestApi;
  /** The first path segment of the request, which names the stage. */
  readonly stageName: string;
  readonly request: Request;
}

interface SimRestApiInspectedProperties {
  readonly request: Request;
  readonly blocked?: Response | undefined;
}

/**
 * What the web ACL in front of a stage left of one request.
 *
 * A blocked request has a response to send and goes no further. An allowed one
 * carries on, as the request the rules asked for rather than the one that
 * arrived, since a rule can add headers to what is forwarded.
 */
export class SimRestApiInspected {
  public readonly request: Request;
  public readonly blocked: Response | undefined;

  constructor(properties: SimRestApiInspectedProperties) {
    this.request = properties.request;
    this.blocked = properties.blocked;
  }
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
  /**
   * Put one request to whatever protects the stage it addressed.
   */
  async inspect(
    input: SimRestApiInspectionInput,
  ): Promise<SimRestApiInspected> {
    const { request, restApi } = input;
    const resourceArn = restApi.stageArn(input.stageName);

    if (!restApi.webAcls.protects(resourceArn)) {
      return new SimRestApiInspected({ request });
    }

    // The body is buffered only for a protected stage, because reading it is
    // what a rule inspecting the body needs and every other request would pay
    // for it.
    const body = await inspectedBody(request);
    const decision = restApi.webAcls.decide({ resourceArn, request, body });

    // A decision carries a blocked response when its action was to block, and
    // carries none when the request was allowed. That one reading is what
    // decides the request here.
    if (decision?.blocked !== undefined) {
      return new SimRestApiInspected({
        request,
        blocked: simWafBlockedHttpResponse(decision.blocked),
      });
    }

    return new SimRestApiInspected({
      request: forwarded(request, decision?.insertedHeaders ?? []),
    });
  }
}

/**
 * The request body a web ACL's rules are matched against.
 *
 * The request is cloned rather than read, so the integration still has a body
 * to send on to the function behind the method.
 */
async function inspectedBody(
  request: Request,
): Promise<Uint8Array | undefined> {
  const buffered = new Uint8Array(await request.clone().arrayBuffer());

  return buffered.byteLength === 0 ? undefined : buffered;
}

/**
 * The request as the web ACL asked for it to be forwarded.
 *
 * A rule with custom request handling adds headers to what reaches the origin,
 * and API Gateway is the origin here. Only the headers are replaced, so the
 * body carries over as the stream it arrived as: inspection read a clone of
 * it rather than the request itself.
 */
function forwarded(
  request: Request,
  insertedHeaders: readonly SimWafHeader[],
): Request {
  if (insertedHeaders.length === 0) {
    return request;
  }

  const headers = new Headers(request.headers);

  for (const header of insertedHeaders) {
    headers.set(header.name, header.value);
  }

  return new Request(request, { headers });
}
