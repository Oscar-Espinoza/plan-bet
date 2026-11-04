import { ChevronRight } from "lucide-react";
import { NavigationLink as Link } from "@/components/fast-link";
import { BreadcrumbPortal } from "@/components/breadcrumb-portal";
import { getTranslation } from "@/lib/locale-server";

type Crumb = { label: string; href?: string };

// The page's place in the app, rooted at the games board. On a phone it
// moves into the topbar and stands in for the heading block above the page
// (see BreadcrumbPortal and .page-heading in globals.css); the last crumb is
// the current page and is not a link.
export async function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = await getTranslation();
  const crumbs: Crumb[] = [{ label: t("Games"), href: "/" }, ...items];
  return (
    <BreadcrumbPortal>
      <nav className="breadcrumb" aria-label={t("Breadcrumb")}>
        <ol>
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            return (
              <li key={`${index}-${crumb.label}`}>
                {current || !crumb.href ? (
                  <span aria-current={current ? "page" : undefined}>
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href}>{crumb.label}</Link>
                )}
                {!current && <ChevronRight aria-hidden="true" size={14} />}
              </li>
            );
          })}
        </ol>
      </nav>
    </BreadcrumbPortal>
  );
}
