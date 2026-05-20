import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Button } from "./display";
import { Banner, Drawer, Modal, Toast, Tooltip } from "./feedback";

const meta = {
  title: "Feedback",
} satisfies Meta;

export default meta;

export const BannerTones: StoryObj = {
  name: "Banner — tones",
  render: () => (
    <div className="flex flex-col gap-3">
      <Banner tone="info" title="01 // INFO">
        Heads up: subscription renews in 7 days.
      </Banner>
      <Banner tone="success" title="02 // SUCCESS">
        Profile saved.
      </Banner>
      <Banner tone="warn" title="03 // WARN">
        Plaid token expired.
      </Banner>
      <Banner tone="error" title="04 // ERR">
        Could not connect to ATS.
      </Banner>
    </div>
  ),
};

export const ToastDefault: StoryObj = {
  name: "Toast — default",
  render: () => (
    <Toast tone="success" title="01 // SAVED">
      Profile updated.
    </Toast>
  ),
};

export const ModalDefault: StoryObj = {
  name: "Modal — default",
  render: () => {
    const [open, set] = useState(true);
    return (
      <>
        <Button onClick={() => set(true)}>Open modal</Button>
        <Modal
          open={open}
          onClose={() => set(false)}
          title="Confirm unlock"
          description="This will charge $99 against your subscription."
          actions={
            <>
              <Button variant="ghost" onClick={() => set(false)}>
                Cancel
              </Button>
              <Button onClick={() => set(false)}>Confirm</Button>
            </>
          }
        >
          <p>You are about to spend 1 of 25 unlocks for this period.</p>
        </Modal>
      </>
    );
  },
};

export const DrawerDefault: StoryObj = {
  name: "Drawer — right",
  render: () => {
    const [open, set] = useState(true);
    return (
      <>
        <Button onClick={() => set(true)}>Open drawer</Button>
        <Drawer open={open} onClose={() => set(false)} title="Filter candidates">
          <p>Filter form goes here.</p>
        </Drawer>
      </>
    );
  },
};

export const TooltipDefault: StoryObj = {
  name: "Tooltip — default",
  render: () => (
    <Tooltip label="More info">
      <Button variant="ghost">Hover me</Button>
    </Tooltip>
  ),
};
