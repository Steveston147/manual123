// FILE: api/ask.ts
// PATH: api/ask.ts

declare const process: {
  env: Record<string, string | undefined>;
};

type AskRequestBody = {
  question?: string;
  requestedBy?: string;
  dataSource?: {
    provider?: string;
    notionDatabaseUrl?: string;
    notionDatabaseUrls?: Array<{ name?: string; url?: string }>;
    requireLatestIfDuplicated?: boolean;
  };
  outputFormat?: Record<string, string>;
  imageGeneration?: { provider?: string; model?: string };
  policy?: {
    beginnerFriendly?: boolean;
    avoidPersonalDependency?: boolean;
    includeManagerApprovalGate?: boolean;
  };
};

type ChecklistItem = { text: string };

type ManagerGate = {
  canProceedAlone: string[];
  needManagerApproval: string[];
  approvalTiming: string[];
  managerQuestionTemplate: string;
};

type SearchDebugPage = {
  title: string;
  score: number;
  url?: string;
  lastEditedTime?: string;
  contentPreview: string;
  sourceName: string;
  sourceType: string;
};

type SearchDebug = {
  searchTerms: string[];
  searchQueries: string[];
  databasePageCount: number;
  seedPageCount: number;
  discoveredPageCount: number;
  selectedPageCount: number;
  maxScore: number;
  minimumScore: number;
  selectedPages: SearchDebugPage[];
  sourceCounts: Record<string, number>;
};

type AnswerPayload = {
  answer: string;
  managerGate: ManagerGate;
  steps: string[];
  checklist: ChecklistItem[];
  imagePrompt: string;
  imageUrl: string;
  references: string[];
  updatedAt: string;
  oldPolicyNote: string;
  debug?: { search: SearchDebug };
};

type ApiRequest = { method?: string; body?: AskRequestBody | string };

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, any>;
  last_edited_time?: string;
  parent?: { type?: string; database_id?: string; page_id?: string };
};

type NotionSource = {
  id: string;
  name: string;
  type: "database" | "page" | "search";
};

type SeedPage = {
  page: NotionPage;
  source: NotionSource;
  parentPath?: string;
};

type ContextPage = {
  id: string;
  title: string;
  url?: string;
  lastEditedTime?: string;
  content: string;
  propertyText: string;
  blockText: string;
  score: number;
  sourceName: string;
  sourceId: string;
  sourceType: "database" | "page" | "search";
};

const MAX_DATABASE_PAGES = 220;
const MAX_CONTEXT_PAGES = 10;
const MAX_SEED_PAGES = 120;
const MAX_DISCOVERED_PAGES = 160;
const MAX_BLOCK_PAGES = 4;
const MAX_PAGE_CONTENT_LENGTH = 6500;
const MAX_NEST_DEPTH = 2;
const MAX_SEARCH_QUERIES = 28;

const DEFAULT_MANAGER_GATE: ManagerGate = {
  canProceedAlone: [
    "Notionに明記された手順を確認する",
    "事実関係を整理する",
    "必要情報を洗い出す",
    "既存テンプレートに沿って下書きを作成する",
    "参照元とチェックリストを確認する",
    "課長確認用のメモを作成する",
  ],
  needManagerApproval: [
    "費用、見積、請求、支払方法、支払期限、キャンセル料に関わる判断",
    "契約、合意書、受入可否、参加対象外への案内に関わる判断",
    "学内ルールに明記されていない例外対応",
    "先方へ確約する内容や、相手機関との交渉に関わる内容",
    "過去対応と異なる判断、部署間調整、トラブル・クレーム対応",
    "個人情報、アレルギー、医療情報など慎重な取扱いが必要な情報",
  ],
  approvalTiming: [
    "先方へメールや回答を送る前",
    "金額、日程、受入可否、支払条件などを確定する前",
    "通常ルールから外れる可能性があるとき",
    "Notion上の記載だけでは判断できないとき",
    "自分で判断してよいか少しでも迷ったとき",
  ],
  managerQuestionTemplate:
    "以下の件について、Notion上では〇〇と理解しました。\n先方へ回答する前に確認させてください。\nこの理解で進めてよろしいでしょうか。",
};

const DOMAIN_TERMS = [
  "RSJP",
  "RWJP",
  "Express",
  "RDSP",
  "OIC",
  "BKC",
  "衣笠",
  "セミナーハウス",
  "バス",
  "大型バス",
  "貸切バス",
  "観光バス",
  "ヤサカ",
  "ヤサカ観光",
  "Coupa",
  "COUPA",
  "発注",
  "業者発注",
  "発注書",
  "見積",
  "見積書",
  "請求",
  "請求書",
  "支払",
  "支払い",
  "経理",
  "Convera",
  "契約",
  "合意書",
  "agreement",
  "キャンセル",
  "宿泊",
  "ホテル",
  "宿舎",
  "参加者",
  "名簿",
  "フォーム",
  "学校訪問",
  "小学校",
  "給食",
  "アレルギー",
  "保険",
  "ビザ",
  "査証",
  "空港",
  "送迎",
  "BBP",
  "KOBO",
  "交流",
  "修了証",
  "参加対象外",
  "対象外",
  "対象者",
  "対象学生",
  "参加条件",
  "参加資格",
  "応募資格",
  "申込資格",
  "受入可否",
  "高校生",
  "大学生",
  "大学院生",
  "eligibility",
  "eligible",
  "ineligible",
  "not eligible",
  "日程",
  "期間",
  "実施期間",
  "開始日",
  "終了日",
  "チェックイン",
  "チェックアウト",
  "通学",
  "通学方法",
  "交通",
  "徒歩",
  "電車",
  "自転車",
  "自動車",
  "Pledge",
  "誓約書",
];

