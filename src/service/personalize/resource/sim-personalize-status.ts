/**
 * The status simulated Personalize gives every resource it creates.
 *
 * Real Personalize walks a resource through `CREATE PENDING` and
 * `CREATE IN_PROGRESS` before it reaches `ACTIVE`, and training a solution
 * version takes tens of minutes to do it. Nothing trains here, so a resource
 * is active from the moment it is created and a test never polls.
 */
export const simPersonalizeActiveStatus = "ACTIVE";

/**
 * The status a resource reports while it is being deleted.
 *
 * Simulated Personalize deletes immediately and never reports this. It is here
 * because `DELETE PENDING` is the value real Personalize uses, and a reader
 * comparing the two should find the divergence recorded rather than guess it.
 */
export const simPersonalizeDeletePendingStatus = "DELETE PENDING";
