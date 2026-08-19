import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
  SimCfnDynamicReferenceResolver,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import { SimSsmParameterVersionNotFound } from "../../error/sim-ssm.error.js";
import type { SimSsmParameter } from "../../parameter/sim-ssm-parameter.js";
import type { SimSsm } from "../../sim-ssm.js";
import { parseSimCfnSsmReferenceBody } from "./sim-cfn-ssm-reference-body.js";
import { simCfnSsmReferenceStandIn } from "./sim-cfn-ssm-reference-stand-in.js";

interface SimCfnSsmDynamicReferenceResolverProperties {
  readonly ssm: SimSsm;
}

/**
 * Answers `{{resolve:ssm:...}}` references from the simulated Parameter Store.
 *
 * A reference is read as the caller deploying the Stack would read it, at the
 * point the Resource holding it is created. Real CloudFormation makes no
 * dependency out of a dynamic reference, so a parameter another Resource of
 * the same Stack creates is only there in time if the template says
 * `DependsOn`.
 *
 * Anything Parameter Store cannot answer becomes a stand-in value carrying a
 * reason. A template naming parameters a test never created still deploys, and
 * the Resource records what it was given instead.
 */
export class SimCfnSsmDynamicReferenceResolver implements SimCfnDynamicReferenceResolver {
  private readonly ssm: SimSsm;

  constructor(properties: SimCfnSsmDynamicReferenceResolverProperties) {
    this.ssm = properties.ssm;
  }

  /**
   * Resolve one reference to the parameter value it names.
   */
  resolve(reference: SimCfnDynamicReference): SimCfnDynamicReferenceResolution {
    const parsed = parseSimCfnSsmReferenceBody(reference.body);

    if (parsed === undefined) {
      return simCfnSsmReferenceStandIn(
        reference,
        reference.body,
        `which is not the parameter name, optionally followed by an integer ` +
          `version, that an ssm dynamic reference takes`,
      );
    }

    const { name, version } = parsed;
    const parameter = this.ssm.findParameter(name);

    if (parameter === undefined) {
      return simCfnSsmReferenceStandIn(
        reference,
        name,
        `and simulated Parameter Store holds no parameter '${name}'`,
      );
    }

    if (parameter.type.value === "SecureString") {
      return simCfnSsmReferenceStandIn(
        reference,
        name,
        `and '${name}' is a SecureString, which real CloudFormation reads ` +
          `through an ssm-secure reference`,
      );
    }

    return this.parameterValue(reference, parameter, name, version);
  }

  /**
   * Read the version the reference selects, or the current one.
   */
  private parameterValue(
    reference: SimCfnDynamicReference,
    parameter: SimSsmParameter,
    name: string,
    version: string | undefined,
  ): SimCfnDynamicReferenceResolution {
    if (version === undefined) {
      return { value: parameter.currentVersion.value.value };
    }

    try {
      return { value: parameter.versionNumbered(Number(version)).value.value };
    } catch (error) {
      /* v8 ignore next 3 -- defensive: only a missing version reaches here */
      if (!(error instanceof SimSsmParameterVersionNotFound)) {
        throw error;
      }

      return simCfnSsmReferenceStandIn(
        reference,
        name,
        `and '${name}' has no version ${version}`,
      );
    }
  }
}
