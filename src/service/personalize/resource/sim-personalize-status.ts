/**
 * The status simulated Personalize gives every resource it creates.
 *
 * Real Personalize walks a resource through `CREATE PENDING` and
 * `CREATE IN_PROGRESS` before it reaches `ACTIVE`, and training a solution
 * version takes tens of minutes to do it. Nothing trains here, so a resource
 * is active from the moment it is created and a test never polls.
 */
export const simPersonalizeActiveStatus = "ACTIVE";
