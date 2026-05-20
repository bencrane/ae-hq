/**
 * eslint-plugin-ae-hq
 *
 * Custom ESLint rules for the AE platform. Currently ships:
 *
 *   - `no-route-geometry` — bans `mx-auto`, `max-w-*`, raw `px-*`, raw `py-*`,
 *     and raw `gap-*` from top-level JSX in `apps/platform-app/src/routes/`.
 *     Escape hatch: `unsafe_className` on `<Page>` is allowed.
 */

import { noRouteGeometry } from "./no-route-geometry.js";

const plugin = {
  meta: { name: "eslint-plugin-ae-hq", version: "0.1.0" },
  rules: {
    "no-route-geometry": noRouteGeometry,
  },
};

export default plugin;
export { noRouteGeometry };
