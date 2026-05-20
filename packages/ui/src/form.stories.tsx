import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  Combobox,
  Field,
  FieldGroup,
  FormErrors,
  Input,
  Label,
  Select,
  TagInput,
  Textarea,
} from "./form";
import { Stack } from "./layout";

const meta = {
  title: "Form",
} satisfies Meta;

export default meta;

export const FieldDefault: StoryObj = {
  name: "Field — default",
  render: () => (
    <Field label="Email" description="we'll never share" required htmlFor="f1">
      <Input id="f1" type="email" placeholder="you@company.com" />
    </Field>
  ),
};

export const FieldError: StoryObj = {
  name: "Field — invalid",
  render: () => (
    <Field label="Email" error="ERR // Not a valid email" htmlFor="f2">
      <Input id="f2" type="email" defaultValue="not-an-email" invalid />
    </Field>
  ),
};

export const LabelOnly: StoryObj = {
  name: "Label",
  render: () => <Label required>Standalone label</Label>,
};

export const InputDefault: StoryObj = {
  name: "Input",
  render: () => <Input placeholder="placeholder" aria-label="Example input" />,
};

export const TextareaDefault: StoryObj = {
  name: "Textarea",
  render: () => <Textarea placeholder="describe…" aria-label="Example textarea" />,
};

export const SelectDefault: StoryObj = {
  name: "Select",
  render: () => (
    <Select
      aria-label="Example select"
      options={[
        { value: "smb", label: "SMB" },
        { value: "midmarket", label: "Mid-market" },
        { value: "ent", label: "Enterprise" },
      ]}
    />
  ),
};

export const ComboboxDefault: StoryObj = {
  name: "Combobox",
  render: () => {
    const [v, set] = useState("");
    return (
      <Field label="Company" htmlFor="combobox-story">
        <Combobox
          id="combobox-story"
          value={v}
          onChange={set}
          placeholder="Pick a company"
          options={[
            { value: "Stripe", label: "Stripe" },
            { value: "Snowflake", label: "Snowflake" },
          ]}
        />
      </Field>
    );
  },
};

export const TagInputDefault: StoryObj = {
  name: "TagInput",
  render: () => {
    const [v, set] = useState<string[]>(["MEDDIC", "Challenger"]);
    return (
      <Field label="Methodology" htmlFor="taginput-story">
        <TagInput id="taginput-story" value={v} onChange={set} placeholder="add methodology" />
      </Field>
    );
  },
};

export const FieldGroupDefault: StoryObj = {
  name: "FieldGroup",
  render: () => (
    <FieldGroup title="01 // BASICS">
      <Stack gap="4">
        <Field label="Name">
          <Input />
        </Field>
        <Field label="Email">
          <Input type="email" />
        </Field>
      </Stack>
    </FieldGroup>
  ),
};

export const FormErrorsDefault: StoryObj = {
  name: "FormErrors",
  render: () => (
    <FormErrors
      errors={[
        { field: "email", message: "must be a valid email" },
        { field: "password", message: "must be at least 8 chars" },
      ]}
    />
  ),
};
