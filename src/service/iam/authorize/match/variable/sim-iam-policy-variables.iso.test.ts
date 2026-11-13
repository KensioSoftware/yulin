/* oxlint-disable no-template-curly-in-string -- IAM policy variable syntax, not JavaScript templates. */
import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../sim-iam.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentStatement,
} from "../../../policy/sim-iam-policy.js";

interface Request {
  readonly resource?: string;
  readonly context?: Readonly<Record<string, SimIamConditionValue>>;
}

/**
 * Whether a resource policy holding one statement allows an anonymous read,
 * with the statement's Principal and Action filled in.
 */
function allowed(
  statement: Partial<SimIamPolicyDocumentStatement>,
  request: Request = {},
  version = "2012-10-17",
): boolean {
  return new SimIam().authorize({
    action: "s3:GetObject",
    resource: request.resource ?? "arn:aws:s3:::reports/blue/summary.csv",
    caller: { kind: "anonymous" },
    conditionContext: request.context ?? {},
    resourcePolicies: [
      {
        document: {
          Version: version,
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "*",
            ...statement,
          },
        },
      },
    ],
  }).isAllowed;
}

const team = { "aws:RequestTag/team": "blue" };

describe("sim IAM policy variables in Resource", () => {
  it("replaces a variable with the request's value", () => {
    // Given a read allowed under the requesting team's prefix
    const statement = {
      Resource: "arn:aws:s3:::reports/${aws:RequestTag/team}/*",
    };

    // When the blue team reads its own prefix and the red team's
    // Then only its own prefix is allowed
    assertTrue(allowed(statement, { context: team }));
    assertFalse(
      allowed(statement, {
        context: team,
        resource: "arn:aws:s3:::reports/red/summary.csv",
      }),
    );
  });

  it("reads variables as literal text under the 2008-10-17 Version", () => {
    // Given the same statement in a policy written in the older language
    const statement = {
      Resource: "arn:aws:s3:::reports/${aws:RequestTag/team}/*",
    };

    // When the blue team reads its prefix
    // Then the variable is not replaced, and only the literal path matches
    assertFalse(allowed(statement, { context: team }, "2008-10-17"));
    assertTrue(
      allowed(
        statement,
        {
          context: team,
          resource: "arn:aws:s3:::reports/${aws:RequestTag/team}/summary.csv",
        },
        "2008-10-17",
      ),
    );
  });

  it("matches no resource where a variable has no value", () => {
    // Given a read allowed under a prefix named by a tag the request lacks
    const statement = {
      Resource: "arn:aws:s3:::reports/${aws:RequestTag/team}*",
    };

    // When a request with no team tag reads anything
    // Then the Resource matches nothing
    assertFalse(allowed(statement));
  });

  it("excludes nothing through a NotResource whose variable has no value", () => {
    // Given a read allowed everywhere outside a prefix named by a missing tag
    const statement = {
      Resource: undefined,
      NotResource: "arn:aws:s3:::reports/${aws:RequestTag/team}/*",
    };

    // When a request with no team tag reads under the reports prefix
    // Then the NotResource entry matches no resource, and so excludes none
    assertTrue(allowed(statement));
    assertFalse(allowed(statement, { context: team }));
  });

  it("uses the default where the key has no value", () => {
    // Given a read allowed under the requesting team's prefix, or `shared`
    const statement = {
      Resource: "arn:aws:s3:::reports/${aws:RequestTag/team, 'shared'}/*",
    };
    const shared = { resource: "arn:aws:s3:::reports/shared/summary.csv" };

    // When requests with and without a team tag read the shared prefix
    // Then only the untagged request falls back to it
    assertTrue(allowed(statement, shared));
    assertFalse(allowed(statement, { ...shared, context: team }));
  });

  it("ignores a default written without quotes", () => {
    // Given a default left unquoted
    const statement = {
      Resource: "arn:aws:s3:::reports/${aws:RequestTag/team, shared}/*",
    };

    // When a request with no team tag reads the shared prefix
    // Then the variable has no value and the Resource matches nothing
    assertFalse(
      allowed(statement, {
        resource: "arn:aws:s3:::reports/shared/summary.csv",
      }),
    );
  });

  it("replaces nothing before the fifth colon", () => {
    // Given a variable standing in for the service of an ARN
    const statement = {
      Resource: "arn:aws:${aws:RequestTag/service}:::reports/*",
    };

    // When the request names that service
    // Then the variable stays literal text and matches nothing
    assertFalse(
      allowed(statement, { context: { "aws:RequestTag/service": "s3" } }),
    );
  });

  it("reads a key without regard to case", () => {
    // Given a variable naming the key in another case
    const statement = {
      Resource: "arn:aws:s3:::reports/${AWS:requesttag/TEAM}/*",
    };

    // When the blue team reads its prefix
    // Then the key is found
    assertTrue(allowed(statement, { context: team }));
  });

  it("gives a list-valued key no value", () => {
    // Given a variable naming a key the request carries a list for
    const statement = { Resource: "arn:aws:s3:::reports/${aws:TagKeys}/*" };

    // When the request reads under the first key's prefix
    // Then the multivalued key has no value to replace the variable with
    assertFalse(
      allowed(statement, {
        context: { "aws:TagKeys": ["blue"] },
      }),
    );
  });

  it("leaves an unclosed variable as literal text", () => {
    // Given a pattern opening a variable it never closes
    const statement = { Resource: "arn:aws:s3:::reports/${blue/*" };

    // When the literal path is read
    // Then it matches as written
    assertTrue(
      allowed(statement, {
        resource: "arn:aws:s3:::reports/${blue/summary.csv",
      }),
    );
  });
});

