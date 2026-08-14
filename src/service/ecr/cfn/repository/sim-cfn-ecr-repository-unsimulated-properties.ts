/**
 * The AWS::ECR::Repository properties this simulation has nothing to act on,
 * and why.
 *
 * Every one of them is about image content, and Yulin never reads any. They
 * are recorded as ignored rather than refused, because a repository without
 * them still does the one thing a repository does here: hold the handler that
 * stands in for the image.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "ImageScanningConfiguration",
    "no image is pulled or inspected, so nothing is scanned and no finding " +
      "is reported",
  ],
  [
    "ImageTagMutability",
    "a simulated image is registered in this process rather than pushed, so " +
      "nothing enforces which tags may be moved",
  ],
  [
    "ImageTagMutabilityExclusionFilters",
    "tag mutability is not enforced, so the tags excluded from it are not " +
      "either",
  ],
  [
    "LifecyclePolicy",
    "no lifecycle rule is evaluated, so no simulated image expires",
  ],
  [
    "RepositoryPolicyText",
    "nothing authorizes against a repository, since no request reaches one",
  ],
  ["EncryptionConfiguration", "there are no layers to encrypt at rest"],
  [
    "EmptyOnDelete",
    "a repository is deleted with whatever it holds, since a simulated image " +
      "is a handler registered by a test rather than a pushed artifact",
  ],
  ["Tags", "repository tags are not held or reported"],
]);
