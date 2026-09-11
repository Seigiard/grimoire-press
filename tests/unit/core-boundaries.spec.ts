import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const domBoundImport = `import { CoreViewer } from "@vivliostyle/core";
export function makeViewer(element: never): unknown {
  return new CoreViewer({ viewportElement: element });
}`;
const eslint = new ESLint();

async function lintAs(filePath: string, source = domBoundImport) {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(process.cwd(), filePath),
  });

  return result?.messages ?? [];
}

describe("core dependency boundary", () => {
  it("rejects a DOM-bound package from core and names it", async () => {
    const messages = await lintAs("src/core/probe-guard.ts");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      ruleId: "boundaries/dependencies",
      severity: 2,
    });
    expect(messages[0]?.message).toContain("@vivliostyle/core");
  });

  it("allows a reviewed DOM-free package from core", async () => {
    const source = 'import { marked } from "marked";\nexport const rendered = marked("Text");';

    await expect(lintAs("src/core/probe-guard.ts", source)).resolves.toEqual([]);
  });

  it.each(["src/adapters/probe-guard.ts", "src/app/probe-guard.ts"])("allows the same package from %s", async (filePath) => {
    await expect(lintAs(filePath)).resolves.toEqual([]);
  });

  it.each(["src/core/probe-guard.ts", "src/adapters/probe-guard.ts", "src/app/probe-guard.ts"])(
    "does not apply the external-package restriction to Node built-ins from %s",
    async (filePath) => {
      const source = 'import path from "node:path";\nexport const separator = path.sep;';

      await expect(lintAs(filePath, source)).resolves.toEqual([]);
    },
  );
});