function parseBody(body: ApiRequest["body"]): AskRequestBody {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as AskRequestBody;
    } catch {
      return {};
    }
  }
  return body;
}

function cleanNotionId(value: string | undefined): string {
  const cleaned = (value ?? "")
    .trim()
    .replace(/-/g, "")
    .replace(/^https?:\/\/www\.notion\.so\//, "")
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .pop();

  return cleaned?.slice(0, 32) ?? "";
}

function getSources(): NotionSource[] {
  const sources: NotionSource[] = [];
  const envSources = [
    {
      id: cleanNotionId(process.env.NOTION_DATABASE_ID),
      name: process.env.NOTION_DATABASE_NAME || "RSJP Manual",
      type: "database" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_DATABASE_ID_2),
      name: process.env.NOTION_DATABASE_NAME_2 || "General Manual",
      type: "database" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_DATABASE_ID_3),
      name: process.env.NOTION_DATABASE_NAME_3 || "RSJP FAQ",
      type: "database" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_ROOT_PAGE_ID),
      name: process.env.NOTION_ROOT_PAGE_NAME || "Root Page Manual",
      type: "page" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_ROOT_PAGE_ID_2),
      name: process.env.NOTION_ROOT_PAGE_NAME_2 || "Additional Root Page",
      type: "page" as const,
    },
  ];

  for (const source of envSources) {
    if (source.id) sources.push(source);
  }

  const map = new Map<string, NotionSource>();
  for (const source of sources) {
    map.set(`${source.type}:${source.id}`, source);
  }
  return Array.from(map.values());
}

function getQuestion(body: AskRequestBody): string {
  const question = body.question?.trim();
  return question || "質問が入力されていません。";
}

function extractPlainText(items: any[] | undefined): string {
  if (!Array.isArray(items)) return "";
  return items.map((item) => item?.plain_text ?? "").join("").trim();
}

function extractPageTitle(page: NotionPage): string {
  const properties = page.properties ?? {};
  for (const property of Object.values(properties)) {
    if (property?.type === "title") {
      const text = extractPlainText(property.title);
      if (text) return text;
    }
  }
  for (const property of Object.values(properties)) {
    if (property?.type === "rich_text") {
      const text = extractPlainText(property.rich_text);
      if (text) return text;
    }
  }
  return "タイトル未取得";
}

function propertyToText(property: any): string {
  if (!property || typeof property !== "object") return "";
  const type = property.type;
  switch (type) {
    case "title":
      return extractPlainText(property.title);
    case "rich_text":
      return extractPlainText(property.rich_text);
    case "select":
      return property.select?.name ?? "";
    case "multi_select":
      return Array.isArray(property.multi_select)
        ? property.multi_select.map((item: any) => item?.name).filter(Boolean).join(" / ")
        : "";
    case "status":
      return property.status?.name ?? "";
    case "date":
      return [property.date?.start, property.date?.end].filter(Boolean).join(" - ");
    case "number":
      return typeof property.number === "number" ? String(property.number) : "";
    case "checkbox":
      return typeof property.checkbox === "boolean" ? String(property.checkbox) : "";
    case "url":
      return property.url ?? "";
    case "email":
      return property.email ?? "";
    case "phone_number":
      return property.phone_number ?? "";
    case "files":
      return Array.isArray(property.files)
        ? property.files
            .map((file: any) => file?.name || file?.file?.url || file?.external?.url)
            .filter(Boolean)
            .join(" / ")
        : "";
    case "people":
      return Array.isArray(property.people)
        ? property.people.map((person: any) => person?.name || person?.person?.email).filter(Boolean).join(" / ")
        : "";
    case "created_time":
      return property.created_time ?? "";
    case "last_edited_time":
      return property.last_edited_time ?? "";
    case "formula": {
      const formulaType = property.formula?.type;
      const value = formulaType ? property.formula?.[formulaType] : undefined;
      if (formulaType === "date") return [value?.start, value?.end].filter(Boolean).join(" - ");
      return value === undefined || value === null ? "" : String(value);
    }
    case "rollup": {
      const rollupType = property.rollup?.type;
      const value = rollupType ? property.rollup?.[rollupType] : undefined;
      if (Array.isArray(value)) {
        return value.map((item: any) => propertyToText(item)).filter(Boolean).join(" / ");
      }
      if (rollupType === "date") return [value?.start, value?.end].filter(Boolean).join(" - ");
      return value === undefined || value === null ? "" : String(value);
    }
    default:
      return "";
  }
}

