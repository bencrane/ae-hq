/**
 * no-route-geometry — bans geometry utilities on top-level JSX in route files.
 *
 * Top-level JSX = the element returned directly from a default-exported or
 * named-exported PascalCase function in `apps/platform-app/src/routes/**`.
 *
 * Banned utilities (matched as whole tokens in className string literals):
 *   - mx-auto
 *   - max-w-{anything}
 *   - px-{N} or px-{N}.{N}
 *   - py-{N} or py-{N}.{N}
 *   - gap-{N} or gap-{N}.{N}
 *
 * Exempt JSX tags (geometry primitives themselves): Page, PublicPage, AuthPage.
 *
 * Escape hatch: an `unsafe_className` JSX attribute does NOT trigger the rule.
 */

import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const BANNED = [
  /\bmx-auto\b/,
  /\bmax-w-[a-z0-9.\/-]+/,
  /\bpx-[0-9]+(?:\.[0-9]+)?\b/,
  /\bpy-[0-9]+(?:\.[0-9]+)?\b/,
  /\bgap-[0-9]+(?:\.[0-9]+)?\b/,
];

const EXEMPT_TAGS = new Set(["Page", "PublicPage", "AuthPage"]);

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ae-hq/ae-hq/blob/main/packages/eslint-plugin-ae-hq/docs/${name}.md`,
);

export const noRouteGeometry = createRule({
  name: "no-route-geometry",
  meta: {
    type: "problem",
    docs: {
      description:
        "Routes describe content, not geometry. Use <Page> + layout primitives instead of mx-auto/max-w-*/px-*/py-*/gap-*.",
    },
    messages: {
      banned:
        'route geometry on top-level JSX is owned by <Page>. found banned class(es): {{hits}}. use <Page variant="…">, <Stack>, <Inline>, <Grid>, or — last resort — `unsafe_className` on <Page>.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? context.getFilename();
    // Only enforce on route files.
    if (!/\/apps\/platform-app\/src\/routes\//.test(filename)) {
      return {};
    }

    function checkClassName(attrName: string, value: string, node: TSESTree.Node): void {
      if (attrName === "unsafe_className") return;
      if (attrName !== "className") return;
      const hits: string[] = [];
      for (const pat of BANNED) {
        const m = value.match(pat);
        if (m) hits.push(m[0]);
      }
      if (hits.length > 0) {
        context.report({
          node,
          messageId: "banned",
          data: { hits: hits.join(", ") },
        });
      }
    }

    function checkOpening(opening: TSESTree.JSXOpeningElement): void {
      const tag = opening.name;
      if (tag.type === AST_NODE_TYPES.JSXIdentifier && EXEMPT_TAGS.has(tag.name)) {
        return;
      }
      for (const attr of opening.attributes) {
        if (attr.type !== AST_NODE_TYPES.JSXAttribute) continue;
        if (attr.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;
        const name = attr.name.name;
        const value = attr.value;
        if (!value) continue;
        if (value.type === AST_NODE_TYPES.Literal && typeof value.value === "string") {
          checkClassName(name, value.value, attr);
        } else if (
          value.type === AST_NODE_TYPES.JSXExpressionContainer &&
          value.expression.type === AST_NODE_TYPES.Literal &&
          typeof value.expression.value === "string"
        ) {
          checkClassName(name, value.expression.value, attr);
        }
      }
    }

    function isTopLevelJSX(node: TSESTree.JSXElement | TSESTree.JSXFragment): boolean {
      let cur = node.parent as TSESTree.Node | undefined;
      let depth = 0;
      while (cur) {
        depth++;
        if (depth > 24) return false;
        const t = cur.type;
        if (
          t === AST_NODE_TYPES.JSXElement ||
          t === AST_NODE_TYPES.JSXFragment ||
          t === AST_NODE_TYPES.JSXAttribute
        ) {
          return false;
        }
        // JSXExpressionContainer is a special case: it's a JSX child wrapper.
        // If the JSXExpressionContainer is a child of a JSXElement/Fragment,
        // we're nested. But a JSXExpressionContainer can also wrap a top-level
        // expression in a return statement — in which case it's NOT nested.
        // Heuristic: if the JSXExpressionContainer's parent is a JSX node,
        // we're nested; otherwise we're not.
        if (t === AST_NODE_TYPES.JSXExpressionContainer) {
          const p = cur.parent;
          if (
            p &&
            (p.type === AST_NODE_TYPES.JSXElement || p.type === AST_NODE_TYPES.JSXFragment)
          ) {
            return false;
          }
          cur = p;
          continue;
        }
        if (t === AST_NODE_TYPES.FunctionDeclaration) {
          const fn = cur as TSESTree.FunctionDeclaration;
          const name = fn.id?.name;
          return !!name && /^_*[A-Z]/.test(name);
        }
        if (
          t === AST_NODE_TYPES.ArrowFunctionExpression ||
          t === AST_NODE_TYPES.FunctionExpression
        ) {
          const variable = cur.parent;
          if (variable && variable.type === AST_NODE_TYPES.VariableDeclarator) {
            const id = variable.id;
            if (id.type === AST_NODE_TYPES.Identifier && /^_*[A-Z]/.test(id.name)) {
              return true;
            }
          }
          return false;
        }
        cur = cur.parent;
      }
      return false;
    }

    return {
      JSXElement(node) {
        if (!isTopLevelJSX(node)) return;
        checkOpening(node.openingElement);
      },
    };
  },
});
