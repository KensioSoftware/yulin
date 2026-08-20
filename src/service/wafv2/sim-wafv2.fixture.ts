import { assertDefined } from "../../util/type-guard/defined.js";
import { simWafCreateWebAclFactory } from "./command/web-acl/sim-waf-create-web-acl.factory.js";
import type {
  SimCreateWebAclCommandInput,
  SimWafSummaryOutput,
} from "./command/web-acl/web-acl.command.js";
import type { SimWafDecision } from "./evaluate/sim-waf-decision.js";
import type { SimWafStatementInput } from "./statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import type { SimWafV2 } from "./sim-wafv2.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

/**
 * Create a web ACL and answer with what CreateWebACL reported about it.
 *
 * The summary is where the generated id, the ARN and the first lock token
 * come from, and a test needs all three to do anything else with the web ACL.
 * CreateWebACL reports one for every web ACL it makes, so a test reading
 * around a missing summary would be writing around a simulator fault.
 */
export async function createSimWafWebAcl(
  simWaf: SimWafV2,
  input: SimCreateWebAclCommandInput,
): Promise<SimWafSummaryOutput> {
  const created = await simWaf.createWebAcl({ input });

  assertDefined(
    created.Summary,
    "Simulated WAFv2 created a web ACL and reported no summary for it",
  );

  return created.Summary;
}

/**
 * Whether one statement claims a request.
 */
export type SimWafStatementMatch = (
  request: Request,
  body?: Uint8Array,
) => boolean;

/**
 * Create a web ACL whose one rule blocks whatever a statement claims, and
 * answer with a way to ask that statement about a request.
 *
 * A test about one statement kind is about which requests that statement
 * claims, and the web ACL around it is the same every time: one rule, blocking,
 * over a default action of allow. A blocked request is then one the statement
 * matched, and an allowed one is a request it did not.
 */
export async function simWafStatementMatches(
  simWaf: SimWafV2,
  statement: SimWafStatementInput,
): Promise<SimWafStatementMatch> {
  const { ARN: webAclArn } = await createSimWafWebAcl(
    simWaf,
    simWafCreateWebAclFactory.make({
      Rules: [{ ...simWafRuleFactory.make(), Statement: statement }],
    }),
  );

  return (request, body): boolean =>
    simWaf.evaluateRequest({ webAclArn, request, body }).action === "BLOCK";
}

/**
 * What a web ACL decided about one request.
 */
export type SimWafRequestDecision = (
  request: Request,
  body?: Uint8Array,
) => SimWafDecision;

/**
 * Create a web ACL holding some rules, and answer with a way to put requests
 * through it.
 *
 * This is `simWafStatementMatches` for a test that wants the whole decision
 * rather than whether one statement claimed the request: which rule decided,
 * which rules counted, and what labels the request came away with.
 */
export async function simWafWebAclDecisions(
  simWaf: SimWafV2,
  rules: readonly SimWafRuleInput[],
  webAcl: Partial<SimCreateWebAclCommandInput> = {},
): Promise<SimWafRequestDecision> {
  const { ARN: webAclArn } = await createSimWafWebAcl(simWaf, {
    ...simWafCreateWebAclFactory.make(),
    ...webAcl,
    Rules: rules,
  });

  return (request, body): SimWafDecision =>
    simWaf.evaluateRequest({ webAclArn, request, body });
}

/**
 * A request the core rule set does not claim on sight.
 *
 * `NoUserAgent_HEADER` blocks a request that sends no User-Agent header, and
 * nothing here sends one unless it is asked to, so a test about any other rule
 * makes its requests with this.
 */
export function simWafBrowserRequest(
  url: string,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);

  if (!headers.has("user-agent")) {
    headers.set("user-agent", browserUserAgent);
  }

  return new Request(url, { ...init, headers });
}

const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
