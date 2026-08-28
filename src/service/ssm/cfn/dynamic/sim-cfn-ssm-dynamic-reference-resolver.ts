import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  simCfnResourceCallerOptions,
  type SimCfnResourceCallerOptions,
} from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
  SimCfnDynamicReferenceResolver,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import type { SimSsmParameterOutput } from "../../command/parameter/parameter.command.js";
import { SimSsmError } from "../../error/sim-ssm.error.js";
import type { SimSsm } from "../../sim-ssm.js";
import { parseSimCfnSsmReferenceBody } from "./sim-cfn-ssm-reference-body.js";
import { simCfnSsmReferenceStandIn } from "./sim-cfn-ssm-reference-stand-in.js";

/** The parameter type a plain `ssm` reference leaves to `ssm-secure`. */
const secureString = "SecureString";

interface SimCfnSsmDynamicReferenceResolverProperties {
  readonly ssm: SimSsm;

  /** The principal the deployment runs as, which the parameter is read as. */
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Answers `{{resolve:ssm:...}}` references from the simulated Parameter Store.
 *
 * The parameter is read the way `GetParameter` reads it, as the principal the
 * deployment names, so a caller that may not read it is denied here and the
 * Resource fails. That is the failure a real deployment hits, where the read
 * runs under the Stack's execution role. A deployment naming no principal
 * reads as the Account root, which is Parameter Store's own default. Reading
 * through the Command means waiting on it, so the answer comes back as a
 * promise for the CloudFormation engine to wait on.
 *
 * A reference is read at the point the Resource holding it is created. Real
 * CloudFormation makes no dependency out of a dynamic reference, so a
 * parameter another Resource of the same Stack creates is only there in time
 * if the template says `DependsOn`.
 *
 * Anything Parameter Store cannot answer becomes a stand-in value carrying a
 * reason. A template naming parameters a test never created still deploys, and
 * the Resource records what it was given instead.
 */
export class SimCfnSsmDynamicReferenceResolver implements SimCfnDynamicReferenceResolver {
  private readonly ssm: SimSsm;

  private readonly callerOptions: SimCfnResourceCallerOptions;

  constructor(properties: SimCfnSsmDynamicReferenceResolverProperties) {
    this.ssm = properties.ssm;
    this.callerOptions = simCfnResourceCallerOptions(properties.caller);
  }

  /**
   * Resolve one reference to the parameter value it names.
   */
  resolve(
    reference: SimCfnDynamicReference,
  ):
    | SimCfnDynamicReferenceResolution
    | Promise<SimCfnDynamicReferenceResolution> {
    const parsed = parseSimCfnSsmReferenceBody(reference.body);

    if (parsed === undefined) {
      return simCfnSsmReferenceStandIn(
        reference,
        reference.body,
        `which is not the parameter name, optionally followed by an integer ` +
          `version, that an ssm dynamic reference takes`,
      );
    }

    return this.parameterValue(reference, parsed.name, parsed.version);
  }

  /**
   * Read the version the reference selects, or the current one.
   */
  private async parameterValue(
    reference: SimCfnDynamicReference,
    name: string,
    version: string | undefined,
  ): Promise<SimCfnDynamicReferenceResolution> {
    const selector = version === undefined ? name : `${name}:${version}`;

    try {
      const read = await this.ssm.getParameter(
        { input: { Name: selector } },
        this.callerOptions,
      );

      assertDefined(read.Parameter, `the parameter read for '${name}'`);

      return this.readValue(reference, name, read.Parameter);
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

  /**
   * The value the read reports, unless it is a ciphertext this reference has
   * no business handing to a Resource.
   */
  private readValue(
    reference: SimCfnDynamicReference,
    name: string,
    parameter: SimSsmParameterOutput,
  ): SimCfnDynamicReferenceResolution {
    if (parameter.Type === secureString) {
      return simCfnSsmReferenceStandIn(
        reference,
        name,
        `and '${name}' is a SecureString, which real CloudFormation reads ` +
          `through an ssm-secure reference`,
      );
    }

    assertDefined(parameter.Value, `the value read for '${name}'`);

    return { value: parameter.Value };
  }
}
