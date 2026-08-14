/**
 * The standard attributes every Cognito pool's schema holds.
 *
 * These are the OpenID Connect claims, plus the two verification flags. A pool
 * here has no custom attributes, because `CreateUserPool` refuses a `Schema`
 * of its own.
 */
const standardAttributeNames: ReadonlySet<string> = new Set([
  "address",
  "birthdate",
  "email",
  "email_verified",
  "family_name",
  "gender",
  "given_name",
  "locale",
  "middle_name",
  "name",
  "nickname",
  "phone_number",
  "phone_number_verified",
  "picture",
  "preferred_username",
  "profile",
  "updated_at",
  "website",
  "zoneinfo",
]);

/**
 * Whether an attribute name is one every pool's schema holds.
 *
 * An identity provider's attribute mapping is checked with this when the
 * provider is created, so a mapping onto an attribute no pool here has is
 * refused where it was written rather than during a sign-in much later.
 */
export function isSimCognitoStandardAttribute(name: string): boolean {
  return standardAttributeNames.has(name);
}
