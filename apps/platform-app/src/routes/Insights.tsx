import { useState } from "react";
import { Link } from "react-router-dom";
import type { ArticleKind, ArticleSummary } from "@ae-hq/shared";
import {
  ArticleCard,
  Badge,
  Grid,
  Page,
  PageError,
  PageHeader,
  PageLoading,
  Tabs,
  TabList,
  TabPanel,
} from "@ae-hq/ui";
import { useArticles } from "../lib/use-articles";

const KINDS: Array<{ id: ArticleKind | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "company_spotlight", label: "Company Spotlight" },
  { id: "compensation_data", label: "Compensation Data" },
  { id: "leadership_moves", label: "Leadership Moves" },
];

export function Insights() {
  const articlesQ = useArticles();
  const [tab, setTab] = useState<ArticleKind | "all">("all");
  const articles: ArticleSummary[] = articlesQ.data?.articles ?? [];

  function forKind(kind: ArticleKind | "all"): ArticleSummary[] {
    return kind === "all" ? articles : articles.filter((a) => a.kind === kind);
  }

  const tabItems = KINDS.map((k) => ({
    id: k.id,
    label: k.label,
    count: forKind(k.id).length,
  }));

  return (
    <Page variant="wide" align="left" data-testid="insights-page">
      <PageHeader
        section="01"
        eyebrow="01 // CARRYING QUOTA"
        title="Insights"
        description="Company spotlights, verified compensation data, and leadership moves across the AE market."
      />
      {articlesQ.isLoading ? (
        <PageLoading />
      ) : articlesQ.isError ? (
        <PageError message="ERR // failed to load articles" />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as ArticleKind | "all")}>
          <TabList
            aria-label="Article kinds"
            value={tab}
            onValueChange={(v) => setTab(v as ArticleKind | "all")}
            items={tabItems}
          />
          {KINDS.map((k) => {
            const list = forKind(k.id);
            return (
              <TabPanel key={k.id} tabId={k.id} activeId={tab}>
                {list.length === 0 ? (
                  <div className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
                    No articles in this section yet.
                  </div>
                ) : (
                  <Grid cols={1} mdCols={2} lgCols={3} gap="5">
                    {list.map((a) => (
                      <ArticleCard
                        key={a.id}
                        kind={a.kind}
                        title={a.title}
                        dek={a.dek}
                        authorName={a.author_name}
                        readMinutes={a.read_minutes}
                        heroImageUrl={a.hero_image_url}
                        tags={a.tags}
                        as={({ className, children }) => (
                          <Link to={`/insights/${a.slug}`} className={className}>
                            {children}
                          </Link>
                        )}
                      />
                    ))}
                  </Grid>
                )}
              </TabPanel>
            );
          })}
        </Tabs>
      )}
      <div className="mt-8">
        <Badge tone="muted">{articles.length} ARTICLES</Badge>
      </div>
    </Page>
  );
}
