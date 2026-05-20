import type { Meta, StoryObj } from "@storybook/react";
import { Box, Divider, Grid, Inline, Stack } from "./layout";

const meta = {
  title: "Layout",
} satisfies Meta;

export default meta;

export const StackDefault: StoryObj = {
  name: "Stack — default",
  render: () => (
    <Stack gap="4">
      <Box bg="raised" border="subtle" p="4">
        one
      </Box>
      <Box bg="raised" border="subtle" p="4">
        two
      </Box>
      <Box bg="raised" border="subtle" p="4">
        three
      </Box>
    </Stack>
  ),
};

export const StackTight: StoryObj = {
  name: "Stack — gap 1",
  render: () => (
    <Stack gap="1">
      <Box bg="raised" border="subtle" p="2">
        one
      </Box>
      <Box bg="raised" border="subtle" p="2">
        two
      </Box>
    </Stack>
  ),
};

export const InlineDefault: StoryObj = {
  name: "Inline — default",
  render: () => (
    <Inline gap="3">
      <Box bg="raised" border="subtle" p="3">
        chip 1
      </Box>
      <Box bg="raised" border="subtle" p="3">
        chip 2
      </Box>
      <Box bg="raised" border="subtle" p="3">
        chip 3
      </Box>
    </Inline>
  ),
};

export const InlineWrap: StoryObj = {
  name: "Inline — wrap",
  render: () => (
    <Inline gap="2" wrap>
      {Array.from({ length: 12 }, (_, i) => `item-${i}`).map((id, i) => (
        <Box key={id} bg="raised" border="subtle" p="2">
          item {i + 1}
        </Box>
      ))}
    </Inline>
  ),
};

export const GridDefault: StoryObj = {
  name: "Grid — 3 col",
  render: () => (
    <Grid cols={1} mdCols={3} gap="4">
      <Box bg="raised" border="subtle" p="4">
        a
      </Box>
      <Box bg="raised" border="subtle" p="4">
        b
      </Box>
      <Box bg="raised" border="subtle" p="4">
        c
      </Box>
    </Grid>
  ),
};

export const BoxDefault: StoryObj = {
  name: "Box — surface + border",
  render: () => (
    <Box bg="raised" border="subtle" p="6" rounded="xl">
      raised box with subtle border
    </Box>
  ),
};

export const DividerHorizontal: StoryObj = {
  name: "Divider — horizontal",
  render: () => (
    <Stack gap="4">
      <Box bg="raised" border="subtle" p="3">
        above
      </Box>
      <Divider />
      <Box bg="raised" border="subtle" p="3">
        below
      </Box>
    </Stack>
  ),
};
