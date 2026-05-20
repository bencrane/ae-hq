import type { Meta, StoryObj } from "@storybook/react";
import {
  ApplicantKanbanCard,
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

// KanbanCard and KanbanColumn use dnd-kit hooks (useDraggable / useDroppable)
// and must render inside a DndContext — KanbanBoard provides one.
export const KanbanCardDefault: StoryObj = {
  name: "KanbanCard",
  render: () => (
    <div className="max-w-xs">
      <KanbanBoard aria-label="Card preview">
        <KanbanColumn stageId="stage-1" header={<StageHeader name="New" count={1} color="info" />}>
          <KanbanCard
            candidateId="cand-1"
            initials="SA"
            headline="Enterprise AE — 7yrs closing $100K+ ACV"
            meta="Enterprise // 7 yrs"
            hasConversation
            notesPreview="Strong verified attainment — prioritize for phone screen."
            onOpen={() => {}}
          />
        </KanbanColumn>
      </KanbanBoard>
    </div>
  ),
};

export const KanbanColumnDefault: StoryObj = {
  name: "KanbanColumn",
  render: () => (
    <KanbanBoard aria-label="Column preview">
      <KanbanColumn
        stageId="stage-2"
        header={<StageHeader name="Phone Screen" count={2} color="warn" />}
      >
        <KanbanCard
          candidateId="cand-2"
          initials="MR"
          headline="Mid-Market AE"
          meta="MidMarket // 5 yrs"
        />
        <KanbanCard
          candidateId="cand-3"
          initials="JD"
          headline="Enterprise AE"
          meta="Enterprise // 9 yrs"
          hasConversation
        />
      </KanbanColumn>
    </KanbanBoard>
  ),
};

export const KanbanColumnEmpty: StoryObj = {
  name: "KanbanColumn — empty",
  render: () => (
    <KanbanBoard aria-label="Empty column preview">
      <KanbanColumn
        stageId="stage-3"
        header={<StageHeader name="Offer" count={0} color="good" />}
        emptyLabel="No candidates"
      />
    </KanbanBoard>
  ),
};

export const KanbanBoardDefault: StoryObj = {
  name: "KanbanBoard",
  render: () => (
    <KanbanBoard aria-label="Pipeline">
      <KanbanColumn stageId="s1" header={<StageHeader name="New" count={1} color="info" />}>
        <KanbanCard candidateId="c1" initials="SA" headline="Enterprise AE" meta="Enterprise" />
      </KanbanColumn>
      <KanbanColumn
        stageId="s2"
        header={<StageHeader name="Reviewing" count={1} color="default" />}
      >
        <KanbanCard candidateId="c2" initials="MR" headline="Mid-Market AE" meta="MidMarket" />
      </KanbanColumn>
      <KanbanColumn
        stageId="s3"
        header={<StageHeader name="Closed" count={0} color="muted" isTerminal />}
        emptyLabel="None"
      />
    </KanbanBoard>
  ),
};

// ApplicantKanbanCard is the per-job board's card — it uses dnd-kit's
// useDraggable and must render inside a DndContext (KanbanBoard provides one).
export const ApplicantKanbanCardDefault: StoryObj = {
  name: "ApplicantKanbanCard",
  render: () => (
    <KanbanBoard aria-label="Applicant card preview">
      <KanbanColumn stageId="stage-1" header={<StageHeader name="New" count={2} color="info" />}>
        <ApplicantKanbanCard
          applicationId="app-1"
          initials="SA"
          headline="Enterprise AE — 7yrs closing $100K+ ACV in fintech"
          meta="Enterprise // 7 yrs"
          source="candidate_applied"
          onOpen={() => {}}
        />
        <ApplicantKanbanCard
          applicationId="app-2"
          initials="MR"
          headline="Mid-Market AE — velocity sales"
          meta="MidMarket // 5 yrs"
          source="company_sourced"
        />
      </KanbanColumn>
    </KanbanBoard>
  ),
};

export const CandidateTimelineDefault: StoryObj = {
  name: "CandidateTimeline",
  render: () => (
    <div className="max-w-md">
      <CandidateTimeline>
        <TimelineEntry
          kind="added_to_pipeline"
          timestamp="May 12"
          description="Added to the pipeline at New."
        />
        <TimelineEntry
          kind="stage_changed"
          timestamp="May 14"
          description="Moved from New to Reviewing."
        />
        <TimelineEntry
          kind="note_added"
          timestamp="May 15"
          description="Strong attainment — schedule a screen."
        />
        <TimelineEntry
          kind="message_sent"
          timestamp="May 16"
          description="Recruiter sent a message."
        />
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