function extractPropertiesText(page: NotionPage): string {
  const properties = page.properties ?? {};
  const priority = [
    "Question",
    "質問",
    "Answer",
    "回答",
    "Program",
    "プログラム",
    "Category",
    "カテゴリ",
    "Keyword",
    "キーワード",
    "Status",
    "ステータス",
    "SourceURL",
    "UpdatedAt",
    "更新日",
    "Date",
    "日付",
  ];
  const used = new Set<string>();
  const lines: string[] = [];

  for (const name of priority) {
    const text = propertyToText(properties[name]);
    if (text) {
      lines.push(`${name}: ${text}`);
      used.add(name);
    }
  }

  for (const [name, property] of Object.entries(properties)) {
    if (used.has(name)) continue;
    const text = propertyToText(property);
    if (text) lines.push(`${name}: ${text}`);
  }

  return lines.join("\n").slice(0, MAX_PAGE_CONTENT_LENGTH);
}

function extractBlockText(block: any): string {
  const type = block?.type;
  if (!type) return "";
  const value = block[type];
  if (!value) return "";

  if (type === "child_page") return `子ページ: ${value.title ?? ""}`;
  if (type === "child_database") return `子データベース: ${value.title ?? ""}`;
  if (type === "bookmark" || type === "link_preview") return value.url ?? "";
  if (type === "file") return value.name ?? value.file?.url ?? value.external?.url ?? "";
  if (type === "pdf" || type === "video" || type === "image") {
    return extractPlainText(value.caption) || value.name || value.file?.url || value.external?.url || "";
  }
  if (type === "to_do") return `${value.checked ? "[x]" : "[ ]"} ${extractPlainText(value.rich_text)}`;
  if (type === "table_row" && Array.isArray(value.cells)) {
    return value.cells.map((cell: any[]) => extractPlainText(cell)).filter(Boolean).join(" | ");
  }
  if (Array.isArray(value.rich_text)) return extractPlainText(value.rich_text);
  if (Array.isArray(value.caption)) return extractPlainText(value.caption);
  return "";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[、。！？!?,.()[\]【】「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripListPrefix(value: string): string {
  return value
    .replace(/^\s*(\d+[\.)]|[０-９]+[．.)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[-・●■])\s*/g, "")
    .trim();
}

function hasAny(question: string, terms: string[]): boolean {
  const raw = question.toLowerCase();
  const normalized = normalizeText(question);
  return terms.some((term) => raw.includes(term.toLowerCase()) || normalized.includes(normalizeText(term)));
}

function buildSearchTerms(question: string): string[] {
  const roughTerms = normalizeText(question)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .filter((term) => !["初心者", "向け", "説明", "してください", "教えて", "方法", "流れ", "手順"].includes(term));

  const matched = DOMAIN_TERMS.filter((term) => hasAny(question, [term]));
  const expanded: string[] = [];

  if (question.includes("バス")) {
    expanded.push("大型バス", "貸切バス", "ヤサカ観光", "業者発注", "見積", "発注書", "納品書", "請求書", "Coupa");
  }
  if (question.includes("発注")) {
    expanded.push("業者発注", "発注書", "見積もり依頼", "Coupa", "フォローオン", "納品書", "請求書");
  }
  if (question.includes("支払") || question.includes("請求")) {
    expanded.push("経理", "支払", "請求書", "インボイス", "Convera", "納品書", "業務完了報告書");
  }
  if (question.includes("契約") || question.includes("合意書") || question.toLowerCase().includes("agreement")) {
    expanded.push("契約", "合意書", "agreement", "支払", "キャンセル", "個人情報", "保険");
  }
  if (question.includes("アレルギー") || question.includes("給食") || question.includes("学校")) {
    expanded.push("学校訪問", "小学校", "給食", "アレルギー", "参加者", "名簿", "フォーム");
  }
  if (question.includes("通学") || question.includes("交通") || question.includes("徒歩") || question.includes("自転車")) {
    expanded.push("通学", "通学方法", "交通手段", "徒歩", "バス", "電車", "自転車", "自動車", "Pledge", "誓約書", "禁止");
  }

  return Array.from(new Set([...matched, ...expanded, ...roughTerms])).filter(Boolean);
}

function buildSearchQueries(question: string, terms: string[]): string[] {
  const queries = [question];
  if (question.includes("バス")) queries.push("大型バス 発注", "ヤサカ観光", "Coupa 見積 バス");
  if (question.includes("発注")) queries.push("業者発注", "発注書", "見積もり依頼", "Coupaフォローオン");
  if (question.includes("支払") || question.includes("請求")) queries.push("経理 支払", "請求書", "納品書", "Convera");
  if (question.includes("契約") || question.includes("合意書")) queries.push("契約", "合意書", "agreement", "キャンセル");
  if (hasAny(question, ["対象外", "参加資格", "応募資格", "高校生", "eligibility"])) {
    queries.push("参加対象外 対応", "参加資格 対象学生", "高校生 対象外", "eligibility eligible ineligible");
  }
  if (hasAny(question, ["日程", "期間", "開始日", "終了日", "チェックイン", "チェックアウト"])) {
    queries.push("RSJP 日程", "2026 RSJP 日程", "開始日 終了日", "チェックイン チェックアウト");
  }
  if (hasAny(question, ["通学", "交通", "徒歩", "自転車", "自動車", "Pledge"])) {
    queries.push("大学への通学方法", "通学 交通手段", "自転車 自動車 禁止", "Pledge 通学");
  }
  queries.push(...terms.slice(0, 18));
  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(0, MAX_SEARCH_QUERIES);
}

function scorePage(question: string, page: ContextPage): number {
  const terms = buildSearchTerms(question).map(normalizeText).filter(Boolean);
  const q = normalizeText(question);
  const title = normalizeText(page.title);
  const content = normalizeText(page.content);
  const propertyText = normalizeText(page.propertyText);
  const sourceName = normalizeText(page.sourceName);
  let score = 0;

  if (title.includes(q)) score += 45;
  if (propertyText.includes(q)) score += 40;
  if (content.includes(q)) score += 24;

  for (const term of terms) {
    if (title.includes(term)) score += 20;
    if (propertyText.includes(term)) score += 14;
    if (content.includes(term)) score += 5;
  }

  const faqQuestion = hasAny(question, ["対象外", "参加資格", "応募資格", "高校生", "日程", "通学", "交通", "eligibility"]);
  const riskyQuestion = hasAny(question, ["費用", "見積", "請求", "支払", "契約", "合意書", "対象外", "例外", "アレルギー", "医療"]);

  if (faqQuestion && (sourceName.includes("faq") || sourceName.includes("qa") || sourceName.includes("general"))) score += 18;
  if (propertyText.includes("answer:") || propertyText.includes("回答:")) score += 12;
  if (riskyQuestion && propertyText) score += 6;
  if (page.lastEditedTime) score += 0.5;

  const finalTitle = title.split(">").map((item) => item.trim()).filter(Boolean).pop();
  if (finalTitle && ["はじめに", "緊急連絡先", "ホーム", "目次", "使ってみる"].includes(finalTitle)) {
    score -= 16;
  }
  if (!terms.some((term) => title.includes(term))) score -= 2;
  if (!terms.some((term) => content.includes(term))) score -= 2;

  return Math.round(score * 10) / 10;
}

function createEmptyDebug(): SearchDebug {
  return {
    searchTerms: [],
    searchQueries: [],
    databasePageCount: 0,
    seedPageCount: 0,
    discoveredPageCount: 0,
    selectedPageCount: 0,
    maxScore: 0,
    minimumScore: 0,
    selectedPages: [],
    sourceCounts: {},
  };
}

function createDebug(
  searchTerms: string[],
  searchQueries: string[],
  databasePageCount: number,
  seedPageCount: number,
  discoveredPages: ContextPage[],
  selectedPages: ContextPage[],
  sources: NotionSource[],
  maxScore: number,
  minimumScore: number
): SearchDebug {
  const sourceCounts = sources.reduce<Record<string, number>>((counts, source) => {
    counts[source.name] = 0;
    return counts;
  }, {});

  for (const page of discoveredPages) {
    sourceCounts[page.sourceName] = (sourceCounts[page.sourceName] ?? 0) + 1;
  }

  return {
    searchTerms,
    searchQueries,
    databasePageCount,
    seedPageCount,
    discoveredPageCount: discoveredPages.length,
    selectedPageCount: selectedPages.length,
    maxScore,
    minimumScore,
    selectedPages: selectedPages.map((page, index) => ({
      title: `${page.sourceName} > ${page.title}`,
      score: page.score,
      url: page.url,
      lastEditedTime: page.lastEditedTime,
      contentPreview: (page.content || page.propertyText || page.blockText || "").replace(/\s+/g, " ").slice(0, 320),
      sourceName: page.sourceName,
      sourceType: page.sourceType,
    })),
    sourceCounts,
  };
}

function fallbackPayload(message: string, debug?: SearchDebug): AnswerPayload {
  const steps = [
    "VercelのEnvironment Variablesを確認する",
    "NOTION_API_KEY と NOTION_DATABASE_ID を確認する",
    "必要に応じて NOTION_DATABASE_ID_2 と NOTION_DATABASE_ID_3 を確認する",
    "Notion DBがRSJP Manual AIに共有されているか確認する",
    "GitHubへcommit / pushする",
    "Vercelで再デプロイする",
    "もう一度質問を送信する",
  ];
  const checklist = [
    { text: "NOTION_API_KEYが設定されている" },
    { text: "NOTION_DATABASE_IDが設定されている" },
    { text: "NOTION_DATABASE_ID_2 と NOTION_DATABASE_ID_3 が必要に応じて設定されている" },
    { text: "Notion DBをIntegrationに共有している" },
    { text: "OPENAI_API_KEYが設定されている" },
    { text: "Vercelの最新デプロイが成功している" },
  ];

  return {
    answer: message,
    managerGate: DEFAULT_MANAGER_GATE,
    steps,
    checklist,
    imagePrompt: buildImagePrompt("API接続確認", steps, checklist),
    imageUrl: "",
    references: ["Notion / OpenAI API接続確認"],
    updatedAt: new Date().toISOString(),
    oldPolicyNote: "Notion APIまたはOpenAI APIの接続確認中のため、過去運用との差分確認は未実施です。",
    debug: { search: debug ?? createEmptyDebug() },
  };
}
// FILE: api/ask.ts
// PATH: api/ask.ts

declare const process: {
  env: Record<string, string | undefined>;
};

type AskRequestBody = {
  question?: string;
  requestedBy?: string;
  dataSource?: {
    provider?: string;
    notionDatabaseUrl?: string;
    notionDatabaseUrls?: Array<{ name?: string; url?: string }>;
    requireLatestIfDuplicated?: boolean;
  };
  outputFormat?: Record<string, string>;
  imageGeneration?: { provider?: string; model?: string };
  policy?: {
    beginnerFriendly?: boolean;
    avoidPersonalDependency?: boolean;
    includeManagerApprovalGate?: boolean;
  };
};

type ChecklistItem = { text: string };

type ManagerGate = {
  canProceedAlone: string[];
  needManagerApproval: string[];
  approvalTiming: string[];
  managerQuestionTemplate: string;
};

type SearchDebugPage = {
  title: string;
  score: number;
  url?: string;
  lastEditedTime?: string;
  contentPreview: string;
  sourceName: string;
  sourceType: string;
};

type SearchDebug = {
  searchTerms: string[];
  searchQueries: string[];
  databasePageCount: number;
  seedPageCount: number;
  discoveredPageCount: number;
  selectedPageCount: number;
  maxScore: number;
  minimumScore: number;
  selectedPages: SearchDebugPage[];
  sourceCounts: Record<string, number>;
};

type AnswerPayload = {
  answer: string;
  managerGate: ManagerGate;
  steps: string[];
  checklist: ChecklistItem[];
  imagePrompt: string;
  imageUrl: string;
  references: string[];
  updatedAt: string;
  oldPolicyNote: string;
  debug?: { search: SearchDebug };
};

type ApiRequest = { method?: string; body?: AskRequestBody | string };

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, any>;
  last_edited_time?: string;
  parent?: { type?: string; database_id?: string; page_id?: string };
};

