import { Link, useParams } from "react-router-dom";
import {
  Badge,
  Inline,
  Markdown,
  Page,
  PageError,
  PageHeader,
  PageLoading,
} from "@ae-hq/ui";
import { useArticle } from "../lib/use-articles";

const KIND_LABEL: Record<string, string> = {
  company_spotlight: "Company Spotlight",
  compensation_data: "Compensation Data",
  leadership_moves: "Leadership Moves",
};

export function ArticleDetail() {
  const { slug = "" } = useParams();
  const q = useArticle(slug);

  if (q.isLoading) {
    return (
      <Page variant="narrow" align="center">
        <PageLoading />
      </Page>
    );
  }
  if (!q.data || !q.data.article) {
    return (
      <Page variant="narrow" align="center">
        <PageError
          title="Article not found"
          actions={
            <Link
              to="/insights"
              className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)]"
            >
              ← Back to Insights
            </Link>
          }
        />
      </Page>
    );
  }

  const article = q.data.article;
  const published = new Date(article.published_at).toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Page variant="narrow" align="center" data-testid="article-detail-page">
      <PageHeader
        section="01"
        eyebrow={`01 // ${(KIND_LABEL[article.kind] ?? "Article").toUpperCase()}`}
        title={article.title}
        description={article.dek ?? undefined}
      />
      <Inline gap="3" wrap>
        {article.author_name ? (
          <span className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-muted)]">
            By {article.author_name}
          </span>
        ) : null}
        <span className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-subtle)]">
          {published}
        </span>
        {typeof article.read_minutes === "number" ? (
          <span className="data-mono font-mono text-mono-xs uppercase text-[color:var(--color-text-subtle)]">
            {article.read_minutes} min read
          </span>
        ) : null}
      </Inline>

      {article.hero_image_url ? (
        <img
          src={article.hero_image_url}
          alt=""
          className="mt-6 w-full rounded-xl border border-[color:var(--color-border-subtle)] object-cover"
        />
      ) : null}

      <article className="mt-8">
        {/* body_md is rendered by the safe-by-construction Markdown primitive —
            it never interprets raw HTML, so a hostile body renders inert. */}
        <Markdown source={article.body_md ?? ""} />
      </article>

      {article.tags.length > 0 ? (
        <Inline gap="2" wrap unsafe_className="mt-8">
          {article.tags.map((t) => (
            <Badge key={t} tone="muted">
              {t}
            </Badge>
          ))}
        </Inline>
      ) : null}

      <div className="mt-10">
        <Link
          to="/insights"
          className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
        >
          ← All Insights
        </Link>
      </div>
    </Page>
  );
}
