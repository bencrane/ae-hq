import { expect, test } from "bun:test";
import * as primitives from "./index";

// This is a minimal smoke test — it confirms the package's public surface
// exists. Storybook + Playwright handle render/visual coverage.

const expected = [
  // Layout
  "Stack",
  "Inline",
  "Grid",
  "Box",
  "Divider",
  // Page
  "Page",
  "PageHeader",
  "PageBody",
  "PageSection",
  "PageActions",
  "PageBreadcrumbs",
  "PageEmptyState",
  "PageError",
  "PageLoading",
  // Form
  "Field",
  "Label",
  "Input",
  "Textarea",
  "Select",
  "Combobox",
  "TagInput",
  "FieldGroup",
  "FormErrors",
  // Display
  "Card",
  "CardHeader",
  "CardBody",
  "Badge",
  "Avatar",
  "Stat",
  "KVTable",
  "DataTable",
  "Pagination",
  "Spinner",
  "SectionLabel",
  "Button",
  // Feedback
  "Banner",
  "Toast",
  "Modal",
  "Drawer",
  "Tooltip",
  // Motion
  "AppearOnMount",
  "FadeIn",
  "SlideIn",
];

for (const name of expected) {
  test(`exports ${name}`, () => {
    expect((primitives as Record<string, unknown>)[name]).toBeDefined();
  });
}

test("cx utility exported", () => {
  expect(typeof primitives.cx).toBe("function");
});

test("cx merges classes", () => {
  expect(primitives.cx("a", "b", false, "c")).toContain("a");
  expect(primitives.cx("a", "b", false, "c")).toContain("b");
  expect(primitives.cx("a", "b", false, "c")).toContain("c");
});
