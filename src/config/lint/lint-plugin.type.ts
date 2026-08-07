/**
 * The slice of a linter's rule API that these plugins actually touch.
 *
 * ESLint and Oxlint both load the same plugin object, so typing it against
 * either one's published types would tie the plugin to a linter it is meant to
 * outlive. These declarations describe only what the rules here call, which is
 * narrow enough to stay true of both and leaves the plugin with no dependency
 * of its own.
 */

/**
 * A node in the syntax tree, identified by the type name a selector matches.
 */
export interface LintNode {
  readonly type: string;
}

/**
 * An identifier node, which is the only node kind read by name here.
 */
export interface LintIdentifierNode extends LintNode {
  readonly name: string;
}

/**
 * One place a binding is read or written.
 */
export interface LintReference {
  readonly identifier: LintIdentifierNode;
}

/**
 * A resolved binding together with every reference to it.
 */
export interface LintVariable {
  readonly references: readonly LintReference[];
}

/**
 * A lexical scope, as the linter resolved it.
 *
 * References to a name nothing declares land in `through` rather than in
 * `variables`, so a rule looking for globals has to read both: which of the two
 * a name falls into depends on whether the linter was told that global exists.
 */
export interface LintScope {
  readonly through: readonly LintReference[];
  readonly variables: readonly LintVariable[];
}

/**
 * What a rule is handed for the file it is looking at.
 */
export interface LintRuleContext {
  readonly sourceCode: {
    getScope(node: LintNode): LintScope;
  };
  report(descriptor: {
    node: LintNode;
    messageId: string;
    data?: Readonly<Record<string, string>>;
  }): void;
}

/**
 * The handlers a rule registers, keyed by the selector that triggers them.
 */
export type LintVisitor = Record<string, (node: never) => void>;

/**
 * One rule, in the shape both linters expect to load.
 */
export interface LintRule {
  readonly meta: {
    readonly type: "problem";
    readonly schema: readonly [];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: LintRuleContext): LintVisitor;
}

/**
 * A plugin, in the shape both linters expect to load.
 */
export interface LintPlugin {
  readonly meta: { readonly name: string };
  readonly rules: Readonly<Record<string, LintRule>>;
}
