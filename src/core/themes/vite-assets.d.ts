/**
 * The default `vite/client` ambient types are unavailable here: core's own
 * tsconfig (tsconfig.core.json) sets `types: []` so that naming a DOM type
 * fails the build (issue #2's acceptance criteria), and `vite/client` would
 * bring in a browser lib along with the asset-import types it declares. This
 * declares only the two query-suffixed imports the theme actually uses --
 * both resolve to a plain string, never to anything from the DOM.
 */
declare module "*.css?raw" {
  const css: string;
  export default css;
}

declare module "*.woff2?inline" {
  const dataUri: string;
  export default dataUri;
}