type NotionSource = {
  id: string;
  name: string;
  type: "database" | "page" | "search";
};

type SeedPage = {
  page: NotionPage;
  source: NotionSource;
  parentPath?: string;
};

type ContextPage = {
  id: string;
  title: string;
  url?: string;
  lastEditedTime?: string;
  content: string;
  propertyText: string;
  blockText: string;
  score: number;
  sourceName: string;
  sourceId: string;
  sourceType: "database" | "page" | "search";
};

const MAX_DATABASE_PAGES = 220;
const MAX_CONTEXT_PAGES = 10;
const MAX_SEED_PAGES = 120;
const MAX_DISCOVERED_PAGES = 160;
const MAX_BLOCK_PAGES = 4;
const MAX_PAGE_CONTENT_LENGTH = 6500;
const MAX_NEST_DEPTH = 2;
const MAX_SEARCH_QUERIES = 28;

const DEFAULT_MANAGER_GATE: ManagerGate = {
  canProceedAlone: [
    "Notionに明記された手順を確認する",
    "事実関係を整理する",
    "必要情報を洗い出す",
    "既存テンプレートに沿って下書きを作成する",
    "参照元とチェックリストを確認する",
    "課長確認用のメモを作成する",
  ],
  needManagerApproval: [
    "費用、見積、請求、支払方法、支払期限、キャンセル料に関わる判断",
    "契約、合意書、受入可否、参加対象外への案内に関わる判断",
    "学内ルールに明記されていない例外対応",
    "先方へ確約する内容や、相手機関との交渉に関わる内容",
    "過去対応と異なる判断、部署間調整、トラブル・クレーム対応",
    "個人情報、アレルギー、医療情報など慎重な取扱いが必要な情報",
  ],
  approvalTiming: [
    "先方へメールや回答を送る前",
    "金額、日程、受入可否、支払条件などを確定する前",
    "通常ルールから外れる可能性があるとき",
    "Notion上の記載だけでは判断できないとき",
    "自分で判断してよいか少しでも迷ったとき",
  ],
  managerQuestionTemplate:
    "以下の件について、Notion上では〇〇と理解しました。\n先方へ回答する前に確認させてください。\nこの理解で進めてよろしいでしょうか。",
};

