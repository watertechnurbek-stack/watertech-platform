import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Breadcrumbs } from "./Breadcrumbs";
import { NAV_ICONS, LockIcon } from "@/lib/nav-icons";
import type { NavNode } from "@/lib/types";

export async function SectionLanding({ node }: { node: NavNode }) {
  const t = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <Breadcrumbs path={node.path} />
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-primary-dark">{t(node.title)}</h1>
        {node.description && <p className="mt-1 text-[15px] text-text-secondary">{t(node.description)}</p>}
      </div>

      <Stagger className="grid gap-3 sm:grid-cols-2">
        {node.children?.map((child) => {
          const Icon = NAV_ICONS[child.icon];
          return (
            <StaggerItem key={child.path}>
              <Link
                href={child.path}
                className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-colors hover:border-accent/40 hover:bg-primary/5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14px] font-medium text-primary-dark">
                    {t(child.title)}
                    {child.locked && <LockIcon size={11} className="text-status-warning" />}
                  </span>
                  {child.children && (
                    <span className="block text-[12px] text-text-secondary">
                      {t("childCount", { count: child.children.length })}
                    </span>
                  )}
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