describe("sim IAM policy variables in conditions", () => {
  it("replaces a variable in a StringEquals value", () => {
    // Given a read allowed where the object's owner tag is the requester's team
    const statement = {
      Condition: {
        StringEquals: {
          "s3:ExistingObjectTag/owner": "${aws:RequestTag/team}",
        },
      },
    };

    // When the blue team reads its own object and the red team's
    // Then only its own object is allowed
    assertTrue(
      allowed(statement, {
        context: { ...team, "s3:ExistingObjectTag/owner": "blue" },
      }),
    );
    assertFalse(
      allowed(statement, {
        context: { ...team, "s3:ExistingObjectTag/owner": "red" },
      }),
    );
  });

  it("fails a positive operator and matches a negated one where the variable has no value", () => {
    // Given conditions comparing the owner tag with a team tag the request lacks
    const context = { "s3:ExistingObjectTag/owner": "blue" };
    const compare = (keyword: string): boolean =>
      allowed(
        {
          Condition: {
            [keyword]: {
              "s3:ExistingObjectTag/owner": "${aws:RequestTag/team}",
            },
          },
        },
        { context },
      );

    // When the conditions are read
    // Then the missing value equals nothing, and differs from everything
    assertFalse(compare("StringEquals"));
    assertFalse(compare("StringLike"));
    assertTrue(compare("StringNotEquals"));
    assertTrue(compare("StringNotLike"));
  });

  it("matches a literal asterisk with ${*} under StringLike", () => {
    // Given a prefix condition asking for a literal asterisk
    const statement = {
      Condition: { StringLike: { "s3:prefix": "reports/${*}" } },
    };

    // When requests list the asterisk prefix and another
    // Then only the asterisk matches
    assertTrue(allowed(statement, { context: { "s3:prefix": "reports/*" } }));
    assertFalse(
      allowed(statement, { context: { "s3:prefix": "reports/blue" } }),
    );
  });

  it("reads a replaced value literally under StringLike", () => {
    // Given a prefix condition built from a tag whose value holds wildcards
    const statement = {
      Condition: {
        StringLike: { "s3:prefix": "${aws:RequestTag/team}/*" },
      },
    };
    const context = { "aws:RequestTag/team": "b?u*" };

    // When the request lists a prefix the wildcards would otherwise match
    // Then the value's characters match only themselves
    assertFalse(
      allowed(statement, { context: { ...context, "s3:prefix": "blue/x" } }),
    );
    assertTrue(
      allowed(statement, { context: { ...context, "s3:prefix": "b?u*/x" } }),
    );
  });

  it("replaces ${?} and ${$} with the characters they name", () => {
    // Given an exact condition built from the two special variables
    const statement = {
      Condition: { StringEquals: { "s3:prefix": "${?}${$}${*}" } },
    };

    // When the request carries those three characters
    // Then they are equal
    assertTrue(allowed(statement, { context: { "s3:prefix": "?$*" } }));
  });

  it("replaces a variable in an ArnLike value", () => {
    // Given a source ARN condition naming the requester's team
    const statement = {
      Condition: {
        ArnLike: {
          "aws:SourceArn": "arn:aws:sns:*:*:${aws:RequestTag/team}-*",
        },
      },
    };
    const source = "arn:aws:sns:eu-west-2:111122223333:blue-alerts";

    // When the blue and red teams send from the blue topic
    // Then only the blue team matches
    assertTrue(
      allowed(statement, { context: { ...team, "aws:SourceArn": source } }),
    );
    assertFalse(
      allowed(statement, {
        context: { "aws:RequestTag/team": "red", "aws:SourceArn": source },
      }),
    );
  });

  it("leaves a variable under a numeric operator as literal text", () => {
    // Given a numeric condition whose value is a variable
    const statement = {
      Condition: {
        NumericEquals: { "s3:max-keys": "${aws:RequestTag/limit}" },
      },
    };

    // When the request's limit equals the key
    // Then the variable is not a number, and the condition fails
    assertFalse(
      allowed(statement, {
        context: { "aws:RequestTag/limit": "10", "s3:max-keys": "10" },
      }),
    );
  });
});