const DOMAIN_TERMS = [
  "RSJP",
  "RWJP",
  "Express",
  "RDSP",
  "OIC",
  "BKC",
  "衣笠",
  "セミナーハウス",
  "バス",
  "大型バス",
  "貸切バス",
  "観光バス",
  "ヤサカ",
  "ヤサカ観光",
  "Coupa",
  "COUPA",
  "発注",
  "業者発注",
  "発注書",
  "見積",
  "見積書",
  "請求",
  "請求書",
  "支払",
  "支払い",
  "経理",
  "Convera",
  "契約",
  "合意書",
  "agreement",
  "キャンセル",
  "宿泊",
  "ホテル",
  "宿舎",
  "参加者",
  "名簿",
  "フォーム",
  "学校訪問",
  "小学校",
  "給食",
  "アレルギー",
  "保険",
  "ビザ",
  "査証",
  "空港",
  "送迎",
  "BBP",
  "KOBO",
  "交流",
  "修了証",
  "参加対象外",
  "対象外",
  "対象者",
  "対象学生",
  "参加条件",
  "参加資格",
  "応募資格",
  "申込資格",
  "受入可否",
  "高校生",
  "大学生",
  "大学院生",
  "eligibility",
  "eligible",
  "ineligible",
  "not eligible",
  "日程",
  "期間",
  "実施期間",
  "開始日",
  "終了日",
  "チェックイン",
  "チェックアウト",
  "通学",
  "通学方法",
  "交通",
  "徒歩",
  "電車",
  "自転車",
  "自動車",
  "Pledge",
  "誓約書",
];

