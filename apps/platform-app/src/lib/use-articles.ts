import { useQuery } from "@tanstack/react-query";
import type { Article, ArticleSummary } from "@ae-hq/shared";
import { api } from "./api";

type ArticleListResponse = { articles: ArticleSummary[]; total: number };
type ArticleDetailResponse = { article: Article };

/** All Carrying Quota articles (list — body_md omitted). */
export function useArticles() {
  return useQuery({
    queryKey: ["articles"],
    queryFn: async (): Promise<ArticleListResponse> => {
      const res = await api.api.v1.articles.$get({ query: { limit: "100" } });
      if (!res.ok) throw new Error("failed to load articles");
      return (await res.json()) as unknown as ArticleListResponse;
    },
  });
}

/** One article by slug — full body_md included. */
export function useArticle(slug: string | undefined) {
  return useQuery({
    queryKey: ["article", slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<ArticleDetailResponse | null> => {
      const res = await api.api.v1.articles[":slug"].$get({ param: { slug: slug as string } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("failed to load article");
      return (await res.json()) as unknown as ArticleDetailResponse;
    },
  });
}
