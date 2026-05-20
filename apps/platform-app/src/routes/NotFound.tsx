import { Link } from "react-router-dom";
import { Page, PageHeader } from "@ae-hq/ui";

export function NotFound() {
  return (
    <Page variant="narrow" align="center">
      <PageHeader
        section="04"
        title="Not found"
        description="The page you were looking for has been closed."
      />
      <Link
        to="/"
        className="data-mono inline-block font-mono text-mono-xs uppercase text-[color:var(--color-text-accent)] hover:text-[color:var(--color-accent-primaryHover)]"
      >
        ← Back to home
      </Link>
    </Page>
  );
}
