// FILE: api/ask.ts
// PATH: api/ask.ts

type AskRequestBody = {
  question?: string;
  requestedBy?: string;
  dataSource?: {
    provider?: string;
    notionDatabaseUrl?: string;
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
  };
};

type ChecklistItem = {
  text: string;
};

type SearchDebugPage = {
  title: string;
  score: number;
  url?: string;
  lastEditedTime?: string;
  contentPreview: string;
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
};

type AnswerPayload = {
  answer: string;
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

type NotionContextPage = {
  id: string;
  title: string;
  url?: string;
  lastEditedTime?: string;
  content: string;
  score: number;
};

type NotionContextResult = {
  pages: NotionContextPage[];
  debug: SearchDebug;
};

const MAX_CONTEXT_PAGES = 9;
const MAX_DISCOVERED_PAGES = 120;
const MAX_PAGE_CONTENT_LENGTH = 5200;
const MAX_DATABASE_PAGES = 160;
const MAX_SEED_PAGES = 90;
const MAX_BLOCK_CHILD_PAGES = 5;
const MAX_CHILD_PAGES_PER_PAGE = 30;
const MAX_CHILD_DATABASE_PAGES = 45;
const MAX_RECURSION_DEPTH = 4;
const MAX_NESTED_BLOCK_DEPTH = 3;

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

  const matchedTerms = domainTerms.filter((term) => question.includes(term));

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

  queries.push(...terms.slice(0, 10));

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(
    0,
    12
  );
}

