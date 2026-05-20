import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardBody } from "./display";
import { AppearOnMount, FadeIn, SlideIn } from "./motion";

const meta = {
  title: "Motion",
} satisfies Meta;

export default meta;

export const AppearOnMountDefault: StoryObj = {
  name: "AppearOnMount — default",
  render: () => (
    <AppearOnMount>
      <Card>
        <CardBody>appears on mount</CardBody>
      </Card>
    </AppearOnMount>
  ),
};

export const FadeInDefault: StoryObj = {
  name: "FadeIn — default",
  render: () => (
    <FadeIn>
      <Card>
        <CardBody>fades in</CardBody>
      </Card>
    </FadeIn>
  ),
};

export const SlideInFromBottom: StoryObj = {
  name: "SlideIn — from bottom",
  render: () => (
    <SlideIn from="bottom">
      <Card>
        <CardBody>slides in from below</CardBody>
      </Card>
    </SlideIn>
  ),
};

export const SlideInFromRight: StoryObj = {
  name: "SlideIn — from right",
  render: () => (
    <SlideIn from="right">
      <Card>
        <CardBody>slides in from right</CardBody>
      </Card>
    </SlideIn>
  ),
};
