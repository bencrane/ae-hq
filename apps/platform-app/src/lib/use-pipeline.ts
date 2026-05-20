import { useQuery } from "@tanstack/react-query";
import type { PipelineActivity, PipelineCandidateCard, PipelineStage } from "@ae-hq/shared";
import { api } from "./api";

type PipelineResponse = { stages: PipelineStage[]; candidates: PipelineCandidateCard[] };
type ActivityResponse = { activity: PipelineActivity[] };

/** The company's pipeline — stages + candidates (with anonymized display info). */
export function usePipeline(enabled: boolean) {
  return useQuery({
    queryKey: ["pipeline"],
    enabled,
    queryFn: async (): Promise<PipelineResponse> => {
      const res = await api.api.v1.company.pipeline.$get();
      if (!res.ok) throw new Error("failed to load pipeline");
      return (await res.json()) as unknown as PipelineResponse;
    },
  });
}

/** A pipeline candidate's activity timeline. */
export function usePipelineActivity(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["pipeline-activity", candidateId],
    enabled: Boolean(candidateId),
    queryFn: async (): Promise<ActivityResponse> => {
      const res = await api.api.v1.company.pipeline.candidates[":candidateId"].activity.$get({
        param: { candidateId: candidateId as string },
        query: {},
      });
      if (!res.ok) throw new Error("failed to load activity");
      return (await res.json()) as unknown as ActivityResponse;
    },
  });
}