function scorePage(question: string, page: NotionContextPage): number {
  const terms = buildSearchTerms(question);
  const title = normalizeTextForSearch(page.title);
  const content = normalizeTextForSearch(page.content);
  const q = normalizeTextForSearch(question);

  let score = 0;

  if (title.includes(q)) score += 45;
  if (content.includes(q)) score += 20;

  for (const term of terms) {
    const t = normalizeTextForSearch(term);

    if (!t) continue;

    if (title.includes(t)) score += 20;
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

  if (question.includes("バス") && title.includes("経理")) {
    score += 10;
  }

  if (question.includes("バス") && content.includes("バス")) {
    score += 14;
  }

  if (question.includes("バス") && content.includes("見積")) {
    score += 10;
  }

  if (question.includes("バス") && content.includes("発注")) {
    score += 10;
  }

  if (question.includes("発注") && content.includes("coupa")) {
    score += 10;
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
  return {
    searchTerms,
    searchQueries,
    databasePageCount,
    seedPageCount,
    discoveredPageCount: discoveredPages.length,
    selectedPageCount: selectedPages.length,
    maxScore,
    minimumScore,
    selectedPages: selectedPages.map((page) => ({
      title: page.title,
      score: page.score,
      url: page.url,
      lastEditedTime: page.lastEditedTime,
      contentPreview: page.content.replace(/\s+/g, " ").slice(0, 220),
    })),
  };
}

function fallbackPayload(message: string, debug?: SearchDebug): AnswerPayload {
  return {
    answer: message,
    steps: [
      "VercelのEnvironment Variablesを確認する",
      "NOTION_API_KEY と NOTION_DATABASE_ID を確認する",
      "Notion DBがRSJP Manual AIに共有されているか確認する",
      "api/ask.tsの内容を確認する",
      "GitHubへcommit / pushする",
      "Vercelで再デプロイする",
      "もう一度質問を送信する",
    ],
    checklist: [
      { text: "NOTION_API_KEYが設定されている" },
      { text: "NOTION_DATABASE_IDが設定されている" },
      { text: "Notion DBをIntegrationに共有している" },
      { text: "OPENAI_API_KEYが設定されている" },
      { text: "Vercelの最新デプロイが成功している" },
    ],
    imagePrompt:
      "16:9横長。文字なし。白背景と淡い青系アクセント。Vercel、環境変数、Notion共有設定、再デプロイを連想させる抽象的な業務フロー背景。文字、数字、ラベル、ロゴは入れない。",
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
      : [{ text: "回答内容を確認した" }, { text: "必要な次の作業を確認した" }];

  return {
    answer:
      typeof data.answer === "string" && data.answer.trim()
        ? data.answer
        : `「${question}」について回答を生成しましたが、answerが空でした。`,
    steps: normalizedSteps,
    checklist: normalizedChecklist,
    imagePrompt:
      typeof data.imagePrompt === "string" && data.imagePrompt.trim()
        ? data.imagePrompt
        : "16:9横長。文字なし。白背景と淡い青系アクセント。業務手順を連想させる抽象的な背景。矢印、書類、チェックマーク、人物アイコンのみ。文字、数字、ラベル、ロゴは入れない。",
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

async function getDatabasePages(): Promise<NotionPage[]> {
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!databaseId) {
    throw new Error("NOTION_DATABASE_ID is not set.");
  }

  return getDatabasePagesById(databaseId, MAX_DATABASE_PAGES);
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

async function collectPageCandidate(
  page: NotionPage,
  depth: number,
  parentPath: string,
  seen: Set<string>,
  output: NotionContextPage[]
): Promise<void> {
  if (output.length >= MAX_DISCOVERED_PAGES) return;
  if (seen.has(page.id)) return;

  seen.add(page.id);

  const rawTitle = extractPageTitle(page);
  const titlePath = parentPath ? `${parentPath} > ${rawTitle}` : rawTitle;

  const { content, childPages, childDatabases } = await getPageContentAndChildPages(page.id);

  output.push({
    id: page.id,
    title: titlePath,
    url: page.url,
    lastEditedTime: page.last_edited_time,
    content,
    score: 0,
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
        score: 0,
      });
      seen.add(childPage.id);
      continue;
    }

    await collectPageCandidate(child, depth + 1, titlePath, seen, output);
  }

  for (const childDatabase of childDatabases.slice(0, 8)) {
    if (output.length >= MAX_DISCOVERED_PAGES) break;

    const databasePages = await tryGetDatabasePagesById(
      childDatabase.id,
      MAX_CHILD_DATABASE_PAGES
    );

    for (const databasePage of databasePages) {
      if (output.length >= MAX_DISCOVERED_PAGES) break;
      await collectPageCandidate(
        databasePage,
        depth + 1,
        `${titlePath} > ${childDatabase.title}`,
        seen,
        output
      );
    }
  }
}

async function getNotionContext(question: string): Promise<NotionContextResult> {
  const searchTerms = buildSearchTerms(question);
  const searchQueries = buildSearchQueries(question, searchTerms);

  const seedPageMap = new Map<string, NotionPage>();

  const databasePages = await getDatabasePages();

  for (const page of databasePages) {
    seedPageMap.set(page.id, page);
  }

  for (const query of searchQueries) {
    const foundPages = await searchNotionPages(query);

    for (const page of foundPages) {
      seedPageMap.set(page.id, page);
    }
  }

  const seen = new Set<string>();
  const discoveredPages: NotionContextPage[] = [];

  for (const page of Array.from(seedPageMap.values()).slice(0, MAX_SEED_PAGES)) {
    if (discoveredPages.length >= MAX_DISCOVERED_PAGES) break;
    await collectPageCandidate(page, 0, "", seen, discoveredPages);
  }

  const scoredPages = discoveredPages
    .map((page) => ({
      ...page,
      score: scorePage(question, page),
    }))
    .sort((a, b) => b.score - a.score);

  const maxScore = scoredPages[0]?.score ?? 0;
  const minimumScore = maxScore <= 0 ? 0 : Math.max(5, Math.min(22, maxScore * 0.22));

  const filtered =
    maxScore <= 0
      ? scoredPages.slice(0, 4)
      : scoredPages.filter((page) => page.score >= minimumScore);

  const selectedPages = (filtered.length > 0 ? filtered : scoredPages).slice(
    0,
    MAX_CONTEXT_PAGES
  );

  const debug = createSearchDebug(
    searchTerms,
    searchQueries,
    databasePages.length,
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
    .map((page) => page.title)
    .filter(Boolean);

  const prompt = `
あなたはRSJP業務マニュアルAIです。
以下のNotionマニュアル情報を根拠に、社内業務を初心者にも分かるように説明してください。

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
- Notionマニュアル情報に書かれていない内容は、推測で断定しない
- 情報が不足している場合は「Notion上では確認できませんでした」と明記する
- ただし、Notion情報から安全に言える範囲の一般的な流れは「確認が必要な一般的流れ」として分けて書く
- 担当者個人に依存した表現を避ける
- 必要に応じて「最新の学内ルール・担当部署の指示を確認してください」と入れる
- referencesには実際に使ったNotionページタイトルのみを入れる
- imageUrlは空文字にする
- imagePromptには、文字なしの背景画像を作るための具体的な日本語プロンプトを書く
- stepsの各要素には、番号、丸数字、箇条書き記号を入れない
- checklistの各textには、番号、丸数字、箇条書き記号を入れない
- imagePromptでは「文字、数字、ラベル、ロゴを入れない」と明記する
- answer内では「Notionで確認できたこと」「Notionで確認できなかったこと」「次に確認すること」を自然に分ける
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
