import type { SimCognitoSchemaAttributeType } from "./sim-cognito-schema-attribute.js";

/**
 * One attribute of the standard schema, which always has a name.
 */
type SimCognitoStandardAttribute = SimCognitoSchemaAttributeType & {
  readonly Name: string;
};

/**
 * The bounds Cognito gives a standard `String` attribute that has no narrower
 * ones of its own.
 */
const standardStringConstraints = { MinLength: "0", MaxLength: "2048" };

/**
 * The `String` attributes of the standard schema, which is most of it.
 */
const standardStringNames: readonly string[] = [
  "address",
  "email",
  "family_name",
  "gender",
  "given_name",
  "locale",
  "middle_name",
  "name",
  "nickname",
  "phone_number",
  "picture",
  "preferred_username",
  "profile",
  "website",
  "zoneinfo",
];

/**
 * The standard attributes whose type is not `String`, and `birthdate`, whose
 * length Cognito fixes at the ten characters of a `YYYY-MM-DD` date.
 */
const standardOtherAttributes: readonly SimCognitoStandardAttribute[] = [
  {
    Name: "birthdate",
    AttributeDataType: "String",
    Mutable: true,
    StringAttributeConstraints: { MinLength: "10", MaxLength: "10" },
  },
  { Name: "email_verified", AttributeDataType: "Boolean", Mutable: true },
  {
    Name: "phone_number_verified",
    AttributeDataType: "Boolean",
    Mutable: true,
  },
  {
    Name: "updated_at",
    AttributeDataType: "Number",
    Mutable: true,
    NumberAttributeConstraints: { MinValue: "0" },
  },
];

/**
 * The `sub` Cognito allocates, which every pool's schema reports and no
 * request may set.
 *
 * It is here because `DescribeUserPool` reports it among the schema attributes
 * on real Cognito. Nothing writes it: `SimCognitoUserAttributes` refuses a
 * request naming it before the schema is consulted, and the user holds its own.
 */
const subAttribute: SimCognitoStandardAttribute = {
  Name: "sub",
  AttributeDataType: "String",
  Mutable: false,
  Required: true,
  StringAttributeConstraints: { MinLength: "1", MaxLength: "2048" },
};

/**
 * The standard attributes every Cognito pool's schema holds.
 *
 * These are the OpenID Connect claims, plus the two verification flags, the
 * `sub` Cognito allocates, and the types and bounds real Cognito gives each of
 * them. They are all mutable and none but `sub` is required, which is what a
 * pool created without a `Schema` of its own has. A pool's `Schema` can
 * redeclare one of them to make it required or to fix it, and adds anything
 * else under a `custom:` name.
 */
export const simCognitoStandardAttributes: readonly SimCognitoStandardAttribute[] =
  [
    subAttribute,
    ...standardStringNames.map((name) => ({
      Name: name,
      AttributeDataType: "String",
      Mutable: true,
      StringAttributeConstraints: standardStringConstraints,
    })),
    ...standardOtherAttributes,
  ];

const standardAttributeNames: ReadonlySet<string> = new Set(
  simCognitoStandardAttributes.map((attribute) => attribute.Name),
);

/**
 * Whether an attribute name is one every pool's schema holds.
 *
 * A pool's own `Schema` naming one of these redeclares it rather than adding a
 * `custom:` attribute of that name, which is how a pool makes an attribute
 * such as `email` required.
 */
export function isSimCognitoStandardAttribute(name: string): boolean {
  return standardAttributeNames.has(name);
}
