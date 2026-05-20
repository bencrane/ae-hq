import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { ApplicationCard, PipelineStage } from "@ae-hq/shared";
import {
  ApplicantKanbanCard,
  KanbanBoard,
  KanbanColumn,
  Page,
  PageError,
  PageHeader,
  PageLoading,
  StageHeader,
} from "@ae-hq/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

// GET /api/v1/company/jobs/:id/pipeline — one posting's applications grouped by
// the company's pipeline stages. This is the per-job board's data (criterion 13);
// it reads `applications`, NOT the cycle-3 company-wide `pipeline_candidates`.
type JobPipelineResponse = {
  job: { id: string; title: string };
  stages: PipelineStage[];
  applications: ApplicationCard[];
};

/**
 * `/co/jobs/:id` — the per-job pipeline (cycle 5, directive item #7).
 *
 * One job posting's applicants on a kanban board: stages are the company's
 * `pipeline_stages`, cards are the `applications` for THIS job. A recruiter
 * works a specific role's funnel here. Dragging a card between columns moves
 * the application and writes a `pipeline_activity` row keyed on application_id.
 *
 * The kanban uses the cycle-5-fixed `KanbanColumn` (300px, `shrink-0`) and
 * `KanbanBoard` (owns its horizontal scroll) — the carried-over cycle-4
 * column-width fix. `Page variant="full"` so the board's scroll region is not
 * bounded by a capped page width and every column stays reachable.
 */
export function CoJobPipeline() {
  const { id = "" } = useParams();
  const { session } = useAuth();
  const qc = useQueryClient();

  const pipelineQ = useQuery({
    queryKey: ["co-job-pipeline", id],
    enabled: Boolean(session) && id.length > 0,
    queryFn: async (): Promise<JobPipelineResponse> => {
      const res = await api.api.v1.company.jobs[":id"].pipeline.$get({ param: { id } });
      if (!res.ok) throw new Error("failed to load job pipeline");
      return (await res.json()) as unknown as JobPipelineResponse;
    },
  });

  const stages = useMemo(() => pipelineQ.data?.stages ?? [], [pipelineQ.data]);
  const applications = useMemo(() => pipelineQ.data?.applications ?? [], [pipelineQ.data]);
  const jobTitle = pipelineQ.data?.job.title ?? "Job pipeline";

  const moveM = useMutation({
    mutationFn: async (args: { applicationId: string; stageId: string }) => {
      const res = await api.api.v1.company.jobs[":id"].applications[":applicationId"].move.$post({
        param: { id, applicationId: args.applicationId },
        json: { stage_id: args.stageId },
      });
      if (!res.ok) throw new Error("move failed");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["co-job-pipeline", id] });
    },
    onError: () => {
      // a failed move rolls the optimistic placement back to server truth.
      void qc.invalidateQueries({ queryKey: ["co-job-pipeline", id] });
    },
  });

  // Drag-drop: move the dragged application to the destination stage. The card
  // is placed optimistically (the cache is patched immediately) so the move
  // feels instant; the mutation then persists it and writes pipeline_activity.
  function handleMove(applicationId: string, toStageId: string) {
    const current = applications.find((a) => a.id === applicationId);
    if (!current || current.stage_id === toStageId) return;
    qc.setQueryData(
      ["co-job-pipeline", id],
      (prev: JobPipelineResponse | undefined) =>
        prev
          ? {
              ...prev,
              applications: prev.applications.map((a) =>
                a.id === applicationId ? { ...a, stage_id: toStageId } : a,
              ),
            }
          : prev,
    );
    moveM.mutate({ applicationId, stageId: toStageId });
  }

  return (
    <Page variant="full" align="left" data-testid="job-pipeline-page">
      <PageHeader
        section="01"
        eyebrow="01 // JOB_PIPELINE"
        title={jobTitle}
        description="This posting's applicants on a kanban board. Drag a card to move an applicant between stages — every move is logged."
        actions={
          <Link
            to="/co/jobs"
            className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
          >
            ← All postings
          </Link>
        }
      />
      {pipelineQ.isLoading ? (
        <PageLoading />
      ) : pipelineQ.isError ? (
        <PageError message="ERR // failed to load this job's pipeline" />
      ) : stages.length === 0 ? (
        <PageError
          title="No pipeline stages"
          message="This company has no pipeline stages configured yet."
        />
      ) : (
        <KanbanBoard aria-label={`${jobTitle} pipeline`} onMoveCandidate={handleMove}>
          {stages.map((stage) => {
            const inStage = applications.filter((a) => a.stage_id === stage.id);
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
                emptyLabel="No applicants"
              >
                {inStage.map((app) => (
                  <ApplicantKanbanCard
                    key={app.id}
                    applicationId={app.id}
                    initials={app.display.initials}
                    headline={app.display.headline}
                    meta={`${app.display.segment_focus ?? "AE"} // ${app.display.years_experience} yrs`}
                    source={app.source}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}
    </Page>
  );
}
