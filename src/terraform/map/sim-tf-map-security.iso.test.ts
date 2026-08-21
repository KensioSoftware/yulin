import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { terraformPlanResourceFactory } from "../../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../../test/terraform/plan/terraform-mapping-context.js";
import { kmsAlias, kmsKey } from "./sim-tf-map-kms.js";
import { cognitoUserPool } from "./sim-tf-map-cognito.js";
import { cognitoUserPoolClient } from "./sim-tf-map-cognito-client.js";

describe("mapping a KMS key", () => {
  it("carries the key spec under the name CloudFormation gives it", () => {
    // Given a key stating the spec, the usage and whether it is enabled, which
    // Terraform names differently from CloudFormation in all three places
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_kms_key",
          name: "app",
          values: {
            description: "Application data key",
            customer_master_key_spec: "SYMMETRIC_DEFAULT",
            key_usage: "ENCRYPT_DECRYPT",
            is_enabled: true,
          },
        }),
      ],
    });

    // When it is mapped
    // Then each one arrives under the CloudFormation name for it
    assertObjectEquals(kmsKey(context).Properties, {
      Description: "Application data key",
      KeySpec: "SYMMETRIC_DEFAULT",
      KeyUsage: "ENCRYPT_DECRYPT",
      Enabled: true,
    });
  });

  it("records a key policy the plan could not build", () => {
    // Given a key whose policy was written with jsonencode around an ARN of
    // the same plan, so the whole string stayed unknown
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_kms_key",
          name: "app",
          values: { description: "Application data key" },
          unknown: { policy: true },
          references: { policy: ["aws_iam_role.processor.arn"] },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_iam_role",
          name: "processor",
          values: { name: "processor" },
        }),
      ],
    });
    const mapped = kmsKey(context);

    // When it is mapped
    // Then no policy is sent, since the reference behind it resolves to an ARN
    // rather than to a document, and the attribute is recorded
    assertUndefined(mapped.Properties["KeyPolicy"]);
    assertArrayEquals(mapped.lost ?? [], ["policy"]);
  });

  it("says nothing about the policy KMS writes for a key that states none", () => {
    // Given a key with no policy of its own, which the plan marks unknown
    // because KMS is the one that writes the default
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_kms_key",
          name: "app",
          values: {},
          unknown: { policy: true },
        }),
      ],
    });

    // When it is mapped
    // Then nothing is recorded as lost: a key created here without a policy
    // gets the same root delegation a deployed one gets
    assertArrayEquals(kmsKey(context).lost ?? [], []);
  });

  it("requires the key an alias points at", () => {
    // Given an alias whose target the template does not declare
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_kms_alias",
          name: "app",
          values: { name: "alias/orders" },
          unknown: { target_key_id: true },
        }),
      ],
    });
    const mapped = kmsAlias(context);

    // When it is mapped
    // Then the target is named as required, so settling leaves the alias out
    // rather than deploying one pointing at nothing
    assertArrayEquals(mapped.requires ?? [], ["AliasName", "TargetKeyId"]);
    assertUndefined(mapped.Properties["TargetKeyId"]);
  });
});

describe("mapping a Cognito user pool", () => {
  it("nests the password policy where CloudFormation holds it", () => {
    // Given a pool whose password policy states three of its fields and
    // leaves the rest as the nulls the provider writes for them
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cognito_user_pool",
          name: "users",
          values: {
            name: "orders-users",
            password_policy: [
              {
                minimum_length: 12,
                require_numbers: true,
                require_uppercase: true,
                require_lowercase: null,
                require_symbols: false,
                password_history_size: null,
                temporary_password_validity_days: null,
              },
            ],
          },
        }),
      ],
    });

    // When it is mapped
    // Then the fields the configuration stated are under Policies, and the
    // nulls are gone rather than sent as values the pool never asked for
    assertObjectEquals(cognitoUserPool(context).Properties["Policies"], {
      PasswordPolicy: {
        MinimumLength: 12,
        RequireNumbers: true,
        RequireUppercase: true,
        RequireSymbols: false,
      },
    });
  });

  it("carries the pool's tags as the map CloudFormation takes", () => {
    // Given a tagged pool. UserPoolTags is a map, where almost every other
    // CloudFormation Resource takes a list of key and value pairs
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cognito_user_pool",
          name: "users",
          values: {
            name: "orders-users",
            tags_all: { Application: "orders" },
          },
        }),
      ],
    });

    // When it is mapped
    // Then the tags arrive as a map
    assertObjectEquals(cognitoUserPool(context).Properties["UserPoolTags"], {
      Application: "orders",
    });
  });

  it("builds a custom attribute's constraints from the block holding them", () => {
    // Given a schema entry for a string attribute, where the provider writes
    // both kinds of constraint block and leaves the other one empty
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cognito_user_pool",
          name: "users",
          values: {
            name: "orders-users",
            schema: [
              {
                name: "tenantId",
                attribute_data_type: "String",
                mutable: true,
                required: false,
                string_attribute_constraints: [
                  { min_length: "1", max_length: "64" },
                ],
                number_attribute_constraints: [],
              },
            ],
          },
        }),
      ],
    });

    // When it is mapped
    // Then only the constraints belonging to the attribute's type are declared
    assertObjectEquals(cognitoUserPool(context).Properties["Schema"], [
      {
        Name: "tenantId",
        AttributeDataType: "String",
        Mutable: true,
        Required: false,
        StringAttributeConstraints: { MinLength: "1", MaxLength: "64" },
      },
    ]);
  });

  it("requires the pool a client belongs to", () => {
    // Given a client whose pool is created by the same plan
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cognito_user_pool_client",
          name: "web",
          values: {
            name: "orders-web",
            generate_secret: false,
            explicit_auth_flows: ["ALLOW_USER_SRP_AUTH"],
          },
          unknown: { user_pool_id: true },
          references: { user_pool_id: ["aws_cognito_user_pool.users.id"] },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_cognito_user_pool",
          name: "users",
          values: { name: "orders-users" },
        }),
      ],
    });
    const mapped = cognitoUserPoolClient(context);

    // When it is mapped
    // Then the pool is a Ref rather than a name the plan never resolved, and
    // it is named as required so a client without one is left out
    assertObjectEquals(mapped.Properties["UserPoolId"], {
      Ref: "AwsCognitoUserPoolUsers",
    });
    assertArrayEquals(mapped.requires ?? [], ["UserPoolId"]);
  });
});
