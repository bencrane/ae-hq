import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PipelineActivity, PipelineCandidateCard, PipelineStage } from "@ae-hq/shared";
import {
  CandidateTimeline,
  Drawer,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  Page,
  PageError,
  PageHeader,
  PageLoading,
  StageHeader,
  TimelineEntry,
  type TimelineEntryKind,
} from "@ae-hq/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePipeline, usePipelineActivity } from "../lib/use-pipeline";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// Human-readable description of an activity row, resolving stage ids to names.
function describeActivity(
  a: PipelineActivity,
  stageName: (id: string | undefined) => string,
): string {
  const p = a.payload_json as Record<string, unknown>;
  switch (a.kind) {
    case "added_to_pipeline":
      return `Added to the pipeline at ${stageName(p.stage_id as string | undefined)}.`;
    case "stage_changed":
      return `Moved from ${stageName(p.from_stage_id as string | undefined)} to ${stageName(p.to_stage_id as string | undefined)}.`;
    case "note_added":
      return typeof p.note === "string" ? `Note: ${p.note}` : "A note was added.";
    case "message_sent":
      return "A message was sent in the conversation.";
    case "unlocked":
      return "Profile was unlocked — conversation opened.";
    default:
      return a.kind;
  }
}

export function CoPipeline() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const pipelineQ = usePipeline(Boolean(session));
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);

  const stages: PipelineStage[] = pipelineQ.data?.stages ?? [];
  const candidates: PipelineCandidateCard[] = pipelineQ.data?.candidates ?? [];
  const stageById = (id: string | undefined): string =>
    stages.find((s) => s.id === id)?.name ?? "a stage";

  const activityQ = usePipelineActivity(openCandidateId ?? undefined);
  const openCandidate = candidates.find((c) => c.candidate_id === openCandidateId) ?? null;

  const moveM = useMutation({
    mutationFn: async (args: { candidateId: string; stageId: string }) => {
      const res = await api.api.v1.company.pipeline.candidates[":candidateId"].move.$post({
        param: { candidateId: args.candidateId },
        json: { stage_id: args.stageId },
      });
      if (!res.ok) throw new Error("move failed");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
      void qc.invalidateQueries({ queryKey: ["pipeline-activity"] });
    },
    onError: () => {
      // a failed move rolls the optimistic placement back to server truth.
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  // Drag-drop: move the dragged candidate to the destination stage. The card is
  // placed optimistically (the kanban cache is patched immediately) so the move
  // feels instant; the mutation then persists it and writes pipeline_activity.
  function handleMoveCandidate(candidateId: string, toStageId: string) {
    const current = candidates.find((c) => c.candidate_id === candidateId);
    if (!current || current.stage_id === toStageId) return;
    qc.setQueryData(
      ["pipeline"],
      (prev: { stages: PipelineStage[]; candidates: PipelineCandidateCard[] } | undefined) =>
        prev
          ? {
              ...prev,
              candidates: prev.candidates.map((c) =>
                c.candidate_id === candidateId ? { ...c, stage_id: toStageId } : c,
              ),
            }
          : prev,
    );
    moveM.mutate({ candidateId, stageId: toStageId });
  }

  return (
    <Page variant="full" align="left" data-testid="pipeline-page">
      <PageHeader
        section="01"
        eyebrow="01 // PIPELINE"
        title="Hiring pipeline"
        description="Move candidates through your stages. Every move is logged to the candidate's timeline."
      />
      {pipelineQ.isLoading ? (
        <PageLoading />
      ) : pipelineQ.isError ? (
        <PageError message="ERR // failed to load pipeline" />
      ) : stages.length === 0 ? (
        <PageError
          title="No pipeline stages"
          message="This company has no pipeline stages configured yet."
        />
      ) : (
        <KanbanBoard aria-label="Hiring pipeline" onMoveCandidate={handleMoveCandidate}>
          {stages.map((stage) => {
            const inStage = candidates.filter((c) => c.stage_id === stage.id);
            return (
              <KanbanColumn
                key={stage.id}
                stageId={stage.id}
                header={
                  <StageHeader
                    name={stage.name}
                    count={inStage.length}
                    color={stage.color}
                    isTerminal={stage.is_terminal}
                  />
                }
                emptyLabel="No candidates"
              >
                {inStage.map((cand) => (
                  <KanbanCard
                    key={cand.id}
                    candidateId={cand.candidate_id}
                    initials={cand.display.initials}
                    headline={cand.display.headline}
                    meta={`${cand.display.segment_focus ?? "AE"} // ${cand.display.years_experience} yrs`}
                    hasConversation={Boolean(cand.conversation_id)}
                    notesPreview={cand.notes}
                    onOpen={() => setOpenCandidateId(cand.candidate_id)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}

      <Drawer
        open={Boolean(openCandidateId)}
        onClose={() => setOpenCandidateId(null)}
        side="right"
        title={openCandidate ? `${openCandidate.display.initials} // Timeline` : "Timeline"}
      >
        {openCandidate ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="font-display text-body-lg font-medium text-[color:var(--color-text-strong)]">
                {openCandidate.display.headline ?? "Account Executive"}
              </div>
              <div className="data-mono mt-1 font-mono text-mono-xs uppercase text-[color:var(--color-text-subtle)]">
                {openCandidate.display.segment_focus ?? "AE"} {"//"}{" "}
                {openCandidate.display.years_experience} yrs experience
              </div>
            </div>
            {activityQ.isLoading ? (
              <PageLoading />
            ) : (
              <CandidateTimeline emptyLabel="No activity yet.">
                {(activityQ.data?.activity ?? []).map((a) => (
                  <TimelineEntry
                    key={a.id}
                    kind={a.kind as TimelineEntryKind}
                    timestamp={shortDate(a.created_at)}
                    description={describeActivity(a, stageById)}
                  />
                ))}
              </CandidateTimeline>
            )}
          </div>
        ) : null}
      </Drawer>
    </Page>
  );
}
