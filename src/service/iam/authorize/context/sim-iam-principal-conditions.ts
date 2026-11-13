import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";
import type { SimIamAccountResolver } from "../../registry/sim-iam-account-resolver.js";
import {
  simIamRoleSessionConditions,
  simIamUserConditions,
  type SimIamPrincipalDirectory,
} from "./sim-iam-principal-entity-conditions.js";

type SimIamConditions = Readonly<Record<string, SimIamConditionValue>>;

interface SimIamPrincipalConditionsProperties extends SimIamPrincipalDirectory {
  readonly accountId: SimAwsAccountId;
  readonly iamResolver?: SimIamAccountResolver | undefined;
}

/**
 * The global condition values that describe who is making a request.
 *
 * AWS documents these per kind of caller.
 *
 * | Caller        | `aws:PrincipalType` | `aws:userid`            | `aws:username` |
 * | ------------- | ------------------- | ----------------------- | -------------- |
 * | Account root  | `Account`           | the Account id          | absent         |
 * | IAM User      | `User`              | the User's id           | the User name  |
 * | Role session  | `AssumedRole`       | Role id `:` session     | absent         |
 * | Anonymous     | `Anonymous`         | `anonymous`             | absent         |
 *
 * A User or a Role session also carries the tags of the User or the Role as
 * `aws:PrincipalTag/`, and every caller with an ARN carries its Account as
 * `aws:PrincipalAccount`. An anonymous caller's Account is `anonymous`.
 * `aws:PrincipalIsAWSService` says whether a service principal made a signed
 * request, and is absent from an anonymous one. A service principal names
 * itself in `aws:PrincipalServiceName`.
 *
 * A caller named by a Role's own ARN stands for a session of that Role. It is
 * described as an `AssumedRole` carrying the Role's tags, with no
 * `aws:userid`, because no session name is known for it.
 */
export class SimIamPrincipalConditions {
  constructor(
    private readonly properties: SimIamPrincipalConditionsProperties,
  ) {}

  /**
   * Describe the caller of one request.
   */
  of(caller: SimAwsResolvedCaller): SimIamConditions {
    const principal = caller.principal;

    if (principal.kind === "service") {
      return {
        "aws:PrincipalIsAWSService": "true",
        "aws:PrincipalServiceName": principal.service,
      };
    }

    if (principal.kind === "anonymous") {
      return {
        "aws:PrincipalAccount": "anonymous",
        "aws:PrincipalType": "Anonymous",
        "aws:userid": "anonymous",
      };
    }

    return {
      "aws:PrincipalIsAWSService": "false",
      ...this.arnCaller(principal.arn),
    };
  }

  /**
   * Describe a caller named by an ARN.
   */
  private arnCaller(arn: string): SimIamConditions {
    const parts = arn.split(":");
    const accountId = parts[4] ?? "";
    const [kind = "", ...segments] = parts.slice(5).join(":").split("/");
    const account = { "aws:PrincipalAccount": accountId };
    const directory = this.directoryFor(accountId as SimAwsAccountId);

    if (kind === "root") {
      return {
        ...account,
        "aws:PrincipalType": "Account",
        "aws:userid": accountId,
      };
    }

    if (kind === "user") {
      return {
        ...account,
        ...simIamUserConditions(directory, segments.at(-1)),
      };
    }

    if (kind === "assumed-role") {
      const [roleName, sessionName = ""] = segments;

      return {
        ...account,
        ...simIamRoleSessionConditions(directory, roleName, sessionName),
      };
    }

    if (kind === "role") {
      return {
        ...account,
        ...simIamRoleSessionConditions(directory, segments.at(-1)),
      };
    }

    return account;
  }

  /**
   * The Roles and Users of the caller's Account, wherever that Account is.
   */
  private directoryFor(
    accountId: SimAwsAccountId,
  ): SimIamPrincipalDirectory | undefined {
    if (accountId === this.properties.accountId) {
      return this.properties;
    }

    return this.properties.iamResolver?.findIamForAccount(accountId);
  }
}
