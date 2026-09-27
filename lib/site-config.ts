import type { NavNode } from "./types";

// `title`/`description` hold namespace-relative message keys (resolved via
// useTranslations("nav") / getTranslations("nav")), not literal text — see
// messages/uz.json's "nav" namespace for the actual copy in both locales.
export const siteTree: NavNode[] = [
  {
    title: "salesProcess.title",
    path: "/sales-process",
    contentType: "doc",
    icon: "Handshake",
    description: "salesProcess.description",
    children: [
      {
        title: "salesProcess.scripts.title",
        path: "/sales-process/scripts",
        contentType: "doc",
        icon: "Headset",
        description: "salesProcess.scripts.description",
      },
      {
        title: "salesProcess.objections.title",
        path: "/sales-process/objections",
        contentType: "database",
        icon: "MessageSquareWarning",
      },
      {
        title: "salesProcess.battleCards.title",
        path: "/sales-process/battle-cards",
        contentType: "database",
        icon: "Swords",
      },
    ],
  },
  {
    title: "company.title",
    path: "/company",
    contentType: "doc",
    icon: "Building2",
    description: "company.description",
    children: [
      { title: "company.about.title", path: "/company/about", contentType: "doc", icon: "Info" },
      { title: "company.missionValues.title", path: "/company/mission-values", contentType: "doc", icon: "Compass" },
      { title: "company.onboarding.title", path: "/company/onboarding", contentType: "doc", icon: "GraduationCap" },
      { title: "company.contacts.title", path: "/company/contacts", contentType: "database", icon: "BookUser" },
      {
        title: "company.internalRules.title",
        path: "/company/internal-rules",
        contentType: "doc",
        icon: "ShieldCheck",
      },
      { title: "company.factoryTour.title", path: "/company/factory-tour", contentType: "video", icon: "Factory" },
    ],
  },
  {
    title: "products.title",
    path: "/products",
    contentType: "database",
    icon: "Boxes",
    description: "products.description",
    children: [
      { title: "products.catalog.title", path: "/products", contentType: "database", icon: "LayoutGrid" },
      { title: "products.comparisons.title", path: "/products/comparisons", contentType: "doc", icon: "Scale" },
      {
        title: "products.technicalDocs.title",
        path: "/products/technical-docs",
        contentType: "doc",
        icon: "FileBadge",
      },
      {
        title: "products.roadmap.title",
        path: "/products/roadmap",
        contentType: "doc",
        icon: "Milestone",
        locked: true,
      },
    ],
  },
  {
    title: "tools.title",
    path: "/tools",
    contentType: "doc",
    icon: "Wrench",
    description: "tools.description",
    children: [
      {
        title: "tools.amocrm.title",
        path: "/tools/amocrm",
        contentType: "doc",
        icon: "Workflow",
        children: [
          {
            title: "tools.amocrm.leadCreation.title",
            path: "/tools/amocrm/lead-creation",
            contentType: "doc",
            icon: "UserPlus",
          },
          {
            title: "tools.amocrm.stageTransition.title",
            path: "/tools/amocrm/stage-transition",
            contentType: "doc",
            icon: "ArrowRightLeft",
          },
          {
            title: "tools.amocrm.taskSetting.title",
            path: "/tools/amocrm/task-setting",
            contentType: "doc",
            icon: "ListTodo",
          },
          {
            title: "tools.amocrm.cardStandard.title",
            path: "/tools/amocrm/card-standard",
            contentType: "doc",
            icon: "IdCard",
          },
          {
            title: "tools.amocrm.lossReasons.title",
            path: "/tools/amocrm/loss-reasons",
            contentType: "doc",
            icon: "CircleX",
          },
          {
            title: "tools.amocrm.reports.title",
            path: "/tools/amocrm/reports",
            contentType: "doc",
            icon: "ChartColumn",
          },
        ],
      },
      { title: "tools.calculator.title", path: "/tools/calculator", contentType: "doc", icon: "Calculator" },
      { title: "tools.googleSheets.title", path: "/tools/google-sheets", contentType: "doc", icon: "FileSpreadsheet" },
      {
        title: "tools.communicationStandards.title",
        path: "/tools/communication-standards",
        contentType: "doc",
        icon: "BookOpen",
      },
      { title: "tools.salesFunnel.title", path: "/tools/sales-funnel", contentType: "doc", icon: "Filter" },
      {
        title: "tools.repeatSalesFunnel.title",
        path: "/tools/repeat-sales-funnel",
        contentType: "doc",
        icon: "Repeat",
      },
    ],
  },
  {
    title: "logistics.title",
    path: "/logistics",
    contentType: "doc",
    icon: "Truck",
    description: "logistics.description",
    children: [
      { title: "logistics.sampleShipping.title", path: "/logistics/sample-shipping", contentType: "doc", icon: "Send" },
      { title: "logistics.returnsPolicy.title", path: "/logistics/returns-policy", contentType: "doc", icon: "Undo2" },
    ],
  },
  {
    title: "standards.title",
    path: "/standards",
    contentType: "doc",
    icon: "Target",
    description: "standards.description",
    children: [
      {
        title: "standards.communicationStandards.title",
        path: "/standards/communication-standards",
        contentType: "doc",
        icon: "MessageSquareText",
      },
      { title: "standards.kpiSystem.title", path: "/standards/kpi-system", contentType: "doc", icon: "Gauge" },
      {
        title: "standards.motivationBonus.title",
        path: "/standards/motivation-bonus",
        contentType: "doc",
        icon: "Trophy",
      },
      { title: "standards.careerPath.title", path: "/standards/career-path", contentType: "doc", icon: "TrendingUp" },
    ],
  },
  {
    title: "faq.title",
    path: "/faq",
    contentType: "database",
    icon: "MessageCircleQuestion",
    description: "faq.description",
  },
  {
    title: "changelog.title",
    path: "/changelog",
    contentType: "doc",
    icon: "History",
    description: "changelog.description",
  },
];

export function flattenTree(nodes: NavNode[] = siteTree): NavNode[] {
  const out: NavNode[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children) out.push(...flattenTree(node.children));
  }
  return out;
}

export function findNode(path: string): NavNode | undefined {
  return flattenTree().find((n) => n.path === path);
}

/** Same lookup as `findNode`, for the call sites where the path is a literal
 * that must exist in `siteTree` — throws instead of forcing a non-null
 * assertion on every caller. */
export function getNodeOrThrow(path: string): NavNode {
  const node = findNode(path);
  if (!node) throw new Error(`No nav node found for path: ${path}`);
  return node;
}

export function getBreadcrumbs(path: string): NavNode[] {
  const segments = path.split("/").filter(Boolean);
  const crumbs: NavNode[] = [];
  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    const node = findNode(current);
    if (node) crumbs.push(node);
  }
  return crumbs;
}
