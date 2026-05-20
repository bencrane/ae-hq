import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PreferenceTagPicker, TabList, TabPanel, Tabs } from "./interactive";

const meta = {
  title: "Interactive",
} satisfies Meta;

export default meta;

const TAB_ITEMS = [
  { id: "spotlight", label: "Company Spotlight", count: 5 },
  { id: "comp", label: "Compensation Data", count: 5 },
  { id: "moves", label: "Leadership Moves", count: 5 },
];

export const TabsDefault: StoryObj = {
  name: "Tabs — default",
  render: () => {
    const [tab, setTab] = useState("spotlight");
    return (
      <Tabs value={tab} onValueChange={setTab}>
        <TabList aria-label="Article kinds" value={tab} onValueChange={setTab} items={TAB_ITEMS} />
        <TabPanel tabId="spotlight" activeId={tab}>
          Company spotlight content.
        </TabPanel>
        <TabPanel tabId="comp" activeId={tab}>
          Compensation data content.
        </TabPanel>
        <TabPanel tabId="moves" activeId={tab}>
          Leadership moves content.
        </TabPanel>
      </Tabs>
    );
  },
};

const SEGMENT_OPTIONS = [
  { value: "SMB", label: "SMB" },
  { value: "MidMarket", label: "Mid-Market" },
  { value: "Enterprise", label: "Enterprise" },
  { value: "StrategicEnterprise", label: "Strategic Enterprise" },
];

export const PreferenceTagPickerDefault: StoryObj = {
  name: "PreferenceTagPicker — default",
  render: () => {
    const [selected, setSelected] = useState<string[]>(["Enterprise"]);
    return (
      <PreferenceTagPicker
        legend="Target segments"
        options={SEGMENT_OPTIONS}
        selected={selected}
        onChange={setSelected}
      />
    );
  },
};

export const PreferenceTagPickerDisabled: StoryObj = {
  name: "PreferenceTagPicker — disabled",
  render: () => (
    <PreferenceTagPicker
      legend="Target segments"
      options={SEGMENT_OPTIONS}
      selected={["SMB", "Enterprise"]}
      onChange={() => {}}
      disabled
    />
  ),
};
