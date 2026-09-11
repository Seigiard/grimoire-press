import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // scripts/ holds standalone Node tools run directly with `node`, never
    // imported by the app or bundled by Vite, so the app-focused rules here
    // (the DOM-global ban, the boundaries rule) have no business policing them.
    ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "core", pattern: "src/core/**" },
        { type: "adapters", pattern: "src/adapters/**" },
        { type: "app", pattern: "src/app/**" },
      ],
      // Our imports omit the .ts extension (tsconfig's "Bundler" resolution); without
      // this the bundled resolver can't map a specifier to a file and silently skips
      // classifying it, which would make the boundary rule below a no-op.
      "import/resolver": {
        node: { extensions: [".js", ".mjs", ".ts", ".tsx"] },
      },
    },
    rules: {
      // The layering issue #2 enforces: core knows nothing above it, adapters know
      // nothing about the app, and only the entry point wires all three together.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkAllOrigins: true,
          policies: [
            { from: { element: { type: "core" } }, allow: { to: { element: { type: "core" } } } },
            {
              from: { element: { type: "adapters" } },
              allow: { to: { element: { types: ["adapters", "core"] } } },
            },
            {
              from: { element: { type: "app" } },
              allow: { to: { element: { types: ["app", "adapters", "core"] } } },
            },
            {
              from: { element: { type: "core" } },
              disallow: { to: { module: { origin: "external" } } },
              message: "Core cannot import external package '{{dependency.source}}'; add only reviewed DOM-free packages",
            },
            {
              from: { element: { type: "core" } },
              allow: { to: { module: { origin: "external", source: "marked" } } },
            },
            {
              from: { element: { types: ["adapters", "app"] } },
              allow: { to: { module: { origin: "external" } } },
            },
            {
              from: { element: { types: ["core", "adapters", "app"] } },
              allow: { to: { module: { origin: "core" } } },
            },
          ],
        },
      ],
    },
  },
  {
    // Belt and braces alongside tsconfig.core.json's excluded DOM lib: even a
    // reference to a global the ambient lib still declares (through a stray
    // dependency's types) is caught here without needing a type-checked run.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "localStorage",
        "sessionStorage",
        "fetch",
        "alert",
        "location",
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "boundaries/dependencies": "off",
    },
  },
);
