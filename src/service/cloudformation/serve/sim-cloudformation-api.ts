import type { SimAws } from "../../aws/sim-aws.js";
import { SimQueryApiEndpoint } from "../../../serve/http/api/query/sim-query-endpoint.js";
import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryList,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";
import type { SimQueryFields } from "../../../serve/http/api/query/sim-query-request.js";
import { simCfnChangeSetQueryOperations } from "./sim-cloudformation-change-set-api.js";

/**
 * The XML namespace real CloudFormation stamps on every response it sends.
 */
const cloudFormationNamespace =
  "http://cloudformation.amazonaws.com/doc/2010-05-15/";

/**
 * The members CloudFormation describes one Stack Output with.
 */
const stackOutputMembers = [
  "OutputKey",
  "OutputValue",
  "Description",
  "ExportName",
];

/**
 * Serve the CloudFormation Query API to a client given an endpoint URL.
 *
 * The operations served are the Stack operations simulated CloudFormation
 * implements, `CreateStack`, `UpdateStack`, `DeleteStack` and `DescribeStacks`,
 * together with the five change set operations. Anything else is refused as
 * `NotImplemented`.
 */
export function simCloudFormationApiEndpoint(
  simAws: SimAws,
): SimQueryApiEndpoint {
  return new SimQueryApiEndpoint({
    simAws,
    serviceId: "CloudFormation",
    namespace: cloudFormationNamespace,
    operations: simCloudFormationQueryOperations(),
  });
}

function simCloudFormationQueryOperations(): SimQueryOperations {
  return new Map([
    ...simCfnChangeSetQueryOperations(),
    [
      "CreateStack",
      {
        input: deploymentInput,
        result: (output): string => queryMembers(output, ["StackId"]),
      },
    ],
    [
      "UpdateStack",
      {
        input: deploymentInput,
        result: (output): string => queryMembers(output, ["StackId"]),
      },
    ],
    [
      "DeleteStack",
      {
        input: (fields): Record<string, unknown> => ({
          StackName: fields.text("StackName"),
        }),
        result: (): string => "",
      },
    ],
    [
      "DescribeStacks",
      {
        input: (fields): Record<string, unknown> => ({
          StackName: fields.text("StackName"),
        }),
        result: (output): string =>
          queryList(
            output,
            "Stacks",
            (stack) =>
              queryMembers(stack, [
                "StackId",
                "StackName",
                "StackStatus",
                "StackStatusReason",
              ]) +
              queryList(stack, "Outputs", (stackOutput) =>
                queryMembers(stackOutput, stackOutputMembers),
              ),
          ),
      },
    ],
  ]);
}

/**
 * The input CreateStack and UpdateStack share. Both send the same request, a
 * template and the parameters to deploy it with.
 */
function deploymentInput(fields: SimQueryFields): Record<string, unknown> {
  return {
    StackName: fields.text("StackName"),
    TemplateBody: fields.text("TemplateBody"),
    Parameters: fields.list("Parameters", (parameter) => ({
      ParameterKey: parameter.text("ParameterKey"),
      ParameterValue: parameter.text("ParameterValue"),
    })),
  };
}
