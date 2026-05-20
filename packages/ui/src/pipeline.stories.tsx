import type { Meta, StoryObj } from "@storybook/react";
import {
  CandidateTimeline,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  StageHeader,
  TimelineEntry,
} from "./pipeline";

const meta = {
  title: "Pipeline",
} satisfies Meta;

export default meta;

const MOVE_TARGETS = [
  { id: "s2", name: "Reviewing" },
  { id: "s3", name: "Phone Screen" },
  { id: "s4", name: "Onsite" },
];

export const StageHeaderDefault: StoryObj = {
  name: "StageHeader",
  render: () => (
    <div className="flex flex-col gap-3">
      <StageHeader name="New" count={4} color="info" />
      <StageHeader name="Offer" count={1} color="good" />
      <StageHeader name="Closed" count={2} color="muted" isTerminal />
    </div>
  ),
};

export const KanbanCardDefault: StoryObj = {
  name: "KanbanCard",
  render: () => (
    <div className="max-w-xs">
      <KanbanCard
        initials="SA"
        headline="Enterprise AE — 7yrs closing $100K+ ACV"
        meta="Enterprise // 7 yrs"
        hasConversation
        notesPreview="Strong verified attainment — prioritize for phone screen."
        moveTargets={MOVE_TARGETS}
        onMove={() => {}}
        onOpen={() => {}}
      />
    </div>
  ),
};

export const KanbanColumnDefault: StoryObj = {
  name: "KanbanColumn",
  render: () => (
    <KanbanColumn header={<StageHeader name="Phone Screen" count={2} color="warn" />}>
      <KanbanCard
        initials="MR"
        headline="Mid-Market AE"
        meta="MidMarket // 5 yrs"
        moveTargets={MOVE_TARGETS}
        onMove={() => {}}
      />
      <KanbanCard
        initials="JD"
        headline="Enterprise AE"
        meta="Enterprise // 9 yrs"
        hasConversation
        moveTargets={MOVE_TARGETS}
        onMove={() => {}}
      />
    </KanbanColumn>
  ),
};

export const KanbanColumnEmpty: StoryObj = {
  name: "KanbanColumn — empty",
  render: () => (
    <KanbanColumn
      header={<StageHeader name="Offer" count={0} color="good" />}
      emptyLabel="No candidates"
    />
  ),
};

export const KanbanBoardDefault: StoryObj = {
  name: "KanbanBoard",
  render: () => (
    <KanbanBoard aria-label="Pipeline">
      <KanbanColumn header={<StageHeader name="New" count={1} color="info" />}>
        <KanbanCard initials="SA" headline="Enterprise AE" meta="Enterprise" moveTargets={MOVE_TARGETS} onMove={() => {}} />
      </KanbanColumn>
      <KanbanColumn header={<StageHeader name="Reviewing" count={1} color="default" />}>
        <KanbanCard initials="MR" headline="Mid-Market AE" meta="MidMarket" moveTargets={MOVE_TARGETS} onMove={() => {}} />
      </KanbanColumn>
      <KanbanColumn header={<StageHeader name="Closed" count={0} color="muted" isTerminal />} emptyLabel="None" />
    </KanbanBoard>
  ),
};

export const CandidateTimelineDefault: StoryObj = {
  name: "CandidateTimeline",
  render: () => (
    <div className="max-w-md">
      <CandidateTimeline>
        <TimelineEntry kind="added_to_pipeline" timestamp="May 12" description="Added to the pipeline at New." />
        <TimelineEntry kind="stage_changed" timestamp="May 14" description="Moved from New to Reviewing." />
        <TimelineEntry kind="note_added" timestamp="May 15" description="Strong attainment — schedule a screen." />
        <TimelineEntry kind="message_sent" timestamp="May 16" description="Recruiter sent a message." />
      </CandidateTimeline>
    </div>
  ),
};

export const TimelineEntryKinds: StoryObj = {
  name: "TimelineEntry — kinds",
  render: () => (
    <ul className="max-w-md">
      <TimelineEntry kind="unlocked" timestamp="May 10" description="Profile unlocked." />
      <TimelineEntry kind="stage_changed" timestamp="May 11" description="Onsite → Offer." />
    </ul>
  ),
};