function parseBody(body: ApiRequest["body"]): AskRequestBody {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as AskRequestBody;
    } catch {
      return {};
    }
  }
  return body;
}

function cleanNotionId(value: string | undefined): string {
  const cleaned = (value ?? "")
    .trim()
    .replace(/-/g, "")
    .replace(/^https?:\/\/www\.notion\.so\//, "")
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .pop();

  return cleaned?.slice(0, 32) ?? "";
}

function getSources(): NotionSource[] {
  const sources: NotionSource[] = [];
  const envSources = [
    {
      id: cleanNotionId(process.env.NOTION_DATABASE_ID),
      name: process.env.NOTION_DATABASE_NAME || "RSJP Manual",
      type: "database" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_DATABASE_ID_2),
      name: process.env.NOTION_DATABASE_NAME_2 || "General Manual",
      type: "database" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_DATABASE_ID_3),
      name: process.env.NOTION_DATABASE_NAME_3 || "RSJP FAQ",
      type: "database" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_ROOT_PAGE_ID),
      name: process.env.NOTION_ROOT_PAGE_NAME || "Root Page Manual",
      type: "page" as const,
    },
    {
      id: cleanNotionId(process.env.NOTION_ROOT_PAGE_ID_2),
      name: process.env.NOTION_ROOT_PAGE_NAME_2 || "Additional Root Page",
      type: "page" as const,
    },
  ];

  for (const source of envSources) {
    if (source.id) sources.push(source);
  }

  const map = new Map<string, NotionSource>();
  for (const source of sources) {
    map.set(`${source.type}:${source.id}`, source);
  }
  return Array.from(map.values());
}

function getQuestion(body: AskRequestBody): string {
  const question = body.question?.trim();
  return question || "質問が入力されていません。";
}

function extractPlainText(items: any[] | undefined): string {
  if (!Array.isArray(items)) return "";
  return items.map((item) => item?.plain_text ?? "").join("").trim();
}

function extractPageTitle(page: NotionPage): string {
  const properties = page.properties ?? {};
  for (const property of Object.values(properties)) {
    if (property?.type === "title") {
      const text = extractPlainText(property.title);
      if (text) return text;
    }
  }
  for (const property of Object.values(properties)) {
    if (property?.type === "rich_text") {
      const text = extractPlainText(property.rich_text);
      if (text) return text;
    }
  }
  return "タイトル未取得";
}

function propertyToText(property: any): string {
  if (!property || typeof property !== "object") return "";
  const type = property.type;
  switch (type) {
    case "title":
      return extractPlainText(property.title);
    case "rich_text":
      return extractPlainText(property.rich_text);
    case "select":
      return property.select?.name ?? "";
    case "multi_select":
      return Array.isArray(property.multi_select)
        ? property.multi_select.map((item: any) => item?.name).filter(Boolean).join(" / ")
        : "";
    case "status":
      return property.status?.name ?? "";
    case "date":
      return [property.date?.start, property.date?.end].filter(Boolean).join(" - ");
    case "number":
      return typeof property.number === "number" ? String(property.number) : "";
    case "checkbox":
      return typeof property.checkbox === "boolean" ? String(property.checkbox) : "";
    case "url":
      return property.url ?? "";
    case "email":
      return property.email ?? "";
    case "phone_number":
      return property.phone_number ?? "";
    case "files":
      return Array.isArray(property.files)
        ? property.files
            .map((file: any) => file?.name || file?.file?.url || file?.external?.url)
            .filter(Boolean)
            .join(" / ")
        : "";
    case "people":
      return Array.isArray(property.people)
        ? property.people.map((person: any) => person?.name || person?.person?.email).filter(Boolean).join(" / ")
        : "";
    case "created_time":
      return property.created_time ?? "";
    case "last_edited_time":
      return property.last_edited_time ?? "";
    case "formula": {
      const formulaType = property.formula?.type;
      const value = formulaType ? property.formula?.[formulaType] : undefined;
      if (formulaType === "date") return [value?.start, value?.end].filter(Boolean).join(" - ");
      return value === undefined || value === null ? "" : String(value);
    }
    case "rollup": {
      const rollupType = property.rollup?.type;
      const value = rollupType ? property.rollup?.[rollupType] : undefined;
      if (Array.isArray(value)) {
        return value.map((item: any) => propertyToText(item)).filter(Boolean).join(" / ");
      }
      if (rollupType === "date") return [value?.start, value?.end].filter(Boolean).join(" - ");
      return value === undefined || value === null ? "" : String(value);
    }
    default:
      return "";
  }
}

