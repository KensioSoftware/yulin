import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
  SimCfnDynamicReferenceResolver,
  SimCfnDynamicReferenceSite,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import { SimSsmError } from "../../error/sim-ssm.error.js";
import type { SimSsm } from "../../sim-ssm.js";
import { parseSimCfnSsmReferenceBody } from "./sim-cfn-ssm-reference-body.js";
import { simCfnSsmReferenceStandIn } from "./sim-cfn-ssm-reference-stand-in.js";
import {
  requireSecureStringParameter,
  requireSsmSecureReferenceProperty,
} from "./sim-cfn-ssm-secure-refusals.js";

interface SimCfnSsmSecureDynamicReferenceResolverProperties {
  readonly ssm: SimSsm;
}

/**
 * Answers `{{resolve:ssm-secure:...}}` references from the simulated Parameter
 * Store.
 *
 * The parameter is read the way `GetParameter` with `WithDecryption` reads it,
 * as the caller deploying the Stack, so the value comes back decrypted through
 * the simulated KMS key it was written under. A caller the key does not admit
 * is denied here, which is the failure a real deployment hits. Decrypting
 * cannot be done synchronously, so the answer comes back as a promise for the
 * CloudFormation engine to wait on.
 *
 * A reference the template had no business writing fails the Resource, which
 * `sim-cfn-ssm-secure-refusals.ts` holds the rules for. Everything else
 * Parameter Store cannot answer becomes a stand-in value carrying a reason. A
 * template naming parameters a test never created still deploys, and the
 * Resource records what it was given instead.
 */
export class SimCfnSsmSecureDynamicReferenceResolver implements SimCfnDynamicReferenceResolver {
  private readonly ssm: SimSsm;

  constructor(properties: SimCfnSsmSecureDynamicReferenceResolverProperties) {
    this.ssm = properties.ssm;
  }

  /**
   * Resolve one reference to the decrypted parameter value it names.
   *
   * Where the reference sits is checked before anything is read, so a template
   * writing one somewhere CloudFormation refuses it fails without a parameter
   * being touched.
   */
  resolve(
    reference: SimCfnDynamicReference,
    site: SimCfnDynamicReferenceSite,
  ):
    | SimCfnDynamicReferenceResolution
    | Promise<SimCfnDynamicReferenceResolution> {
    requireSsmSecureReferenceProperty(reference, site);

    const parsed = parseSimCfnSsmReferenceBody(reference.body);

    if (parsed === undefined) {
      return simCfnSsmReferenceStandIn(
        reference,
        reference.body,
        `which is not the parameter name, optionally followed by an integer ` +
          `version, that an ssm-secure dynamic reference takes`,
      );
    }

    return this.decrypted(reference, parsed.name, parsed.version);
  }

  /**
   * Read the version the reference selects, or the current one, decrypted.
   */
  private async decrypted(
    reference: SimCfnDynamicReference,
    name: string,
    version: string | undefined,
  ): Promise<SimCfnDynamicReferenceResolution> {
    const selector = version === undefined ? name : `${name}:${version}`;

    try {
      const read = await this.ssm.getParameter({
        input: { Name: selector, WithDecryption: true },
      });

      const parameter = read.Parameter;

      assertDefined(parameter, `the parameter read for '${name}'`);
      requireSecureStringParameter(name, parameter);
      assertDefined(parameter.Value, `the value read for '${name}'`);

      return { value: parameter.Value };
    } catch (error) {
      if (!(error instanceof SimSsmError)) {
        throw error;
      }

      return simCfnSsmReferenceStandIn(
        reference,
        name,
        `and simulated Parameter Store could not read it (${error.message})`,
      );
    }
  }
}
