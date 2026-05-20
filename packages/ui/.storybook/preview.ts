import type { Preview } from "@storybook/react";
import "./preview.css";

const preview: Preview = {
  parameters: {
    backgrounds: { default: "dark" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: {
      config: {
        rules: [{ id: "color-contrast", enabled: true }],
      },
    },
  },
};

export default preview;
