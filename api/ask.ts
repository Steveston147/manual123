// FILE: api/ask.ts
// PATH: api/ask.ts

type AskRequestBody = {
  question?: string;
  requestedBy?: string;
  dataSource?: {
    provider?: string;
    notionDatabaseUrl?: string;
    notionDatabaseUrls?: Array<{
      name?: string;
      url?: string;
    }>;
    requireLatestIfDuplicated?: boolean;
  };
  outputFormat?: Record<string, string>;
  imageGeneration?: {
    provider?: string;
    model?: string;
  };
  policy?: {
    beginnerFriendly?: boolean;
    avoidPersonalDependency?: boolean;
    includeManagerApprovalGate?: boolean;
  };
};

type ChecklistItem = {
  text: string;
};

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
  debug?: {
    search: SearchDebug;
  };
};

type ApiRequest = {
  method?: string;
  body?: AskRequestBody | string;
};

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
};

type ChildPageRef = {
  id: string;
  title: string;
};

type ChildDatabaseRef = {
  id: string;
  title: string;
};

type NotionSourceConfig = {
  id: string;
  name: string;
  type: "database" | "page" | "search";
};

type NotionSeedPage = {
  page: NotionPage;
  source: NotionSourceConfig;
  parentPath?: string;
};

type NotionContextPage = {
  id: string;
  title: string;
  url?: string;
  lastEditedTime?: string;
  content: string;
  score: number;
  sourceName: string;
  sourceId: string;
  sourceType: "database" | "page" | "search";
  propertyText?: string;
  blockText?: string;
};

type NotionContextResult = {
  pages: NotionContextPage[];
  debug: SearchDebug;
};

const MAX_CONTEXT_PAGES = 10;
const MAX_DISCOVERED_PAGES = 160;
const MAX_PAGE_CONTENT_LENGTH = 6500;
const MAX_DATABASE_PAGES = 220;
const MAX_SEED_PAGES = 120;
const MAX_BLOCK_CHILD_PAGES = 5;
const MAX_CHILD_PAGES_PER_PAGE = 30;
const MAX_CHILD_DATABASE_PAGES = 45;
const MAX_RECURSION_DEPTH = 4;
const MAX_NESTED_BLOCK_DEPTH = 3;
const MAX_SHALLOW_PROPERTY_PAGES = 500;

const ELIGIBILITY_TERMS = [
  "参加対象外",
  "対象外",
  "対象者",
  "対象学生",
  "対象条件",
  "参加条件",
  "参加資格",
  "応募資格",
  "申込資格",
  "受入可否",
  "受け入れ可否",
  "受入れ可否",
  "参加可否",
  "受入対象",
  "受け入れ対象",
  "対象プログラム",
  "対象学年",
  "高校生",
  "大学生",
  "大学院生",
  "学部生",
  "既卒",
  "社会人",
  "問い合わせ",
  "問合せ",
  "案内",
  "例外",
  "例外対応",
  "eligibility",
  "eligible",
  "ineligible",
  "not eligible",
  "qualification",
  "requirements",
  "applicant",
  "applicants",
  "target student",
  "target students",
];

const SCHEDULE_TERMS = [
  "日程",
  "期間",
  "実施期間",
  "開始日",
  "終了日",
  "開始",
  "終了",
  "チェックイン",
  "チェックアウト",
  "入寮",
  "退寮",
  "開催日",
  "実施日",
  "スケジュール",
  "予定",
  "2026",
  "2027",
  "RSJP",
  "RWJP",
  "Express",
  "RSJP Express",
  "RWJP Express",
  "program dates",
  "programme dates",
  "schedule",
  "start date",
  "end date",
  "check-in",
  "check out",
  "check-out",
  "arrival",
  "departure",
];

const COMMUTE_TERMS = [
  "通学",
  "通学方法",
  "大学への通学",
  "大学まで",
  "大学に行く",
  "アクセス",
  "交通",
  "交通手段",
  "移動",
  "移動方法",
  "徒歩",
  "歩く",
  "バス",
  "電車",
  "鉄道",
  "JR",
  "阪急",
  "モノレール",
  "最寄駅",
  "駅",
  "定期券",
  "交通費",
  "自転車",
  "自動車",
  "車",
  "バイク",
  "送迎",
  "Pledge",
  "誓約書",
  "commute",
  "commuting",
  "transportation",
  "transport",
  "access",
  "bus",
  "train",
  "walk",
  "walking",
  "bicycle",
  "bike",
  "car",
];

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

