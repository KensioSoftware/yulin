import { simWafBlockedHttpResponse } from "../evaluate/sim-waf-blocked-response.js";
import type { SimWafHeader } from "../web-acl/sim-waf-custom-response.type.js";
import type { SimWafProtection } from "./sim-waf-protection.js";

interface SimWafInspectionInput {
  /** The web ACLs the fronting service's resources are protected by. */
  readonly protection: SimWafProtection;

  /** The resource the request reached, by ARN. */
  readonly resourceArn: string;

  readonly request: Request;

  /**
   * Whether the fronting service forwards the request body to AWS WAF.
   *
   * API Gateway forwards it. Cognito forwards it for the user pool API and not
   * for managed login, so a rule inspecting the body of a hosted domain
   * request matches nothing, as it matches nothing on AWS.
   */
  readonly forwardBody: boolean;
}

interface SimWafInspectedProperties {
  readonly request: Request;
  readonly blocked?: Response | undefined;
}

/**
 * What the web ACL in front of a resource left of one request.
 *
 * A blocked request has a response to send and goes no further. An allowed one
 * carries on, as the request the rules asked for rather than the one that
 * arrived, since a rule can add headers to what is forwarded.
 */
export class SimWafInspected {
  public readonly request: Request;
  public readonly blocked: Response | undefined;

  constructor(properties: SimWafInspectedProperties) {
    this.request = properties.request;
    this.blocked = properties.blocked;
  }
}

/**
 * Puts a served request to the web ACL in front of the resource it reached.
 *
 * This is the serving half of an association, shared by every service that
 * answers HTTP requests for a protected resource. What differs between them is
 * where the resource ARN comes from and whether the body is forwarded, so both
 * are asked for rather than worked out here.
 */
export class SimWafRequestInspection {
  /**
   * Put one request to whatever protects the resource it addressed.
   */
  async inspect(input: SimWafInspectionInput): Promise<SimWafInspected> {
    const { protection, resourceArn, request } = input;

    if (!protection.protects(resourceArn)) {
      return new SimWafInspected({ request });
    }

    const body = input.forwardBody ? await inspectedBody(request) : undefined;
    const decision = protection.decide({ resourceArn, request, body });

    // A decision carries a blocked response when its action was to block, and
    // carries none when the request was allowed. That one reading is what
    // decides the request here.
    if (decision?.blocked !== undefined) {
      return new SimWafInspected({
        request,
        blocked: simWafBlockedHttpResponse(decision.blocked),
      });
    }

    return new SimWafInspected({
      request: forwarded(request, decision?.insertedHeaders ?? []),
    });
  }
}

/**
 * The request body a web ACL's rules are matched against.
 *
 * The request is cloned rather than read, so whatever the request goes on to
 * reach still has a body to send.
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
 * A rule with custom request handling adds headers to what reaches the origin.
 * Only the headers are replaced, so the body carries over as the stream it
 * arrived as: inspection read a clone of it rather than the request itself.
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
