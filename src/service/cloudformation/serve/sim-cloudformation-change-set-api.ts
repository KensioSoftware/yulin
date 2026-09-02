import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryList,
  queryMembers,
  queryStructure,
  type SimQueryOutput,
} from "../../../serve/http/api/query/sim-query-result.js";
import type { SimQueryFields } from "../../../serve/http/api/query/sim-query-request.js";

/**
 * The members CloudFormation describes one change set with.
 */
const changeSetMembers = [
  "ChangeSetId",
  "ChangeSetName",
  "StackId",
  "StackName",
  "Description",
  "Status",
  "StatusReason",
  "ExecutionStatus",
];

/**
 * The members CloudFormation summarises one change set with in ListChangeSets.
 */
const changeSetSummaryMembers = [
  "ChangeSetId",
  "ChangeSetName",
  "StackId",
  "StackName",
  "Description",
  "Status",
  "StatusReason",
  "ExecutionStatus",
];

/**
 * The members CloudFormation describes one Resource change with.
 */
const resourceChangeMembers = [
  "Action",
  "LogicalResourceId",
  "ResourceType",
  "Replacement",
];

/**
 * The change set half of the CloudFormation Query API.
 *
 * Held apart from the Stack operations because the two halves share nothing
 * but the service they belong to. Every operation here reaches the same Command
 * an SDK caller sends, so a CLI deployment runs the code an in-process caller
 * runs.
 */
export function simCfnChangeSetQueryOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateChangeSet",
      {
        input: (fields: SimQueryFields): Record<string, unknown> => ({
          StackName: fields.text("StackName"),
          ChangeSetName: fields.text("ChangeSetName"),
          ChangeSetType: fields.text("ChangeSetType"),
          Description: fields.text("Description"),
          TemplateBody: fields.text("TemplateBody"),
          Parameters: fields.list("Parameters", (parameter) => ({
            ParameterKey: parameter.text("ParameterKey"),
            ParameterValue: parameter.text("ParameterValue"),
          })),
        }),
        result: (output: SimQueryOutput): string =>
          queryMembers(output, ["Id", "StackId"]),
      },
    ],
    [
      "DescribeChangeSet",
      {
        input: changeSetInput,
        result: (output: SimQueryOutput): string =>
          queryMembers(output, changeSetMembers) +
          queryList(
            output,
            "Changes",
            (change) =>
              queryMembers(change, ["Type"]) +
              queryStructure(change, "ResourceChange", (resourceChange) =>
                queryMembers(resourceChange, resourceChangeMembers),
              ),
          ),
      },
    ],
    ["ExecuteChangeSet", { input: changeSetInput, result: (): string => "" }],
    ["DeleteChangeSet", { input: changeSetInput, result: (): string => "" }],
    [
      "ListChangeSets",
      {
        input: (fields: SimQueryFields): Record<string, unknown> => ({
          StackName: fields.text("StackName"),
        }),
        result: (output: SimQueryOutput): string =>
          queryList(output, "Summaries", (summary) =>
            queryMembers(summary, changeSetSummaryMembers),
          ),
      },
    ],
  ]);
}

/**
 * The input every operation naming one change set sends.
 */
function changeSetInput(fields: SimQueryFields): Record<string, unknown> {
  return {
    StackName: fields.text("StackName"),
    ChangeSetName: fields.text("ChangeSetName"),
  };
}
