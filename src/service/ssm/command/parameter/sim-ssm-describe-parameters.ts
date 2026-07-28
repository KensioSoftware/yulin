import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type {
  SimDescribeParametersCommand,
  SimDescribeParametersCommandInput,
  SimDescribeParametersCommandOutput,
} from "./query.command.js";
import { SimSsmParameterPage } from "./sim-ssm-parameter-page.js";
import { SimSsmParameterView } from "./sim-ssm-parameter-view.js";

/**
 * The page size real Parameter Store uses for a describe listing.
 */
const maxResults = 50;

interface SimSsmDescribeParametersProperties {
  readonly parameters: SimSsmParameterStore;
  readonly authorizer: SimSsmAuthorizer;
}

interface SimSsmDescribeParametersOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The DescribeParameters command.
 *
 * Real Parameter Store gives this action no resource-level permissions, so it
 * authorizes against `*` rather than against each parameter, and it does not
 * filter the listing by what the caller may read. A policy naming individual
 * parameter ARNs therefore grants nothing here, which is what it grants on
 * real AWS.
 *
 * Values are never reported: this is the metadata listing, and reading a
 * value takes GetParameter and its own permission.
 */
export class SimSsmDescribeParameters {
  private readonly parameters: SimSsmParameterStore;
  private readonly authorizer: SimSsmAuthorizer;
  private readonly view = new SimSsmParameterView();

  constructor(properties: SimSsmDescribeParametersProperties) {
    this.parameters = properties.parameters;
    this.authorizer = properties.authorizer;
  }

  /**
   * List the parameters in this scope, without their values.
   */
  handle(
    command: SimDescribeParametersCommand,
    options?: SimSsmDescribeParametersOptions,
  ): SimDescribeParametersCommandOutput {
    const input = command.input ?? {};

    this.refuseUnsimulatedInput(input);
    this.authorizer.authorizeAny("ssm:DescribeParameters", options?.caller);

    const page = new SimSsmParameterPage(this.parameters.allByName, input, {
      operation: "DescribeParameters",
      maxResults,
    });

    return {
      $metadata: {},
      Parameters: page.items.map((parameter) => this.view.metadata(parameter)),
      NextToken: page.nextToken,
    };
  }

  /**
   * Refuse the request inputs this simulation does not model.
   *
   * Ignoring a filter would list more parameters than real Parameter Store
   * lists, which is the kind of divergence that makes a passing test mean
   * nothing.
   */
  private refuseUnsimulatedInput(
    input: SimDescribeParametersCommandInput,
  ): void {
    if (input.Filters !== undefined || input.ParameterFilters !== undefined) {
      throw new SimSsmValidationException(
        "DescribeParameters Filters and ParameterFilters are not simulated: " +
          "parameters are listed in name order",
      );
    }

    if (input.Shared !== undefined) {
      throw new SimSsmValidationException(
        "DescribeParameters Shared is not simulated: parameters cannot be " +
          "shared between simulated Accounts",
      );
    }
  }
}