const PONCHI_STYLES = [
  "親しみやすいポンチ絵風。丸みのある人物と大きなアイコン。淡い水色と白を基調にした清潔な業務マニュアル風。",
  "シンプルなアニメ調の業務フロー図。やわらかい線、淡いパステルカラー、事務作業が直感的に分かる構成。",
  "大学事務マニュアル向けのかわいい説明図。人物、書類、チェックマーク、矢印を大きく配置。文字は少なめ。",
  "フラットデザインのポンチ絵。白背景、淡い青とミント色、角丸カード、太めの矢印で流れを見せる。",
  "やさしい教材イラスト風。初心者が安心して読める雰囲気。業務ステップを左から右へ見せる。",
  "ゆるいビジネスアニメ風。人物の表情は明るく、作業の流れが一目で分かる構図。",
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

function getQuestion(body: AskRequestBody): string {
  const question = body.question?.trim();

  if (!question) {
    return "質問が入力されていません。";
  }

  return question;
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

function getConfiguredNotionSources(): NotionSourceConfig[] {
  const sources: NotionSourceConfig[] = [];

  const primaryDatabaseId = cleanNotionId(process.env.NOTION_DATABASE_ID);
  const secondaryDatabaseId = cleanNotionId(process.env.NOTION_DATABASE_ID_2);
  const thirdDatabaseId = cleanNotionId(process.env.NOTION_DATABASE_ID_3);
  const primaryRootPageId = cleanNotionId(process.env.NOTION_ROOT_PAGE_ID);
  const secondaryRootPageId = cleanNotionId(process.env.NOTION_ROOT_PAGE_ID_2);

  if (primaryDatabaseId) {
    sources.push({
      id: primaryDatabaseId,
      name: process.env.NOTION_DATABASE_NAME || "RSJP Manual",
      type: "database",
    });
  }

  if (secondaryDatabaseId) {
    sources.push({
      id: secondaryDatabaseId,
      name: process.env.NOTION_DATABASE_NAME_2 || "General Manual",
      type: "database",
    });
  }

  if (thirdDatabaseId) {
    sources.push({
      id: thirdDatabaseId,
      name: process.env.NOTION_DATABASE_NAME_3 || "RSJP FAQ",
      type: "database",
    });
  }

  if (primaryRootPageId) {
    sources.push({
      id: primaryRootPageId,
      name: process.env.NOTION_ROOT_PAGE_NAME || "Root Page Manual",
      type: "page",
    });
  }

  if (secondaryRootPageId) {
    sources.push({
      id: secondaryRootPageId,
      name: process.env.NOTION_ROOT_PAGE_NAME_2 || "Additional Root Page",
      type: "page",
    });
  }

  const deduped = new Map<string, NotionSourceConfig>();

  for (const source of sources) {
    deduped.set(`${source.type}:${source.id}`, source);
  }

  return Array.from(deduped.values());
}

function extractPlainText(items: any[] | undefined): string {
  if (!Array.isArray(items)) return "";

  return items
    .map((item) => item?.plain_text ?? "")
    .join("")
    .trim();
}

function extractPageTitle(page: NotionPage): string {
  const properties = page.properties ?? {};

  for (const property of Object.values(properties)) {
    if (property?.type === "title") {
      const title = extractPlainText(property.title);
      if (title) return title;
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

function extractPropertyValueText(property: any): string {
  if (!property || typeof property !== "object") return "";

  const type = property.type;

  if (!type) return "";

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

    case "date": {
      const start = property.date?.start ?? "";
      const end = property.date?.end ?? "";
      return [start, end].filter(Boolean).join(" - ");
    }

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

    case "people":
      return Array.isArray(property.people)
        ? property.people
            .map((person: any) => person?.name || person?.person?.email || person?.id)
            .filter(Boolean)
            .join(" / ")
        : "";

    case "files":
      return Array.isArray(property.files)
        ? property.files
            .map((file: any) => file?.name || file?.file?.url || file?.external?.url)
            .filter(Boolean)
            .join(" / ")
        : "";

    case "relation":
      return Array.isArray(property.relation)
        ? property.relation.map((item: any) => item?.id).filter(Boolean).join(" / ")
        : "";

    case "formula": {
      const formulaType = property.formula?.type;
      if (!formulaType) return "";

      const formulaValue = property.formula?.[formulaType];

      if (formulaType === "date") {
        const start = formulaValue?.start ?? "";
        const end = formulaValue?.end ?? "";
        return [start, end].filter(Boolean).join(" - ");
      }

      return formulaValue === null || formulaValue === undefined ? "" : String(formulaValue);
    }

    case "rollup": {
      const rollupType = property.rollup?.type;
      if (!rollupType) return "";

      const rollupValue = property.rollup?.[rollupType];

      if (Array.isArray(rollupValue)) {
        return rollupValue
          .map((item: any) => extractPropertyValueText(item))
          .filter(Boolean)
          .join(" / ");
      }

      if (rollupType === "date") {
        const start = rollupValue?.start ?? "";
        const end = rollupValue?.end ?? "";
        return [start, end].filter(Boolean).join(" - ");
      }

      return rollupValue === null || rollupValue === undefined ? "" : String(rollupValue);
    }

    case "created_time":
      return property.created_time ?? "";

    case "last_edited_time":
      return property.last_edited_time ?? "";

    case "created_by":
      return property.created_by?.name || property.created_by?.id || "";

    case "last_edited_by":
      return property.last_edited_by?.name || property.last_edited_by?.id || "";

    default:
      return "";
  }
}

function extractPagePropertiesText(page: NotionPage): string {
  const properties = page.properties ?? {};
  const importantOrder = [
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

  const lines: string[] = [];
  const usedPropertyNames = new Set<string>();

  for (const propertyName of importantOrder) {
    const property = properties[propertyName];

    if (!property) continue;

    const text = extractPropertyValueText(property);

    if (text) {
      lines.push(`${propertyName}: ${text}`);
      usedPropertyNames.add(propertyName);
    }
  }

  for (const [propertyName, property] of Object.entries(properties)) {
    if (usedPropertyNames.has(propertyName)) continue;

    const text = extractPropertyValueText(property);

    if (text) {
      lines.push(`${propertyName}: ${text}`);
    }
  }

  return lines.join("\n").slice(0, MAX_PAGE_CONTENT_LENGTH);
}

function extractBlockText(block: any): string {
  const type = block?.type;

  if (!type) return "";

  const value = block[type];

  if (!value) return "";

  if (type === "child_page") {
    return `子ページ: ${value.title ?? ""}`;
  }

  if (type === "child_database") {
    return `子データベース: ${value.title ?? ""}`;
  }

  if (type === "bookmark" || type === "link_preview") {
    return value.url ?? "";
  }

  if (type === "pdf" || type === "video") {
    const caption = extractPlainText(value.caption);
    return caption || value.file?.url || value.external?.url || "";
  }

  if (type === "divider") {
    return "---";
  }

  if (type === "to_do") {
    const checked = value.checked ? "[x]" : "[ ]";
    return `${checked} ${extractPlainText(value.rich_text)}`;
  }

  if (type === "table_row" && Array.isArray(value.cells)) {
    return value.cells
      .map((cell: any[]) => extractPlainText(cell))
      .filter(Boolean)
      .join(" | ");
  }

  if (type === "file") {
    return value.name ?? value.file?.url ?? value.external?.url ?? "";
  }

  if (type === "image") {
    const caption = extractPlainText(value.caption);
    return caption ? `画像: ${caption}` : "";
  }

  if (Array.isArray(value.rich_text)) {
    return extractPlainText(value.rich_text);
  }

  if (Array.isArray(value.caption)) {
    return extractPlainText(value.caption);
  }

  return "";
}

function normalizeTextForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[、。！？!?,.()[\]【】「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionHasAny(question: string, terms: string[]): boolean {
  const rawQuestion = question.toLowerCase();
  const normalizedQuestion = normalizeTextForSearch(question);

  return terms.some((term) => {
    const rawTerm = term.toLowerCase();
    const normalizedTerm = normalizeTextForSearch(term);

    return rawQuestion.includes(rawTerm) || normalizedQuestion.includes(normalizedTerm);
  });
}

function isEligibilityQuestion(question: string): boolean {
  return questionHasAny(question, ELIGIBILITY_TERMS);
}

function isScheduleQuestion(question: string): boolean {
  return questionHasAny(question, SCHEDULE_TERMS);
}

function isCommuteQuestion(question: string): boolean {
  return questionHasAny(question, COMMUTE_TERMS);
}

function buildSearchTerms(question: string): string[] {
  const cleaned = normalizeTextForSearch(question);

  const roughTerms = cleaned
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .filter(
      (term) =>
        ![
          "初心者",
          "向け",
          "説明",
          "してください",
          "教えて",
          "方法",
          "流れ",
          "手順",
        ].includes(term)
    );

  const domainTerms = [
    "RSJP",
    "RWJP",
    "Express",
    "RDSP",
    "OIC",
    "BKC",
    "衣笠",
    "朱雀",
    "セミナーハウス",
    "バス",
    "大型バス",
    "貸切バス",
    "観光バス",
    "ヤサカ",
    "ヤサカ観光",
    "発注",
    "業者発注",
    "申請",
    "購買",
    "COUPA",
    "Coupa",
    "スマートDB",
    "経理",
    "支払",
    "支払い",
    "請求",
    "請求書",
    "インボイス",
    "見積",
    "見積書",
    "見積もり",
    "見積もり依頼",
    "発注書",
    "納品書",
    "業務完了報告書",
    "ホテル",
    "宿舎",
    "宿泊",
    "参加者",
    "名簿",
    "募集",
    "フォーム",
    "アンケート",
    "Convera",
    "精算",
    "報告",
    "契約",
    "合意書",
    "agreement",
    "invoice",
    "payment",
    "キャンセル",
    "返金",
    "参加費",
    "ガイド",
    "講師",
    "謝金",
    "講義",
    "企業訪問",
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
    "緊急",
    "トラブル",
    ...ELIGIBILITY_TERMS,
    ...SCHEDULE_TERMS,
    ...COMMUTE_TERMS,
  ];

  const expandedTerms: string[] = [];

  if (question.includes("バス")) {
    expandedTerms.push(
      "大型バス",
      "貸切バス",
      "観光バス",
      "ヤサカ",
      "ヤサカ観光",
      "業者発注",
      "発注",
      "見積",
      "見積書",
      "見積もり依頼",
      "発注書",
      "納品書",
      "請求書",
      "経理",
      "支払",
      "COUPA",
      "Coupa",
      "フォローオン"
    );
  }

  if (question.includes("発注")) {
    expandedTerms.push(
      "業者発注",
      "発注書",
      "見積",
      "見積書",
      "見積もり",
      "見積もり依頼",
      "納品書",
      "請求書",
      "経理",
      "支払",
      "COUPA",
      "Coupa",
      "フォローオン"
    );
  }

  if (question.includes("支払") || question.includes("支払い") || question.includes("請求")) {
    expandedTerms.push(
      "経理",
      "支払",
      "支払い",
      "請求",
      "請求書",
      "インボイス",
      "Convera",
      "納品書",
      "業務完了報告書"
    );
  }

  if (question.includes("見積")) {
    expandedTerms.push(
      "見積",
      "見積書",
      "見積もり",
      "見積もり依頼",
      "業者発注",
      "発注",
      "COUPA",
      "Coupa"
    );
  }

  if (question.includes("宿泊") || question.includes("ホテル") || question.includes("宿舎")) {
    expandedTerms.push("宿泊", "ホテル", "宿舎", "セミナーハウス", "部屋", "チェックイン", "チェックアウト");
  }

  if (question.includes("契約") || question.includes("合意書") || question.toLowerCase().includes("agreement")) {
    expandedTerms.push("契約", "合意書", "agreement", "支払", "キャンセル", "個人情報", "保険");
  }

  if (question.includes("アレルギー") || question.includes("給食") || question.includes("学校")) {
    expandedTerms.push("学校訪問", "小学校", "給食", "アレルギー", "参加者", "名簿", "フォーム");
  }

  if (question.includes("空港") || question.includes("送迎")) {
    expandedTerms.push("空港", "送迎", "バス", "集合", "到着", "出発");
  }

  if (question.includes("保険") || question.includes("ビザ") || question.includes("査証")) {
    expandedTerms.push("保険", "ビザ", "査証", "参加者", "書類", "申請");
  }

  if (isEligibilityQuestion(question)) {
    expandedTerms.push(...ELIGIBILITY_TERMS);
  }

  if (isScheduleQuestion(question)) {
    expandedTerms.push(
      "日程",
      "期間",
      "実施期間",
      "開始日",
      "終了日",
      "開始",
      "終了",
      "チェックイン",
      "チェックアウト",
      "入寮",
      "退寮",
      "program dates",
      "programme dates",
      "schedule",
      "start date",
      "end date",
      "check-in",
      "check-out",
      "arrival",
      "departure",
      "RSJP",
      "RWJP",
      "Express",
      "RSJP/RWJP",
      "2026RSJP",
      "2026 RSJP",
      "2026年RSJP",
      "2026年RSJPの日程"
    );
  }

  if (isCommuteQuestion(question)) {
    expandedTerms.push(
      "通学",
      "通学方法",
      "大学への通学",
      "アクセス",
      "交通",
      "交通手段",
      "移動",
      "徒歩",
      "バス",
      "電車",
      "最寄駅",
      "駅",
      "定期券",
      "交通費",
      "自転車",
      "自動車",
      "車",
      "バイク",
      "Pledge",
      "誓約書",
      "禁止",
      "commute",
      "commuting",
      "transportation",
      "access",
      "walking",
      "bus",
      "train",
      "bicycle",
      "car"
    );
  }

  const matchedTerms = domainTerms.filter((term) => questionHasAny(question, [term]));

  return Array.from(new Set([...matchedTerms, ...expandedTerms, ...roughTerms])).filter(
    (term) => term.length >= 2
  );
}

function buildSearchQueries(question: string, terms: string[]): string[] {
  const queries = [question];

  if (question.includes("バス")) {
    queries.push(
      "大型バス 発注",
      "バス 発注",
      "貸切バス",
      "観光バス",
      "ヤサカ観光",
      "業者発注 バス",
      "Coupa 見積 バス"
    );
  }

  if (question.includes("発注")) {
    queries.push(
      "業者発注",
      "発注書",
      "見積もり依頼",
      "Coupaフォローオン",
      "Coupa 見積",
      "納品書 請求書"
    );
  }

  if (question.includes("支払") || question.includes("支払い") || question.includes("請求")) {
    queries.push("支払い", "経理 支払", "請求書", "納品書", "Convera");
  }

  if (question.includes("宿泊") || question.includes("ホテル") || question.includes("宿舎")) {
    queries.push("宿泊", "ホテル", "宿舎", "セミナーハウス", "チェックイン");
  }

  if (question.includes("契約") || question.includes("合意書") || question.toLowerCase().includes("agreement")) {
    queries.push("契約", "合意書", "agreement", "キャンセル", "支払条件");
  }

  if (question.includes("アレルギー") || question.includes("給食") || question.includes("学校")) {
    queries.push("学校訪問", "小学校", "給食", "アレルギー", "フォーム");
  }

  if (question.includes("空港") || question.includes("送迎")) {
    queries.push("空港", "送迎", "集合", "到着", "出発");
  }

  if (isEligibilityQuestion(question)) {
    queries.push(
      "参加対象外 対応",
      "参加対象外 学生 問い合わせ",
      "対象外 問い合わせ",
      "参加資格 対象学生",
      "応募資格 受入可否",
      "申込資格 参加条件",
      "受入可否 対象者",
      "対象学生 参加条件",
      "高校生 対象外",
      "大学生 大学院生 対象",
      "eligibility eligible ineligible",
      "not eligible student inquiry"
    );
  }

  if (isScheduleQuestion(question)) {
    queries.push(
      "2026 RSJP 日程",
      "2026年RSJPの日程",
      "2026 RSJP 開始日 終了日",
      "2026 RSJP チェックイン チェックアウト",
      "RSJP 日程",
      "RSJP 実施期間",
      "RSJP 開始日 終了日",
      "RSJP チェックイン チェックアウト",
      "RSJP program dates",
      "RSJP start date end date",
      "RSJP check-in check-out",
      "RSJP/RWJP 日程",
      "実施日程",
      "プログラム日程"
    );
  }

  if (isCommuteQuestion(question)) {
    queries.push(
      "大学への通学方法を教えて",
      "大学への通学方法",
      "大学 通学方法",
      "通学 方法",
      "通学 交通手段",
      "大学 アクセス",
      "徒歩 バス 電車",
      "自転車 自動車 禁止",
      "Pledge 通学",
      "commuting transportation",
      "access to university",
      "walking bus train bicycle car"
    );
  }

  queries.push(...terms.slice(0, 18));

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(
    0,
    28
  );
}

function scorePage(question: string, page: NotionContextPage): number {
  const terms = buildSearchTerms(question);
  const title = normalizeTextForSearch(page.title);
  const content = normalizeTextForSearch(page.content);
  const propertyText = normalizeTextForSearch(page.propertyText ?? "");
  const q = normalizeTextForSearch(question);
  const eligibilityQuestion = isEligibilityQuestion(question);
  const scheduleQuestion = isScheduleQuestion(question);
  const commuteQuestion = isCommuteQuestion(question);

  let score = 0;

  if (title.includes(q)) score += 45;
  if (content.includes(q)) score += 24;
  if (propertyText.includes(q)) score += 40;

  for (const term of terms) {
    const t = normalizeTextForSearch(term);

    if (!t) continue;

    if (title.includes(t)) score += 20;
    if (propertyText.includes(t)) score += 14;
    if (content.includes(t)) score += 5;
  }

  const titleBoostTerms = [
    "業者発注",
    "発注",
    "発注書",
    "経理",
    "支払",
    "バス",
    "大型バス",
    "貸切バス",
    "観光バス",
    "ヤサカ",
    "COUPA",
    "Coupa",
    "見積",
    "見積書",
    "見積もり依頼",
    "納品書",
    "請求書",
  ];

  for (const term of titleBoostTerms) {
    const t = normalizeTextForSearch(term);
    if (question.includes(term) && title.includes(t)) {
      score += 22;
    }
  }

  if (question.includes("バス") && content.includes("バス")) score += 14;
  if (question.includes("バス") && content.includes("見積")) score += 10;
  if (question.includes("バス") && content.includes("発注")) score += 10;
  if (question.includes("発注") && content.includes("coupa")) score += 10;

  if (eligibilityQuestion) {
    const eligibilityBoostTerms = [
      "参加対象外",
      "対象外",
      "対象者",
      "対象学生",
      "対象条件",
      "参加条件",
      "参加資格",
      "応募資格",
      "申込資格",
      "受入可否",
      "受け入れ可否",
      "受入れ可否",
      "参加可否",
      "受入対象",
      "受け入れ対象",
      "高校生",
      "大学生",
      "大学院生",
      "学部生",
      "問い合わせ",
      "問合せ",
      "案内",
      "例外",
      "例外対応",
      "eligibility",
      "eligible",
      "ineligible",
      "not eligible",
      "qualification",
      "requirements",
      "applicant",
      "target student",
    ];

    for (const term of eligibilityBoostTerms) {
      const t = normalizeTextForSearch(term);

      if (!t) continue;

      if (title.includes(t)) score += 26;
      if (propertyText.includes(t)) score += 16;
      if (content.includes(t)) score += 8;
    }

    if (title.includes("qa") || title.includes("q&a") || page.sourceName.toLowerCase().includes("qa")) {
      score += 10;
    }

    if (
      page.sourceName.toLowerCase().includes("general") ||
      page.sourceName.toLowerCase().includes("shortterm") ||
      page.sourceName.toLowerCase().includes("faq") ||
      page.sourceName.includes("QA")
    ) {
      score += 8;
    }
  }

  if (scheduleQuestion) {
    const scheduleBoostTerms = [
      "日程",
      "期間",
      "実施期間",
      "開始日",
      "終了日",
      "開始",
      "終了",
      "チェックイン",
      "チェックアウト",
      "2026",
      "2027",
      "RSJP",
      "RWJP",
      "Express",
      "program dates",
      "schedule",
      "start date",
      "end date",
      "check-in",
      "check-out",
    ];

    for (const term of scheduleBoostTerms) {
      const t = normalizeTextForSearch(term);

      if (!t) continue;

      if (title.includes(t)) score += 18;
      if (propertyText.includes(t)) score += 16;
      if (content.includes(t)) score += 6;
    }

    if (title.includes("2026") && title.includes("rsjp")) score += 34;
    if (propertyText.includes("2026") && propertyText.includes("rsjp")) score += 30;
    if (content.includes("2026") && content.includes("rsjp")) score += 16;

    if (title.includes("日程") || title.includes("期間")) score += 22;
    if (propertyText.includes("日程") || propertyText.includes("期間")) score += 20;
    if (propertyText.includes("answer:") || propertyText.includes("回答:")) score += 12;

    if (
      page.sourceName.toLowerCase().includes("general") ||
      page.sourceName.toLowerCase().includes("shortterm") ||
      page.sourceName.toLowerCase().includes("faq") ||
      page.sourceName.includes("QA")
    ) {
      score += 12;
    }
  }

  if (commuteQuestion) {
    const commuteBoostTerms = [
      "通学",
      "通学方法",
      "大学への通学",
      "アクセス",
      "交通",
      "交通手段",
      "徒歩",
      "バス",
      "電車",
      "自転車",
      "自動車",
      "車",
      "Pledge",
      "誓約書",
      "禁止",
      "commute",
      "commuting",
      "transportation",
      "access",
      "walk",
      "walking",
      "bus",
      "train",
      "bicycle",
      "car",
    ];

    for (const term of commuteBoostTerms) {
      const t = normalizeTextForSearch(term);

      if (!t) continue;

      if (title.includes(t)) score += 24;
      if (propertyText.includes(t)) score += 22;
      if (content.includes(t)) score += 8;
    }

    if (title.includes("大学") && title.includes("通学")) score += 45;
    if (propertyText.includes("大学") && propertyText.includes("通学")) score += 45;
    if (propertyText.includes("answer:") || propertyText.includes("回答:")) score += 14;

    if (
      page.sourceName.toLowerCase().includes("faq") ||
      page.sourceName.toLowerCase().includes("additional") ||
      page.sourceName.toLowerCase().includes("general") ||
      page.sourceName.includes("QA")
    ) {
      score += 18;
    }
  }

  if (page.sourceName.includes("RSJP")) {
    score += 1;
  }

  const genericTitles = ["はじめに", "緊急連絡先", "ホーム", "目次", "使ってみる"];

  const finalTitleSegment = title
    .split(">")
    .map((item) => item.trim())
    .filter(Boolean)
    .pop();

  if (
    finalTitleSegment &&
    genericTitles.some((genericTitle) => finalTitleSegment === normalizeTextForSearch(genericTitle))
  ) {
    score -= 16;
  }

  if (!terms.some((term) => title.includes(normalizeTextForSearch(term)))) {
    score -= 2;
  }

  if (!terms.some((term) => content.includes(normalizeTextForSearch(term)))) {
    score -= 2;
  }

  if (propertyText && propertyText.length > 0) {
    score += 4;
  }

  if (!page.blockText?.trim() && propertyText.trim()) {
    score += 8;
  }

  if (page.lastEditedTime) {
    score += 0.5;
  }

  return Math.round(score * 10) / 10;
}

function stripListPrefix(value: string): string {
  return value
    .replace(
      /^\s*(\d+[\.)]|[０-９]+[．.)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[-・●■])\s*/g,
      ""
    )
    .trim();
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

function createSearchDebug(
  searchTerms: string[],
  searchQueries: string[],
  databasePageCount: number,
  seedPageCount: number,
  discoveredPages: NotionContextPage[],
  selectedPages: NotionContextPage[],
  maxScore: number,
  minimumScore: number
): SearchDebug {
  const sourceCounts = discoveredPages.reduce<Record<string, number>>((counts, page) => {
    counts[page.sourceName] = (counts[page.sourceName] ?? 0) + 1;
    return counts;
  }, {});

  return {
    searchTerms,
    searchQueries,
    databasePageCount,
    seedPageCount,
    discoveredPageCount: discoveredPages.length,
    selectedPageCount: selectedPages.length,
    maxScore,
    minimumScore,
    selectedPages: selectedPages.map((page) => {
      const previewSource =
        page.content.trim() ||
        page.propertyText?.trim() ||
        page.blockText?.trim() ||
        "";

      return {
        title: `${page.sourceName} > ${page.title}`,
        score: page.score,
        url: page.url,
        lastEditedTime: page.lastEditedTime,
        contentPreview: previewSource.replace(/\s+/g, " ").slice(0, 320),
        sourceName: page.sourceName,
        sourceType: page.sourceType,
      };
    }),
    sourceCounts,
  };
}

function pickPonchiStyle(): string {
  const index = Math.floor(Math.random() * PONCHI_STYLES.length);
  return PONCHI_STYLES[index] ?? PONCHI_STYLES[0];
}

function compactLabel(value: string, maxLength = 12): string {
  const stripped = stripListPrefix(value)
    .replace(/\s+/g, "")
    .replace(/[。．.、,]$/g, "")
    .trim();

  if (stripped.length <= maxLength) {
    return stripped;
  }

  return stripped.slice(0, maxLength);
}

function buildPonchiImagePrompt(question: string, steps: string[], checklist: ChecklistItem[]): string {
  const style = pickPonchiStyle();
  const title = compactLabel(question, 14) || "業務フロー";
  const stepLabels = steps.slice(0, 4).map((step) => compactLabel(step, 10)).filter(Boolean);
  const cautionLabels = checklist.slice(0, 2).map((item) => compactLabel(item.text, 12)).filter(Boolean);

  const safeSteps = stepLabels.length > 0 ? stepLabels : ["確認", "依頼", "実施", "完了"];
  const safeCautions = cautionLabels.length > 0 ? cautionLabels : ["抜け漏れ確認", "最新情報確認"];

  return `16:9横長のポンチ絵風・親しみやすいアニメ調の業務図解を作成する。

図柄:
${style}

目的:
大学事務の業務マニュアルとして、新人職員が一目で流れを理解できる図解にする。

文字方針:
- 文字、数字、短いラベルを入れる。
- 文字は少なめにする。
- 長文は禁止。
- 各ラベルは短く大きく読みやすくする。
- 日本で使われる正しい日本語の漢字を使う。
- 中国語の簡体字、繁体字、中国式の漢字は使わない。
- 日本語として自然な表記にする。
- 文字化け、崩れた文字、意味不明な文字、疑似文字を入れない。
- アルファベットのロゴや実在企業ロゴは入れない。

入れる文字:
タイトル: ${title}
ステップ: ${safeSteps.join(" → ")}
注意点: ${safeCautions.join(" / ")}

構図:
- 左から右へ流れる業務フローにする。
- ステップは最大4つの大きな箱で表現する。
- 各箱に短い日本語ラベルを入れる。
- 矢印、書類、チェックマーク、人物、カレンダーなどのアイコンを使う。
- 余白を広く取り、見やすくする。
- 淡いパステルカラー、白背景、青系アクセント。
- 業務で使える清潔感のある仕上げ。
- かわいすぎず、大学事務の資料として使える落ち着きにする。`;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => stripListPrefix(item).trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeManagerGate(value: unknown): ManagerGate {
  if (!value || typeof value !== "object") {
    return DEFAULT_MANAGER_GATE;
  }

  const data = value as Partial<ManagerGate>;

  return {
    canProceedAlone: normalizeStringArray(
      data.canProceedAlone,
      DEFAULT_MANAGER_GATE.canProceedAlone
    ),
    needManagerApproval: normalizeStringArray(
      data.needManagerApproval,
      DEFAULT_MANAGER_GATE.needManagerApproval
    ),
    approvalTiming: normalizeStringArray(
      data.approvalTiming,
      DEFAULT_MANAGER_GATE.approvalTiming
    ),
    managerQuestionTemplate:
      typeof data.managerQuestionTemplate === "string" &&
      data.managerQuestionTemplate.trim()
        ? data.managerQuestionTemplate.trim()
        : DEFAULT_MANAGER_GATE.managerQuestionTemplate,
  };
}

function fallbackPayload(message: string, debug?: SearchDebug): AnswerPayload {
  const fallbackSteps = [
    "VercelのEnvironment Variablesを確認する",
    "NOTION_API_KEY と NOTION_DATABASE_ID を確認する",
    "必要に応じて NOTION_DATABASE_ID_2 と NOTION_DATABASE_ID_3 を確認する",
    "Notion DBがRSJP Manual AIに共有されているか確認する",
    "api/ask.tsの内容を確認する",
    "GitHubへcommit / pushする",
    "Vercelで再デプロイする",
    "もう一度質問を送信する",
  ];

  const fallbackChecklist = [
    { text: "NOTION_API_KEYが設定されている" },
    { text: "NOTION_DATABASE_IDが設定されている" },
    { text: "必要に応じて NOTION_DATABASE_ID_2 と NOTION_DATABASE_ID_3 が設定されている" },
    { text: "Notion DBをIntegrationに共有している" },
    { text: "OPENAI_API_KEYが設定されている" },
    { text: "Vercelの最新デプロイが成功している" },
    { text: "先方へ回答する前に課長確認が必要な内容を確認した" },
  ];

  return {
    answer: message,
    managerGate: DEFAULT_MANAGER_GATE,
    steps: fallbackSteps,
    checklist: fallbackChecklist,
    imagePrompt: buildPonchiImagePrompt("API接続確認", fallbackSteps, fallbackChecklist),
    imageUrl: "",
    references: ["Notion / OpenAI API接続確認"],
    updatedAt: new Date().toISOString(),
    oldPolicyNote:
      "Notion APIまたはOpenAI APIの接続確認中のため、過去運用との差分確認は未実施です。",
    debug: {
      search: debug ?? createEmptyDebug(),
    },
  };
}

function normalizeReferences(dataReferences: unknown, fallbackReferences: string[]): string[] {
  if (!Array.isArray(dataReferences)) {
    return fallbackReferences.length > 0 ? fallbackReferences : ["Notion検索結果"];
  }

  const validReferences = dataReferences
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (validReferences.length === 0) {
    return fallbackReferences.length > 0 ? fallbackReferences : ["Notion検索結果"];
  }

  const matchedReferences = validReferences.filter((reference) =>
    fallbackReferences.some(
      (source) => source.includes(reference) || reference.includes(source)
    )
  );

  if (matchedReferences.length > 0) {
    return matchedReferences;
  }

  return fallbackReferences.length > 0 ? fallbackReferences : validReferences;
}

function normalizePayload(
  question: string,
  data: Partial<AnswerPayload>,
  references: string[],
  debug: SearchDebug
): AnswerPayload {
  const now = new Date().toISOString();

  const normalizedSteps =
    Array.isArray(data.steps) && data.steps.length > 0
      ? data.steps
          .map((step) => (typeof step === "string" ? stripListPrefix(step) : ""))
          .filter(Boolean)
      : ["質問内容を確認する", "Notion上の関連ページを確認する", "必要な手続きを進める"];

  const normalizedChecklist =
    Array.isArray(data.checklist) && data.checklist.length > 0
      ? data.checklist
          .map((item) => ({
            text:
              typeof item.text === "string"
                ? stripListPrefix(item.text)
                : stripListPrefix(String(item)),
          }))
          .filter((item) => item.text)
      : [
          { text: "回答内容を確認した" },
          { text: "必要な次の作業を確認した" },
          { text: "先方へ回答する前に課長確認が必要な点を確認した" },
        ];

  const normalizedManagerGate = normalizeManagerGate(data.managerGate);

  return {
    answer:
      typeof data.answer === "string" && data.answer.trim()
        ? data.answer
        : `「${question}」について回答を生成しましたが、answerが空でした。`,
    managerGate: normalizedManagerGate,
    steps: normalizedSteps,
    checklist: normalizedChecklist,
    imagePrompt: buildPonchiImagePrompt(question, normalizedSteps, normalizedChecklist),
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    references: normalizeReferences(data.references, references),
    updatedAt:
      typeof data.updatedAt === "string" && data.updatedAt.trim()
        ? data.updatedAt
        : now,
    oldPolicyNote:
      typeof data.oldPolicyNote === "string" && data.oldPolicyNote.trim()
        ? data.oldPolicyNote
        : "Notionの関連ページを参照しています。過去運用との差分は、Notion上の更新日と内容を確認してください。",
    debug: {
      search: debug,
    },
  };
}

function extractOutputText(responseJson: any): string {
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text;
  }

  const output = responseJson.output;

  if (!Array.isArray(output)) {
    return "";
  }

  for (const item of output) {
    const content = item?.content;

    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (typeof contentItem?.text === "string") {
        return contentItem.text;
      }
    }
  }

  return "";
}

async function notionRequest(path: string, options: RequestInit = {}) {
  const notionApiKey = process.env.NOTION_API_KEY;

  if (!notionApiKey) {
    throw new Error("NOTION_API_KEY is not set.");
  }

  return fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
      ...(options.headers ?? {}),
    },
  });
}

async function retrievePage(pageId: string): Promise<NotionPage | null> {
  const response = await notionRequest(`/v1/pages/${pageId}`, {
    method: "GET",
  });

  const rawText = await response.text();

  if (!response.ok) {
    return null;
  }

  return JSON.parse(rawText) as NotionPage;
}

async function getBlockChildren(blockId: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < MAX_BLOCK_CHILD_PAGES; i += 1) {
    const query = cursor ? `?page_size=100&start_cursor=${cursor}` : "?page_size=100";
    const response = await notionRequest(`/v1/blocks/${blockId}/children${query}`, {
      method: "GET",
    });

    const rawText = await response.text();

    if (!response.ok) {
      break;
    }

    const data = JSON.parse(rawText) as {
      results?: any[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    results.push(...(data.results ?? []));

    if (!data.has_more || !data.next_cursor) {
      break;
    }

    cursor = data.next_cursor;
  }

  return results;
}

async function collectNestedBlockContent(
  blockId: string,
  depth: number,
  lines: string[],
  childPages: ChildPageRef[],
  childDatabases: ChildDatabaseRef[]
): Promise<void> {
  if (depth > MAX_NESTED_BLOCK_DEPTH) return;
  if (lines.join("\n").length >= MAX_PAGE_CONTENT_LENGTH) return;

  const children = await getBlockChildren(blockId);

  for (const child of children) {
    const type = child?.type;

    if (type === "child_page") {
      const childTitle = child.child_page?.title ?? "子ページ";
      childPages.push({
        id: child.id,
        title: childTitle,
      });
      lines.push(`子ページ: ${childTitle}`);
    } else if (type === "child_database") {
      const databaseTitle = child.child_database?.title ?? "子データベース";
      childDatabases.push({
        id: child.id,
        title: databaseTitle,
      });
      lines.push(`子データベース: ${databaseTitle}`);
    } else {
      const childText = extractBlockText(child);

      if (childText) {
        lines.push(`${"  ".repeat(depth)}- ${childText}`);
      }
    }

    if (child?.has_children && lines.join("\n").length < MAX_PAGE_CONTENT_LENGTH) {
      await collectNestedBlockContent(child.id, depth + 1, lines, childPages, childDatabases);
    }

    if (lines.join("\n").length >= MAX_PAGE_CONTENT_LENGTH) {
      break;
    }
  }
}

async function getPageContentAndChildPages(
  pageId: string
): Promise<{ content: string; childPages: ChildPageRef[]; childDatabases: ChildDatabaseRef[] }> {
  const blocks = await getBlockChildren(pageId);
  const lines: string[] = [];
  const childPages: ChildPageRef[] = [];
  const childDatabases: ChildDatabaseRef[] = [];

  for (const block of blocks) {
    const type = block?.type;

    if (type === "child_page") {
      const childTitle = block.child_page?.title ?? "子ページ";
      childPages.push({
        id: block.id,
        title: childTitle,
      });
      lines.push(`子ページ: ${childTitle}`);
    } else if (type === "child_database") {
      const databaseTitle = block.child_database?.title ?? "子データベース";
      childDatabases.push({
        id: block.id,
        title: databaseTitle,
      });
      lines.push(`子データベース: ${databaseTitle}`);
    } else {
      const text = extractBlockText(block);

      if (text) {
        lines.push(text);
      }
    }

    if (block?.has_children && lines.join("\n").length < MAX_PAGE_CONTENT_LENGTH) {
      await collectNestedBlockContent(block.id, 1, lines, childPages, childDatabases);
    }

    if (lines.join("\n").length >= MAX_PAGE_CONTENT_LENGTH) {
      break;
    }
  }

  return {
    content: lines.join("\n").slice(0, MAX_PAGE_CONTENT_LENGTH),
    childPages,
    childDatabases,
  };
}

async function getDatabasePagesById(databaseId: string, maxPages = MAX_DATABASE_PAGES): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  while (pages.length < maxPages) {
    const response = await notionRequest(`/v1/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: Math.min(100, maxPages - pages.length),
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`Notion database query failed: HTTP ${response.status} ${rawText.slice(0, 800)}`);
    }

    const data = JSON.parse(rawText) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    pages.push(...(data.results ?? []));

    if (!data.has_more || !data.next_cursor) {
      break;
    }

    cursor = data.next_cursor;
  }

  return pages;
}

async function tryGetDatabasePagesById(databaseId: string, maxPages = MAX_CHILD_DATABASE_PAGES): Promise<NotionPage[]> {
  try {
    return await getDatabasePagesById(databaseId, maxPages);
  } catch {
    return [];
  }
}

async function searchNotionPages(query: string): Promise<NotionPage[]> {
  const trimmed = query.trim();

  if (!trimmed) return [];

  const response = await notionRequest("/v1/search", {
    method: "POST",
    body: JSON.stringify({
      query: trimmed,
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
      page_size: 12,
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    return [];
  }

  const data = JSON.parse(rawText) as {
    results?: NotionPage[];
  };

  return data.results ?? [];
}

async function getInitialNotionSeedPages(sources: NotionSourceConfig[]): Promise<NotionSeedPage[]> {
  const seedGroups: NotionSeedPage[][] = [];

  for (const source of sources) {
    if (source.type === "database") {
      try {
        const databasePages = await getDatabasePagesById(source.id, MAX_DATABASE_PAGES);

        seedGroups.push(databasePages.map((page) => ({ page, source })));
      } catch {
        seedGroups.push([]);
      }
    } else if (source.type === "page") {
      const rootPage = await retrievePage(source.id);

      if (rootPage) {
        seedGroups.push([{ page: rootPage, source }]);
      } else {
        seedGroups.push([]);
      }
    }
  }

  const maxLength = Math.max(0, ...seedGroups.map((group) => group.length));
  const interleavedSeeds: NotionSeedPage[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of seedGroups) {
      const seed = group[index];

      if (seed) {
        interleavedSeeds.push(seed);
      }
    }
  }

  return interleavedSeeds;
}

function createShallowPropertyCandidate(seed: NotionSeedPage): NotionContextPage {
  const rawTitle = extractPageTitle(seed.page);
  const titlePath = seed.parentPath ? `${seed.parentPath} > ${rawTitle}` : rawTitle;
  const propertyText = extractPagePropertiesText(seed.page);

  return {
    id: seed.page.id,
    title: titlePath,
    url: seed.page.url,
    lastEditedTime: seed.page.last_edited_time,
    content: propertyText ? "【データベースプロパティ】\n" + propertyText : "",
    propertyText,
    blockText: "",
    score: 0,
    sourceName: seed.source.name,
    sourceId: seed.source.id,
    sourceType: seed.source.type,
  };
}

async function collectPageCandidate(
  page: NotionPage,
  depth: number,
  parentPath: string,
  seen: Set<string>,
  output: NotionContextPage[],
  source: NotionSourceConfig
): Promise<void> {
  if (output.length >= MAX_DISCOVERED_PAGES) return;
  if (seen.has(page.id)) return;

  seen.add(page.id);

  const rawTitle = extractPageTitle(page);
  const titlePath = parentPath ? `${parentPath} > ${rawTitle}` : rawTitle;
  const propertyText = extractPagePropertiesText(page);

  const { content: blockText, childPages, childDatabases } = await getPageContentAndChildPages(page.id);

  const combinedContent = [
    propertyText ? "【データベースプロパティ】\n" + propertyText : "",
    blockText ? "【ページ本文】\n" + blockText : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_PAGE_CONTENT_LENGTH);

  output.push({
    id: page.id,
    title: titlePath,
    url: page.url,
    lastEditedTime: page.last_edited_time,
    content: combinedContent,
    propertyText,
    blockText,
    score: 0,
    sourceName: source.name,
    sourceId: source.id,
    sourceType: source.type,
  });

  if (depth >= MAX_RECURSION_DEPTH) return;

  for (const childPage of childPages.slice(0, MAX_CHILD_PAGES_PER_PAGE)) {
    if (output.length >= MAX_DISCOVERED_PAGES) break;
    if (seen.has(childPage.id)) continue;

    const child = await retrievePage(childPage.id);

    if (!child) {
      output.push({
        id: childPage.id,
        title: `${titlePath} > ${childPage.title}`,
        url: undefined,
        lastEditedTime: undefined,
        content: "",
        propertyText: "",
        blockText: "",
        score: 0,
        sourceName: source.name,
        sourceId: source.id,
        sourceType: source.type,
      });
      seen.add(childPage.id);
      continue;
    }

    await collectPageCandidate(child, depth + 1, titlePath, seen, output, source);
  }

  for (const childDatabase of childDatabases.slice(0, 8)) {
    if (output.length >= MAX_DISCOVERED_PAGES) break;

    const databasePages = await tryGetDatabasePagesById(
      childDatabase.id,
      MAX_CHILD_DATABASE_PAGES
    );

    const childDatabaseSource: NotionSourceConfig = {
      id: childDatabase.id,
      name: `${source.name} / ${childDatabase.title}`,
      type: "database",
    };

    for (const databasePage of databasePages) {
      if (output.length >= MAX_DISCOVERED_PAGES) break;
      await collectPageCandidate(
        databasePage,
        depth + 1,
        `${titlePath} > ${childDatabase.title}`,
        seen,
        output,
        childDatabaseSource
      );
    }
  }
}

function mergeCandidates(
  shallowCandidates: NotionContextPage[],
  detailedCandidates: NotionContextPage[]
): NotionContextPage[] {
  const map = new Map<string, NotionContextPage>();

  for (const candidate of shallowCandidates) {
    map.set(candidate.id, candidate);
  }

  for (const candidate of detailedCandidates) {
    const existing = map.get(candidate.id);

    if (!existing) {
      map.set(candidate.id, candidate);
      continue;
    }

    map.set(candidate.id, {
      ...candidate,
      propertyText: candidate.propertyText || existing.propertyText,
      blockText: candidate.blockText || existing.blockText,
      content:
        candidate.content.trim() ||
        existing.content.trim() ||
        [
          candidate.propertyText || existing.propertyText || "",
          candidate.blockText || existing.blockText || "",
        ]
          .filter(Boolean)
          .join("\n\n"),
    });
  }

  return Array.from(map.values());
}

function selectBalancedPages(
  scoredPages: NotionContextPage[],
  configuredSources: NotionSourceConfig[],
  maxScore: number,
  minimumScore: number
): NotionContextPage[] {
  const selected = new Map<string, NotionContextPage>();
  const filtered =
    maxScore <= 0
      ? scoredPages.slice(0, 8)
      : scoredPages.filter((page) => page.score >= minimumScore);

  for (const source of configuredSources) {
    const sourcePages = scoredPages.filter(
      (page) => page.sourceId === source.id || page.sourceName.startsWith(source.name)
    );

    const positiveSourcePages = sourcePages.filter((page) => page.score > 0);
    const candidate = positiveSourcePages[0] ?? sourcePages[0];

    if (candidate && selected.size < MAX_CONTEXT_PAGES) {
      selected.set(candidate.id, candidate);
    }
  }

  for (const page of filtered.length > 0 ? filtered : scoredPages) {
    if (selected.size >= MAX_CONTEXT_PAGES) break;
    selected.set(page.id, page);
  }

  return Array.from(selected.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_PAGES);
}

async function getNotionContext(question: string): Promise<NotionContextResult> {
  const searchTerms = buildSearchTerms(question);
  const searchQueries = buildSearchQueries(question, searchTerms);
  const sources = getConfiguredNotionSources();

  if (sources.length === 0) {
    throw new Error(
      "NOTION_DATABASE_ID is not set. Add NOTION_DATABASE_ID and optional NOTION_DATABASE_ID_2 / NOTION_DATABASE_ID_3 to Vercel Environment Variables."
    );
  }

  const seedPageMap = new Map<string, NotionSeedPage>();
  const initialSeedPages = await getInitialNotionSeedPages(sources);

  for (const seed of initialSeedPages) {
    seedPageMap.set(seed.page.id, seed);
  }

  for (const query of searchQueries) {
    const foundPages = await searchNotionPages(query);

    for (const page of foundPages) {
      if (seedPageMap.has(page.id)) continue;

      seedPageMap.set(page.id, {
        page,
        source: {
          id: "notion-search",
          name: "Notion Search",
          type: "search",
        },
      });
    }
  }

  const seedPages = Array.from(seedPageMap.values());

  const shallowCandidates = seedPages
    .slice(0, MAX_SHALLOW_PROPERTY_PAGES)
    .map((seed) => createShallowPropertyCandidate(seed));

  const seen = new Set<string>();
  const detailedCandidates: NotionContextPage[] = [];

  const prioritySeeds = seedPages
    .map((seed) => {
      const candidate = createShallowPropertyCandidate(seed);
      return {
        seed,
        score: scorePage(question, candidate),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.seed);

  for (const seed of prioritySeeds.slice(0, MAX_SEED_PAGES)) {
    if (detailedCandidates.length >= MAX_DISCOVERED_PAGES) break;

    await collectPageCandidate(
      seed.page,
      0,
      seed.parentPath ?? "",
      seen,
      detailedCandidates,
      seed.source
    );
  }

  const discoveredPages = mergeCandidates(shallowCandidates, detailedCandidates);

  const scoredPages = discoveredPages
    .map((page) => ({
      ...page,
      score: scorePage(question, page),
    }))
    .sort((a, b) => b.score - a.score);

  const maxScore = scoredPages[0]?.score ?? 0;
  const minimumScore = maxScore <= 0 ? 0 : Math.max(5, Math.min(22, maxScore * 0.22));

  const selectedPages = selectBalancedPages(scoredPages, sources, maxScore, minimumScore);

  const debug = createSearchDebug(
    searchTerms,
    searchQueries,
    initialSeedPages.length,
    seedPageMap.size,
    scoredPages,
    selectedPages,
    maxScore,
    minimumScore
  );

  return {
    pages: selectedPages,
    debug,
  };
}

function buildContextText(pages: NotionContextPage[]): string {
  if (pages.length === 0) {
    return "Notionから関連ページを取得できませんでした。";
  }

  return pages
    .map((page, index) => {
      return `【参照${index + 1}】
ナレッジベース: ${page.sourceName}
タイトル: ${page.title}
関連度スコア: ${page.score}
最終更新: ${page.lastEditedTime ?? "不明"}
URL: ${page.url ?? "URLなし"}
内容:
${page.content || "本文なし"}
`;
    })
    .join("\n\n");
}

async function callOpenAI(
  question: string,
  requestedBy: string,
  contextPages: NotionContextPage[],
  debug: SearchDebug
): Promise<AnswerPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  if (!apiKey) {
    return fallbackPayload(
      "OPENAI_API_KEY がVercelの環境変数に設定されていません。VercelのEnvironment Variablesに OPENAI_API_KEY を追加し、再デプロイしてください。",
      debug
    );
  }

  const contextText = buildContextText(contextPages);
  const referenceTitles = contextPages
    .filter((page) => page.score > 0)
    .map((page) => `${page.sourceName} > ${page.title}`)
    .filter(Boolean);

  const prompt = `
あなたはRSJP業務マニュアルAIです。
以下の複数のNotionナレッジベース情報を根拠に、社内業務を初心者にも分かるように説明してください。

このAIは、単なる回答作成ツールではありません。
新人職員が自分で作業を進められるようにしつつ、危ない判断の前に課長確認へ誘導する業務ナビです。

質問者:
${requestedBy || "unknown"}

質問:
${question}

Notionマニュアル情報:
${contextText}

回答条件:
- 日本語で回答する
- 初心者向けに、やさしく具体的に説明する
- Notionマニュアル情報に書かれている内容を最優先する
- データベースプロパティにある Question / Answer / Program / Category / Keyword / Status / SourceURL / Date / UpdatedAt の内容も、ページ本文と同じ重要度で扱う
- Question / Answer型のFAQデータベースでは、Answer欄を最重要の回答根拠として扱う
- 複数のNotionナレッジベースに情報がある場合は、どのナレッジベースの情報かを意識して整理する
- RSJP固有の内容はRSJP Manualを優先し、共通ルールや一般手順はGeneral Manual、FAQ、Additional Manualなどの一般ナレッジも参考にする
- 日程、開始日、終了日、チェックイン、チェックアウト、費用、支払期限、通学方法、交通手段、禁止事項など、確定情報を問う質問では、複数の参照元を照合する
- 複数のNotion情報に矛盾がある場合は、片方だけを断定せず、「情報に差異があります」と明記し、どのページに何と書かれているかを分けて説明する
- 日程情報については、Question/Answer型データベースのAnswer欄にある値も必ず確認対象にする
- 通学方法、交通手段、徒歩、バス、電車、自転車、自動車、Pledge、誓約書、禁止事項に関する質問では、FAQデータベースのAnswer欄を必ず確認対象にする
- 参加対象外、応募資格、参加資格、受入可否、対象学生、eligibility などに関わる質問では、該当ページの根拠がない限り、受入可否を断定しない
- 参加対象外の学生への案内や例外対応は、原則として課長確認が必要な判断として扱う
- Notionマニュアル情報に書かれていない内容は、推測で断定しない
- 情報が不足している場合は「Notion上では確認できませんでした」と明記する
- ただし、Notion情報から安全に言える範囲の一般的な流れは「確認が必要な一般的流れ」として分けて書く
- 担当者個人に依存した表現を避ける
- 必要に応じて「最新の学内ルール・担当部署の指示を確認してください」と入れる
- referencesには実際に使ったNotionページタイトルのみを入れる。可能なら「ナレッジベース名 > ページタイトル」の形にする
- imageUrlは空文字にする
- imagePromptには、回答内容を見やすいポンチ絵・親しみやすいアニメ調の業務図解にするための具体的な日本語プロンプトを書く
- imagePromptでは、短い日本語ラベル、数字、項目名を入れてよい
- imagePromptでは、文字は少なめ、各ラベルは短く大きく読みやすくする
- imagePromptでは、日本で使われる正しい日本語漢字を使い、中国語の簡体字・繁体字・中国式漢字を使わないと明記する
- imagePromptでは、文字化け、崩れた文字、意味不明な文字、疑似文字を入れないと明記する
- imagePromptでは、実在企業ロゴ、大学ロゴ、商標ロゴは入れないと明記する
- stepsの各要素には、番号、丸数字、箇条書き記号を入れない
- checklistの各textには、番号、丸数字、箇条書き記号を入れない
- answer内では「Notionで確認できたこと」「Notionで確認できなかったこと」「次に確認すること」を自然に分ける

課長確認ゲートの作成条件:
- managerGateを必ず作成する
- managerGate.canProceedAloneには、新人が単独で進めてもよい作業だけを入れる
- managerGate.needManagerApprovalには、課長確認が必要な判断を入れる
- managerGate.approvalTimingには、どのタイミングで課長確認するかを入れる
- managerGate.managerQuestionTemplateには、課長へ確認するための短い文例を入れる
- managerGate内の各配列要素には、番号、丸数字、箇条書き記号を入れない
- Notion上で根拠が不足する場合は、先方へ回答する前に課長確認が必要とする
- 断定できないことは、課長確認が必要な項目に寄せる

課長確認が必要な固定ルール:
以下に関わる内容は、原則として課長確認が必要です。
- 費用
- 見積
- 請求
- 支払方法
- 支払期限
- キャンセル料
- 契約
- 合意書
- 受入可否
- 参加対象外への案内
- 例外対応
- 学内ルールに明記されていない判断
- 先方へ確約する内容
- 大学や相手機関との交渉
- 過去対応と異なる判断
- 部署間調整が必要なこと
- トラブル、クレーム対応
- 個人情報、アレルギー、医療情報に関わること

新人が進めてよい固定ルール:
以下は、新人が作業として進めてよい範囲です。
ただし、先方送信前、確定前、判断に迷う場合は課長確認が必要です。
- Notionに明記された手順の確認
- 事実関係の整理
- 必要情報の洗い出し
- 下書き作成
- チェックリスト確認
- 参照元の確認
- 課長確認用メモの作成
- 既存テンプレートに沿った準備
`;

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: {
        effort: "low",
      },
      text: {
        format: {
          type: "json_schema",
          name: "rsjp_manual_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "answer",
              "managerGate",
              "steps",
              "checklist",
              "imagePrompt",
              "imageUrl",
              "references",
              "updatedAt",
              "oldPolicyNote",
            ],
            properties: {
              answer: {
                type: "string",
              },
              managerGate: {
                type: "object",
                additionalProperties: false,
                required: [
                  "canProceedAlone",
                  "needManagerApproval",
                  "approvalTiming",
                  "managerQuestionTemplate",
                ],
                properties: {
                  canProceedAlone: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  needManagerApproval: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  approvalTiming: {
                    type: "array",
                    items: {
                      type: "string",
                    },
                  },
                  managerQuestionTemplate: {
                    type: "string",
                  },
                },
              },
              steps: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              checklist: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["text"],
                  properties: {
                    text: {
                      type: "string",
                    },
                  },
                },
              },
              imagePrompt: {
                type: "string",
              },
              imageUrl: {
                type: "string",
              },
              references: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              updatedAt: {
                type: "string",
              },
              oldPolicyNote: {
                type: "string",
              },
            },
          },
        },
      },
    }),
  });

  const raw = await openAiResponse.text();

  if (!openAiResponse.ok) {
    return fallbackPayload(
      `OpenAI APIへの接続に失敗しました。

HTTP ${openAiResponse.status}

${raw.slice(0, 1000)}`,
      debug
    );
  }

  let responseJson: any;

  try {
    responseJson = JSON.parse(raw);
  } catch {
    return fallbackPayload(
      `OpenAI APIからJSONではない応答が返りました。

${raw.slice(0, 1000)}`,
      debug
    );
  }

  const outputText = extractOutputText(responseJson);

  if (!outputText) {
    return fallbackPayload(
      `OpenAI APIの応答から本文を取り出せませんでした。

${raw.slice(0, 1000)}`,
      debug
    );
  }

  try {
    const parsed = JSON.parse(outputText) as Partial<AnswerPayload>;
    return normalizePayload(question, parsed, referenceTitles, debug);
  } catch {
    return fallbackPayload(
      `OpenAI APIの応答をJSONとして読み取れませんでした。

${outputText.slice(0, 1000)}`,
      debug
    );
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "OPTIONS") {
    return response.status(200).json({ ok: true });
  }

  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Method Not Allowed",
      message: "POSTでアクセスしてください。",
    });
  }

  const body = parseBody(request.body);
  const question = getQuestion(body);
  const requestedBy = body.requestedBy ?? "unknown";

  try {
    const contextResult = await getNotionContext(question);
    const answerPayload = await callOpenAI(
      question,
      requestedBy,
      contextResult.pages,
      contextResult.debug
    );

    return response.status(200).json(answerPayload);
  } catch (error) {
    return response.status(200).json(
      fallbackPayload(
        `Notion検索または回答生成中にエラーが発生しました。

${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}