function extractPropertiesText(page: NotionPage): string {
  const properties = page.properties ?? {};
  const priority = [
    "Question",
    "質問",
    "Answer",
    "回答",
    "Program",
    "プログラム",
    "Category",
    "カテゴリ",
    "Keyword",
    "キーワード",
    "Status",
    "ステータス",
    "SourceURL",
    "UpdatedAt",
    "更新日",
    "Date",
    "日付",
  ];
  const used = new Set<string>();
  const lines: string[] = [];

  for (const name of priority) {
    const text = propertyToText(properties[name]);
    if (text) {
      lines.push(`${name}: ${text}`);
      used.add(name);
    }
  }

  for (const [name, property] of Object.entries(properties)) {
    if (used.has(name)) continue;
    const text = propertyToText(property);
    if (text) lines.push(`${name}: ${text}`);
  }

  return lines.join("\n").slice(0, MAX_PAGE_CONTENT_LENGTH);
}

function extractBlockText(block: any): string {
  const type = block?.type;
  if (!type) return "";
  const value = block[type];
  if (!value) return "";

  if (type === "child_page") return `子ページ: ${value.title ?? ""}`;
  if (type === "child_database") return `子データベース: ${value.title ?? ""}`;
  if (type === "bookmark" || type === "link_preview") return value.url ?? "";
  if (type === "file") return value.name ?? value.file?.url ?? value.external?.url ?? "";
  if (type === "pdf" || type === "video" || type === "image") {
    return extractPlainText(value.caption) || value.name || value.file?.url || value.external?.url || "";
  }
  if (type === "to_do") return `${value.checked ? "[x]" : "[ ]"} ${extractPlainText(value.rich_text)}`;
  if (type === "table_row" && Array.isArray(value.cells)) {
    return value.cells.map((cell: any[]) => extractPlainText(cell)).filter(Boolean).join(" | ");
  }
  if (Array.isArray(value.rich_text)) return extractPlainText(value.rich_text);
  if (Array.isArray(value.caption)) return extractPlainText(value.caption);
  return "";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[、。！？!?,.()[\]【】「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripListPrefix(value: string): string {
  return value
    .replace(/^\s*(\d+[\.)]|[０-９]+[．.)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[-・●■])\s*/g, "")
    .trim();
}

function hasAny(question: string, terms: string[]): boolean {
  const raw = question.toLowerCase();
  const normalized = normalizeText(question);
  return terms.some((term) => raw.includes(term.toLowerCase()) || normalized.includes(normalizeText(term)));
}

function buildSearchTerms(question: string): string[] {
  const roughTerms = normalizeText(question)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .filter((term) => !["初心者", "向け", "説明", "してください", "教えて", "方法", "流れ", "手順"].includes(term));

  const matched = DOMAIN_TERMS.filter((term) => hasAny(question, [term]));
  const expanded: string[] = [];

  if (question.includes("バス")) {
    expanded.push("大型バス", "貸切バス", "ヤサカ観光", "業者発注", "見積", "発注書", "納品書", "請求書", "Coupa");
  }
  if (question.includes("発注")) {
    expanded.push("業者発注", "発注書", "見積もり依頼", "Coupa", "フォローオン", "納品書", "請求書");
  }
  if (question.includes("支払") || question.includes("請求")) {
    expanded.push("経理", "支払", "請求書", "インボイス", "Convera", "納品書", "業務完了報告書");
  }
  if (question.includes("契約") || question.includes("合意書") || question.toLowerCase().includes("agreement")) {
    expanded.push("契約", "合意書", "agreement", "支払", "キャンセル", "個人情報", "保険");
  }
  if (question.includes("アレルギー") || question.includes("給食") || question.includes("学校")) {
    expanded.push("学校訪問", "小学校", "給食", "アレルギー", "参加者", "名簿", "フォーム");
  }
  if (question.includes("通学") || question.includes("交通") || question.includes("徒歩") || question.includes("自転車")) {
    expanded.push("通学", "通学方法", "交通手段", "徒歩", "バス", "電車", "自転車", "自動車", "Pledge", "誓約書", "禁止");
  }

  return Array.from(new Set([...matched, ...expanded, ...roughTerms])).filter(Boolean);
}

function buildSearchQueries(question: string, terms: string[]): string[] {
  const queries = [question];
  if (question.includes("バス")) queries.push("大型バス 発注", "ヤサカ観光", "Coupa 見積 バス");
  if (question.includes("発注")) queries.push("業者発注", "発注書", "見積もり依頼", "Coupaフォローオン");
  if (question.includes("支払") || question.includes("請求")) queries.push("経理 支払", "請求書", "納品書", "Convera");
  if (question.includes("契約") || question.includes("合意書")) queries.push("契約", "合意書", "agreement", "キャンセル");
  if (hasAny(question, ["対象外", "参加資格", "応募資格", "高校生", "eligibility"])) {
    queries.push("参加対象外 対応", "参加資格 対象学生", "高校生 対象外", "eligibility eligible ineligible");
  }
  if (hasAny(question, ["日程", "期間", "開始日", "終了日", "チェックイン", "チェックアウト"])) {
    queries.push("RSJP 日程", "2026 RSJP 日程", "開始日 終了日", "チェックイン チェックアウト");
  }
  if (hasAny(question, ["通学", "交通", "徒歩", "自転車", "自動車", "Pledge"])) {
    queries.push("大学への通学方法", "通学 交通手段", "自転車 自動車 禁止", "Pledge 通学");
  }
  queries.push(...terms.slice(0, 18));
  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(0, MAX_SEARCH_QUERIES);
}

function scorePage(question: string, page: ContextPage): number {
  const terms = buildSearchTerms(question).map(normalizeText).filter(Boolean);
  const q = normalizeText(question);
  const title = normalizeText(page.title);
  const content = normalizeText(page.content);
  const propertyText = normalizeText(page.propertyText);
  const sourceName = normalizeText(page.sourceName);
  let score = 0;

  if (title.includes(q)) score += 45;
  if (propertyText.includes(q)) score += 40;
  if (content.includes(q)) score += 24;

  for (const term of terms) {
    if (title.includes(term)) score += 20;
    if (propertyText.includes(term)) score += 14;
    if (content.includes(term)) score += 5;
  }

  const faqQuestion = hasAny(question, ["対象外", "参加資格", "応募資格", "高校生", "日程", "通学", "交通", "eligibility"]);
  const riskyQuestion = hasAny(question, ["費用", "見積", "請求", "支払", "契約", "合意書", "対象外", "例外", "アレルギー", "医療"]);

  if (faqQuestion && (sourceName.includes("faq") || sourceName.includes("qa") || sourceName.includes("general"))) score += 18;
  if (propertyText.includes("answer:") || propertyText.includes("回答:")) score += 12;
  if (riskyQuestion && propertyText) score += 6;
  if (page.lastEditedTime) score += 0.5;

  const finalTitle = title.split(">").map((item) => item.trim()).filter(Boolean).pop();
  if (finalTitle && ["はじめに", "緊急連絡先", "ホーム", "目次", "使ってみる"].includes(finalTitle)) {
    score -= 16;
  }
  if (!terms.some((term) => title.includes(term))) score -= 2;
  if (!terms.some((term) => content.includes(term))) score -= 2;

  return Math.round(score * 10) / 10;
}

function createEmptyDebug(): SearchDebug {
  return {
    searchTerms: [],
    searchQueries: [],
    databasePageCount: 0,
    seedPageCount: 0,
    discoveredPageCount: 0,
    selectedPageCount: 0,
    maxScore: 0,
    minimumScore: 0,
    selectedPages: [],
    sourceCounts: {},
  };
}

function createDebug(
  searchTerms: string[],
  searchQueries: string[],
  databasePageCount: number,
  seedPageCount: number,
  discoveredPages: ContextPage[],
  selectedPages: ContextPage[],
  sources: NotionSource[],
  maxScore: number,
  minimumScore: number
): SearchDebug {
  const sourceCounts = sources.reduce<Record<string, number>>((counts, source) => {
    counts[source.name] = 0;
    return counts;
  }, {});

  for (const page of discoveredPages) {
    sourceCounts[page.sourceName] = (sourceCounts[page.sourceName] ?? 0) + 1;
  }

  return {
    searchTerms,
    searchQueries,
    databasePageCount,
    seedPageCount,
    discoveredPageCount: discoveredPages.length,
    selectedPageCount: selectedPages.length,
    maxScore,
    minimumScore,
    selectedPages: selectedPages.map((page, index) => ({
      title: `${page.sourceName} > ${page.title}`,
      score: page.score,
      url: page.url,
      lastEditedTime: page.lastEditedTime,
      contentPreview: (page.content || page.propertyText || page.blockText || "").replace(/\s+/g, " ").slice(0, 320),
      sourceName: page.sourceName,
      sourceType: page.sourceType,
    })),
    sourceCounts,
  };
}

function fallbackPayload(message: string, debug?: SearchDebug): AnswerPayload {
  const steps = [
    "VercelのEnvironment Variablesを確認する",
    "NOTION_API_KEY と NOTION_DATABASE_ID を確認する",
    "必要に応じて NOTION_DATABASE_ID_2 と NOTION_DATABASE_ID_3 を確認する",
    "Notion DBがRSJP Manual AIに共有されているか確認する",
    "GitHubへcommit / pushする",
    "Vercelで再デプロイする",
    "もう一度質問を送信する",
  ];
  const checklist = [
    { text: "NOTION_API_KEYが設定されている" },
    { text: "NOTION_DATABASE_IDが設定されている" },
    { text: "NOTION_DATABASE_ID_2 と NOTION_DATABASE_ID_3 が必要に応じて設定されている" },
    { text: "Notion DBをIntegrationに共有している" },
    { text: "OPENAI_API_KEYが設定されている" },
    { text: "Vercelの最新デプロイが成功している" },
  ];

  return {
    answer: message,
    managerGate: DEFAULT_MANAGER_GATE,
    steps,
    checklist,
    imagePrompt: buildImagePrompt("API接続確認", steps, checklist),
    imageUrl: "",
    references: ["Notion / OpenAI API接続確認"],
    updatedAt: new Date().toISOString(),
    oldPolicyNote: "Notion APIまたはOpenAI APIの接続確認中のため、過去運用との差分確認は未実施です。",
    debug: { search: debug ?? createEmptyDebug() },
  };
}