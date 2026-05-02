// FILE: api/ask.ts
// PATH: api/ask.ts

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  maxDuration: 60,
};

type RequestLike = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (payload: unknown) => void;
    end?: (payload?: string) => void;
  };
  json: (payload: unknown) => void;
  end: (payload?: string) => void;
};

type NotionProperty = Record<string, any>;

type NotionPage = {
  id: string;
  object?: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
};

type NotionBlock = {
  id: string;
  type?: string;
  has_children?: boolean;
  [key: string]: any;
};

type NotionListResponse = {
  results?: unknown[];
  next_cursor?: string | null;
  has_more?: boolean;
};

type NotionDatabase = {
  id: string;
  object?: string;
  properties?: Record<string, Record<string, any>>;
};

type SearchDebugPage = {
  title: string;
  score: number;
  url?: string;
  lastEditedTime?: string;
  contentPreview: string;
  sourceName?: string;
  sourceType?: string;
  matchReason?: string;
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
  errors: string[];
};

type ManagerGate = {
  canProceedAlone: string[];
  needManagerApproval: string[];
  approvalTiming: string[];
  managerQuestionTemplate: string;
};

type ChecklistItem = {
  text: string;
  done?: boolean;
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
  debug: {
    search: SearchDebug;
  };
};

type SourceConfig = {
  name: string;
  envName: string;
  id: string;
  type: "database" | "rootPage" | "search";
};

type SearchDocument = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: string;
  text: string;
  propertyText: string;
  blockText: string;
  questionText: string;
  answerText: string;
  keywordText: string;
  categoryText: string;
  programText: string;
  statusText: string;
  score: number;
  lastEditedTime: string;
};

const NOTION_VERSION = "2022-06-28";

const MAX_DATABASE_RECENT_PAGES_PER_DB = 12;
const MAX_DATABASE_TARGETED_PAGES_PER_DB = 24;
const MAX_DATABASE_PAGES_PER_DB = 36;
const MAX_SEARCH_PAGES = 8;
const MAX_ROOT_PAGES = 2;
const MAX_SELECTED_DOCS = 6;
const MAX_SEEDS_TO_ENRICH = 8;
const MAX_BLOCKS_PER_PAGE = 45;
const MAX_CHILD_BLOCKS_PER_PARENT = 12;
const MAX_CONTEXT_CHARS_PER_DOC = 1700;
const MAX_OUTPUT_TOKENS = 1700;

const MIN_CONFIDENT_SCORE = 45;
const MIN_SEARCH_API_SCORE_WHEN_DATABASE_HIT_EXISTS = 80;

const NOTION_TIMEOUT_MS = 7000;
const OPENAI_TIMEOUT_MS = 18000;

const QUESTION_PROPERTY_NAMES = [
  "Question",
  "質問",
  "Q",
  "Title",
  "title",
  "Name",
  "name",
  "名前",
  "件名",
];

const ANSWER_PROPERTY_NAMES = [
  "Answer",
  "回答",
  "A",
  "本文",
  "内容",
  "説明",
  "Description",
  "WebDisplay",
  "Memo",
  "メモ",
];

const KEYWORD_PROPERTY_NAMES = [
  "Keyword",
  "Keywords",
  "キーワード",
  "タグ",
  "Tag",
  "Tags",
];

const CATEGORY_PROPERTY_NAMES = [
  "Category",
  "カテゴリ",
  "カテゴリー",
  "分類",
  "種別",
];

const PROGRAM_PROPERTY_NAMES = [
  "Program",
  "プログラム",
  "ProgramName",
  "Program Name",
  "対象プログラム",
];

const STATUS_PROPERTY_NAMES = [
  "Status",
  "ステータス",
  "状態",
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

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    const response = res.status(204);
    if (response.end) {
      response.end();
      return;
    }
    res.end();
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      name: "RSJP Manual AI API",
      endpoint: "/api/ask",
      message: "API Function is available. Please send POST { question: string }.",
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      ok: false,
      error: "Method Not Allowed",
      message: "Please use POST.",
    });
    return;
  }

  const question = getQuestionFromRequest(req);

  if (!question) {
    sendJson(
      res,
      200,
      createFallbackPayload({
        question: "",
        documents: [],
        debug: createEmptyDebug(""),
        note: "質問が空です。質問を入力してください。",
      })
    );
    return;
  }

  try {
    const searchResult = await searchKnowledge(question);
    const answerPayload = await buildAnswer(question, searchResult.documents, searchResult.debug);

    sendJson(res, 200, answerPayload);
  } catch (error) {
    const debug = createEmptyDebug(question);
    debug.errors.push(getErrorMessage(error));

    sendJson(
      res,
      200,
      createFallbackPayload({
        question,
        documents: [],
        debug,
        note: "API処理中にエラーが発生しました。画面が落ちない安全形式で暫定回答を返しています。",
      })
    );
  }
}

function setCorsHeaders(res: ResponseLike): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: ResponseLike, statusCode: number, payload: unknown): void {
  res.status(statusCode).json(payload);
}

function getQuestionFromRequest(req: RequestLike): string {
  const body = parseBody(req.body);

  if (body && typeof body.question === "string") {
    return body.question.trim();
  }

  if (body && typeof body.query === "string") {
    return body.query.trim();
  }

  if (body && typeof body.message === "string") {
    return body.message.trim();
  }

  if (req.query && typeof req.query.question === "string") {
    return req.query.question.trim();
  }

  return "";
}

function parseBody(body: unknown): Record<string, any> | null {
  if (!body) {
    return null;
  }

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
    } catch {
      return null;
    }
  }

  if (typeof body === "object") {
    return body as Record<string, any>;
  }

  return null;
}

async function searchKnowledge(question: string): Promise<{
  documents: SearchDocument[];
  debug: SearchDebug;
}> {
  const debug = createEmptyDebug(question);
  const notionApiKey = getEnv("NOTION_API_KEY");

  if (!notionApiKey) {
    debug.errors.push("NOTION_API_KEY が設定されていません。");
    return { documents: [], debug };
  }

  const searchTerms = createSearchTerms(question);
  debug.searchTerms = searchTerms;
  debug.searchQueries = createSearchQueries(question, searchTerms);

  const databaseSources: SourceConfig[] = [
    {
      name: "Main Manual Database",
      envName: "NOTION_DATABASE_ID",
      id: getEnv("NOTION_DATABASE_ID"),
      type: "database",
    },
    {
      name: "Manual Database 2",
      envName: "NOTION_DATABASE_ID_2",
      id: getEnv("NOTION_DATABASE_ID_2"),
      type: "database",
    },
    {
      name: "Manual Database 3",
      envName: "NOTION_DATABASE_ID_3",
      id: getEnv("NOTION_DATABASE_ID_3"),
      type: "database",
    },
  ];

  const rootPageSources: SourceConfig[] = [
    {
      name: "Root Page 1",
      envName: "NOTION_ROOT_PAGE_ID",
      id: getEnv("NOTION_ROOT_PAGE_ID"),
      type: "rootPage",
    },
    {
      name: "Root Page 2",
      envName: "NOTION_ROOT_PAGE_ID_2",
      id: getEnv("NOTION_ROOT_PAGE_ID_2"),
      type: "rootPage",
    },
  ];

  const seedDocuments: SearchDocument[] = [];

  const databaseTasks = databaseSources.map(async (source) => {
    if (!source.id) {
      debug.sourceCounts[source.name] = 0;
      return;
    }

    try {
      const pages = await queryDatabasePages(source.id, question, searchTerms);
      debug.databasePageCount += pages.length;
      debug.sourceCounts[source.name] = pages.length;

      for (const page of pages) {
        seedDocuments.push(pageToDocument(page, source, question, searchTerms));
      }
    } catch (error) {
      debug.errors.push(`${source.envName}: ${getErrorMessage(error)}`);
      debug.sourceCounts[source.name] = 0;
    }
  });

  const searchTask = searchNotionPages(question)
    .then((pages) => {
      debug.seedPageCount += pages.length;
      debug.sourceCounts["Notion Search API"] = pages.length;

      const source: SourceConfig = {
        name: "Notion Search API",
        envName: "NOTION_SEARCH",
        id: "",
        type: "search",
      };

      for (const page of pages) {
        seedDocuments.push(pageToDocument(page, source, question, searchTerms));
      }
    })
    .catch((error) => {
      debug.errors.push(`NOTION_SEARCH: ${getErrorMessage(error)}`);
      debug.sourceCounts["Notion Search API"] = 0;
    });

  const rootTasks = rootPageSources.slice(0, MAX_ROOT_PAGES).map(async (source) => {
    if (!source.id) {
      debug.sourceCounts[source.name] = 0;
      return;
    }

    try {
      const page = await getPage(source.id);
      debug.sourceCounts[source.name] = 1;
      seedDocuments.push(pageToDocument(page, source, question, searchTerms));
    } catch (error) {
      debug.errors.push(`${source.envName}: ${getErrorMessage(error)}`);
      debug.sourceCounts[source.name] = 0;
    }
  });

  await Promise.all([...databaseTasks, searchTask, ...rootTasks]);

  const dedupedSeeds = dedupeDocuments(seedDocuments)
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc, question, searchTerms),
    }))
    .sort(sortDocumentsByRelevance);

  const topSeeds = dedupedSeeds.slice(0, MAX_SEEDS_TO_ENRICH);

  const enrichedDocuments = await Promise.all(
    topSeeds.map(async (doc) => {
      try {
        const blockText = await readPageBlockText(doc.id);
        const text = [doc.propertyText, blockText].filter(Boolean).join("\n\n").trim();

        const enriched: SearchDocument = {
          ...doc,
          blockText,
          text: text || doc.text,
        };

        enriched.score = scoreDocument(enriched, question, searchTerms);
        return enriched;
      } catch (error) {
        debug.errors.push(`${doc.title}: ${getErrorMessage(error)}`);
        return doc;
      }
    })
  );

  const rankedDocuments = enrichedDocuments
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc, question, searchTerms),
    }))
    .sort(sortDocumentsByRelevance);

  const finalDocuments = selectFinalDocuments(rankedDocuments);

  debug.discoveredPageCount = dedupedSeeds.length;
  debug.selectedPageCount = finalDocuments.length;
  debug.maxScore = finalDocuments.length > 0 ? finalDocuments[0].score : 0;
  debug.minimumScore = finalDocuments.length > 0 ? finalDocuments[finalDocuments.length - 1].score : 0;
  debug.selectedPages = finalDocuments.map((doc) => ({
    title: doc.title,
    score: doc.score,
    url: doc.url,
    lastEditedTime: doc.lastEditedTime,
    contentPreview: createPreview(doc.text),
    sourceName: doc.sourceName,
    sourceType: doc.sourceType,
    matchReason: createMatchReason(doc, question, searchTerms),
  }));

  return {
    documents: finalDocuments,
    debug,
  };
}

function createEmptyDebug(question: string): SearchDebug {
  return {
    searchTerms: [],
    searchQueries: question ? [question] : [],
    databasePageCount: 0,
    seedPageCount: 0,
    discoveredPageCount: 0,
    selectedPageCount: 0,
    maxScore: 0,
    minimumScore: 0,
    selectedPages: [],
    sourceCounts: {},
    errors: [],
  };
}

async function queryDatabasePages(
  databaseId: string,
  question: string,
  searchTerms: string[]
): Promise<NotionPage[]> {
  const recentTask = queryDatabaseRecentPages(databaseId);
  const targetedTask = queryDatabaseTargetedPages(databaseId, question, searchTerms);

  const [recentPages, targetedPages] = await Promise.all([recentTask, targetedTask]);

  return dedupeNotionPages([...targetedPages, ...recentPages]).slice(0, MAX_DATABASE_PAGES_PER_DB);
}

async function queryDatabaseRecentPages(databaseId: string): Promise<NotionPage[]> {
  const response = await notionFetch<NotionListResponse>(
    `/databases/${cleanNotionId(databaseId)}/query`,
    "POST",
    {
      page_size: MAX_DATABASE_RECENT_PAGES_PER_DB,
      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending",
        },
      ],
    }
  );

  const results = Array.isArray(response.results) ? response.results : [];
  return results.filter(isNotionPage).slice(0, MAX_DATABASE_RECENT_PAGES_PER_DB);
}

async function queryDatabaseTargetedPages(
  databaseId: string,
  question: string,
  searchTerms: string[]
): Promise<NotionPage[]> {
  try {
    const database = await getDatabase(databaseId);
    const filter = buildDatabaseSearchFilter(database.properties || {}, question, searchTerms);

    if (!filter) {
      return [];
    }

    const response = await notionFetch<NotionListResponse>(
      `/databases/${cleanNotionId(databaseId)}/query`,
      "POST",
      {
        page_size: MAX_DATABASE_TARGETED_PAGES_PER_DB,
        filter,
        sorts: [
          {
            timestamp: "last_edited_time",
            direction: "descending",
          },
        ],
      }
    );

    const results = Array.isArray(response.results) ? response.results : [];
    return results.filter(isNotionPage).slice(0, MAX_DATABASE_TARGETED_PAGES_PER_DB);
  } catch {
    return [];
  }
}

async function getDatabase(databaseId: string): Promise<NotionDatabase> {
  return await notionFetch<NotionDatabase>(`/databases/${cleanNotionId(databaseId)}`, "GET");
}

function buildDatabaseSearchFilter(
  properties: Record<string, Record<string, any>>,
  question: string,
  searchTerms: string[]
): Record<string, any> | null {
  const searchableProperties = Object.entries(properties)
    .filter(([, schema]) => isSearchableDatabaseProperty(schema?.type))
    .sort(([aName, aSchema], [bName, bSchema]) => {
      const aScore = getPropertySearchPriority(aName, aSchema?.type);
      const bScore = getPropertySearchPriority(bName, bSchema?.type);
      return bScore - aScore;
    })
    .slice(0, 10);

  if (searchableProperties.length === 0) {
    return null;
  }

  const terms = createDatabaseFilterTerms(question, searchTerms);
  const filters: Record<string, any>[] = [];

  for (const [propertyName, schema] of searchableProperties) {
    for (const term of terms) {
      const filter = createNotionPropertyFilter(propertyName, schema?.type, term);
      if (filter) {
        filters.push(filter);
      }
    }
  }

  if (filters.length === 0) {
    return null;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return {
    or: filters.slice(0, 80),
  };
}

function isSearchableDatabaseProperty(type: string | undefined): boolean {
  return [
    "title",
    "rich_text",
    "url",
    "email",
    "phone_number",
    "select",
    "multi_select",
    "status",
  ].includes(type || "");
}

function getPropertySearchPriority(name: string, type: string | undefined): number {
  const normalizedName = normalizePropertyName(name);

  if (type === "title") {
    return 100;
  }

  if (QUESTION_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 95;
  }

  if (ANSWER_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 80;
  }

  if (KEYWORD_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 70;
  }

  if (CATEGORY_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 55;
  }

  if (PROGRAM_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 55;
  }

  return 20;
}

function createNotionPropertyFilter(
  propertyName: string,
  type: string | undefined,
  term: string
): Record<string, any> | null {
  if (!term) {
    return null;
  }

  if (type === "title") {
    return {
      property: propertyName,
      title: {
        contains: term,
      },
    };
  }

  if (type === "rich_text") {
    return {
      property: propertyName,
      rich_text: {
        contains: term,
      },
    };
  }

  if (type === "url") {
    return {
      property: propertyName,
      url: {
        contains: term,
      },
    };
  }

  if (type === "email") {
    return {
      property: propertyName,
      email: {
        contains: term,
      },
    };
  }

  if (type === "phone_number") {
    return {
      property: propertyName,
      phone_number: {
        contains: term,
      },
    };
  }

  if (type === "select") {
    return {
      property: propertyName,
      select: {
        equals: term,
      },
    };
  }

  if (type === "multi_select") {
    return {
      property: propertyName,
      multi_select: {
        contains: term,
      },
    };
  }

  if (type === "status") {
    return {
      property: propertyName,
      status: {
        equals: term,
      },
    };
  }

  return null;
}

function createDatabaseFilterTerms(question: string, searchTerms: string[]): string[] {
  const candidates = [
    question,
    stripQuestionSuffix(question),
    ...searchTerms,
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .filter((item) => !isWeakSearchTerm(item))
    )
  ).slice(0, 8);
}

async function searchNotionPages(question: string): Promise<NotionPage[]> {
  const response = await notionFetch<NotionListResponse>("/search", "POST", {
    query: question,
    page_size: MAX_SEARCH_PAGES,
    filter: {
      property: "object",
      value: "page",
    },
    sort: {
      direction: "descending",
      timestamp: "last_edited_time",
    },
  });

  const results = Array.isArray(response.results) ? response.results : [];
  return results.filter(isNotionPage).slice(0, MAX_SEARCH_PAGES);
}

async function getPage(pageId: string): Promise<NotionPage> {
  return await notionFetch<NotionPage>(`/pages/${cleanNotionId(pageId)}`, "GET");
}

async function readPageBlockText(pageId: string): Promise<string> {
  const response = await notionFetch<NotionListResponse>(
    `/blocks/${cleanNotionId(pageId)}/children?page_size=${MAX_BLOCKS_PER_PAGE}`,
    "GET"
  );

  const blocks = Array.isArray(response.results) ? response.results.filter(isNotionBlock) : [];
  const lines: string[] = [];

  for (const block of blocks) {
    const text = getBlockPlainText(block);

    if (text) {
      lines.push(text);
    }

    if (block.has_children && lines.join("\n").length < 2400) {
      try {
        const childResponse = await notionFetch<NotionListResponse>(
          `/blocks/${cleanNotionId(block.id)}/children?page_size=${MAX_CHILD_BLOCKS_PER_PARENT}`,
          "GET"
        );

        const childBlocks = Array.isArray(childResponse.results)
          ? childResponse.results.filter(isNotionBlock)
          : [];

        for (const childBlock of childBlocks) {
          const childText = getBlockPlainText(childBlock);
          if (childText) {
            lines.push(childText);
          }
        }
      } catch {
        // 子ブロックが読めない場合も回答全体は止めない
      }
    }
  }

  return lines.join("\n").trim();
}

function pageToDocument(
  page: NotionPage,
  source: SourceConfig,
  question: string,
  searchTerms: string[]
): SearchDocument {
  const properties = page.properties || {};
  const title = getPageTitle(page);
  const propertyText = getPropertyText(properties);

  const questionText = getPropertyTextByNames(properties, QUESTION_PROPERTY_NAMES) || title;
  const answerText = getPropertyTextByNames(properties, ANSWER_PROPERTY_NAMES);
  const keywordText = getPropertyTextByNames(properties, KEYWORD_PROPERTY_NAMES);
  const categoryText = getPropertyTextByNames(properties, CATEGORY_PROPERTY_NAMES);
  const programText = getPropertyTextByNames(properties, PROGRAM_PROPERTY_NAMES);
  const statusText = getPropertyTextByNames(properties, STATUS_PROPERTY_NAMES);

  const text = [
    title,
    questionText ? `Question: ${questionText}` : "",
    answerText ? `Answer: ${answerText}` : "",
    keywordText ? `Keyword: ${keywordText}` : "",
    categoryText ? `Category: ${categoryText}` : "",
    programText ? `Program: ${programText}` : "",
    statusText ? `Status: ${statusText}` : "",
    propertyText,
  ]
    .filter(Boolean)
    .join("\n");

  const doc: SearchDocument = {
    id: page.id,
    title,
    url: page.url || "",
    sourceName: source.name,
    sourceType: source.type,
    text,
    propertyText,
    blockText: "",
    questionText,
    answerText,
    keywordText,
    categoryText,
    programText,
    statusText,
    score: 0,
    lastEditedTime: page.last_edited_time || page.created_time || "",
  };

  doc.score = scoreDocument(doc, question, searchTerms);
  return doc;
}

function getPageTitle(page: NotionPage): string {
  const properties = page.properties || {};

  const titleByQuestion = getPropertyTextByNames(properties, QUESTION_PROPERTY_NAMES);
  if (titleByQuestion) {
    return titleByQuestion;
  }

  for (const property of Object.values(properties)) {
    if (property && property.type === "title") {
      const title = richTextToPlain(property.title);
      if (title) {
        return title;
      }
    }
  }

  return "Untitled";
}

function getPropertyText(properties: Record<string, NotionProperty>): string {
  const lines: string[] = [];

  for (const [key, property] of Object.entries(properties)) {
    const value = getPropertyValueText(property);

    if (value) {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

function getPropertyTextByNames(
  properties: Record<string, NotionProperty>,
  names: string[]
): string {
  const wanted = names.map(normalizePropertyName);

  for (const [key, property] of Object.entries(properties)) {
    if (wanted.includes(normalizePropertyName(key))) {
      const value = getPropertyValueText(property);
      if (value) {
        return value;
      }
    }
  }

  return "";
}

function getPropertyValueText(property: NotionProperty | undefined): string {
  if (!property || !property.type) {
    return "";
  }

  const type = property.type;

  if (type === "title") {
    return richTextToPlain(property.title);
  }

  if (type === "rich_text") {
    return richTextToPlain(property.rich_text);
  }

  if (type === "select") {
    return property.select?.name || "";
  }

  if (type === "status") {
    return property.status?.name || "";
  }

  if (type === "multi_select") {
    return Array.isArray(property.multi_select)
      ? property.multi_select.map((item: any) => item.name).filter(Boolean).join(", ")
      : "";
  }

  if (type === "date") {
    const start = property.date?.start || "";
    const end = property.date?.end || "";
    return [start, end].filter(Boolean).join(" - ");
  }

  if (type === "url") {
    return property.url || "";
  }

  if (type === "email") {
    return property.email || "";
  }

  if (type === "phone_number") {
    return property.phone_number || "";
  }

  if (type === "number") {
    return property.number === null || property.number === undefined ? "" : String(property.number);
  }

  if (type === "checkbox") {
    return property.checkbox ? "true" : "false";
  }

  if (type === "created_time") {
    return property.created_time || "";
  }

  if (type === "last_edited_time") {
    return property.last_edited_time || "";
  }

  if (type === "files") {
    return Array.isArray(property.files)
      ? property.files.map((file: any) => file.name || file.file?.url || file.external?.url).filter(Boolean).join(", ")
      : "";
  }

  if (type === "people") {
    return Array.isArray(property.people)
      ? property.people.map((person: any) => person.name || person.id).filter(Boolean).join(", ")
      : "";
  }

  if (type === "formula") {
    return getFormulaText(property.formula);
  }

  if (type === "rollup") {
    return getRollupText(property.rollup);
  }

  return "";
}

function getFormulaText(formula: Record<string, any> | undefined): string {
  if (!formula || !formula.type) {
    return "";
  }

  const value = formula[formula.type];

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getRollupText(rollup: Record<string, any> | undefined): string {
  if (!rollup || !rollup.type) {
    return "";
  }

  const value = rollup[rollup.type];

  if (Array.isArray(value)) {
    return value.map((item) => JSON.stringify(item)).join(", ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getBlockPlainText(block: NotionBlock): string {
  const type = block.type || "";
  const value = block[type];

  if (!value || typeof value !== "object") {
    return "";
  }

  if (type === "child_page" && typeof value.title === "string") {
    return `子ページ: ${value.title}`;
  }

  if (type === "child_database" && typeof value.title === "string") {
    return `子データベース: ${value.title}`;
  }

  if (type === "to_do") {
    const text = richTextToPlain(value.rich_text);
    return text ? `□ ${text}` : "";
  }

  if (type === "bulleted_list_item") {
    const text = richTextToPlain(value.rich_text);
    return text ? `・${text}` : "";
  }

  if (type === "numbered_list_item") {
    const text = richTextToPlain(value.rich_text);
    return text ? `1. ${text}` : "";
  }

  if (type === "table_row" && Array.isArray(value.cells)) {
    return value.cells
      .map((cell: unknown) => richTextToPlain(cell))
      .filter(Boolean)
      .join(" / ");
  }

  if (type === "code") {
    return richTextToPlain(value.rich_text);
  }

  return richTextToPlain(value.rich_text);
}

function richTextToPlain(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const record = item as Record<string, any>;
      return record.plain_text || record.text?.content || record.mention?.plain_text || "";
    })
    .filter(Boolean)
    .join("")
    .trim();
}

async function buildAnswer(
  question: string,
  documents: SearchDocument[],
  debug: SearchDebug
): Promise<AnswerPayload> {
  const openaiApiKey = getEnv("OPENAI_API_KEY");

  if (!openaiApiKey) {
    return createFallbackPayload({
      question,
      documents,
      debug,
      note: "OPENAI_API_KEY が設定されていないため、Notion検索結果をもとに暫定回答を表示しています。",
    });
  }

  if (documents.length === 0) {
    return createFallbackPayload({
      question,
      documents,
      debug,
      note: "Notionで関連候補を確認できませんでした。検索語を変えるか、Notion DBの共有設定を確認してください。",
    });
  }

  const topScore = documents[0]?.score || 0;

  if (topScore < MIN_CONFIDENT_SCORE) {
    return createFallbackPayload({
      question,
      documents,
      debug,
      note: `関連候補のスコアが低いため、断定回答を避けています。最高スコアは ${topScore} です。Notionの該当ページ名、Question欄、Keyword欄を確認してください。`,
    });
  }

  const context = buildContextForAi(documents);
  const schema = buildAnswerJsonSchema();

  const systemPrompt = [
    "あなたはRSJP業務マニュアルAIです。",
    "目的は、新人職員が迷わず進め、危ない判断では課長確認で止まれるようにすることです。",
    "Notionの参照情報に基づいて、日本語で実務的に回答してください。",
    "Reference 1 は最も重要な参照元です。まずReference 1を優先してください。",
    "Question欄とAnswer欄に明記されている内容を最優先してください。",
    "Notion Search APIの結果とManual Databaseの結果が矛盾する場合は、Manual Databaseを優先してください。",
    "Notionで確認できたことと、確認できなかったことを分けてください。",
    "費用、見積、請求、契約、支払、受入可否、例外対応、先方への確約、個人情報、アレルギー、医療情報は課長確認が必要です。",
    "根拠が弱い場合は、断定せず、課長確認またはNotion確認を促してください。",
    "回答は短く、実務でそのまま使える形にしてください。",
    "回答は必ずJSONだけで返してください。",
  ].join("\n");

  const userPrompt = [
    `質問: ${question}`,
    "",
    "Notionから取得した参照情報:",
    context,
    "",
    "出力条件:",
    "- answer は、初心者向けに読みやすい本文にする。",
    "- Notionに明記されているAnswer欄の内容は、勝手に省略・否定しない。",
    "- 参照元がQuestion/Answer形式の場合は、そのAnswerを中心に回答する。",
    "- steps は、新人が順番に進められる手順にする。",
    "- checklist は、作業前後の確認項目にする。",
    "- managerGate は、課長確認が必要な判断を明確にする。",
    "- imagePrompt は、日本語文字を画像生成AIに描かせない前提で、業務フロー図の背景用プロンプトにする。",
  ].join("\n");

  try {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: getOpenAiModel(),
          input: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          max_output_tokens: MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "rsjp_manual_answer",
              strict: true,
              schema,
            },
          },
        }),
      },
      OPENAI_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();

      return createFallbackPayload({
        question,
        documents,
        debug,
        note: `OpenAI APIの呼び出しに失敗しました: HTTP ${response.status} ${errorText.slice(0, 300)}`,
      });
    }

    const raw = await response.json();
    const outputText = extractOpenAiText(raw);
    const parsed = parseAiJson(outputText);

    return normalizeAnswerPayload(parsed, documents, debug);
  } catch (error) {
    return createFallbackPayload({
      question,
      documents,
      debug,
      note: `OpenAI回答生成中にエラーが発生しました: ${getErrorMessage(error)}`,
    });
  }
}

function getOpenAiModel(): string {
  const fastModel = getEnv("OPENAI_MODEL_FAST");

  if (fastModel) {
    return fastModel;
  }

  const configuredModel = getEnv("OPENAI_MODEL");

  if (configuredModel && !configuredModel.includes("5.5")) {
    return configuredModel;
  }

  return "gpt-4.1-mini";
}

function buildContextForAi(documents: SearchDocument[]): string {
  return documents
    .slice(0, MAX_SELECTED_DOCS)
    .map((document, index) => {
      const excerpt = document.text.slice(0, MAX_CONTEXT_CHARS_PER_DOC);

      return [
        `--- Reference ${index + 1} ---`,
        `Title: ${document.title}`,
        `Source: ${document.sourceName}`,
        `Type: ${document.sourceType}`,
        `URL: ${document.url || "N/A"}`,
        `Last edited: ${document.lastEditedTime || "N/A"}`,
        `Score: ${document.score}`,
        document.questionText ? `Question field: ${document.questionText}` : "",
        document.answerText ? `Answer field: ${document.answerText}` : "",
        document.keywordText ? `Keyword field: ${document.keywordText}` : "",
        document.categoryText ? `Category field: ${document.categoryText}` : "",
        document.programText ? `Program field: ${document.programText}` : "",
        "Content:",
        excerpt,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildAnswerJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["answer", "steps", "checklist", "managerGate", "imagePrompt", "oldPolicyNote"],
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
      managerGate: {
        type: "object",
        additionalProperties: false,
        required: ["canProceedAlone", "needManagerApproval", "approvalTiming", "managerQuestionTemplate"],
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
      imagePrompt: {
        type: "string",
      },
      oldPolicyNote: {
        type: "string",
      },
    },
  };
}

function extractOpenAiText(raw: any): string {
  if (typeof raw.output_text === "string") {
    return raw.output_text;
  }

  if (Array.isArray(raw.output)) {
    const parts: string[] = [];

    for (const outputItem of raw.output) {
      if (Array.isArray(outputItem.content)) {
        for (const contentItem of outputItem.content) {
          if (typeof contentItem.text === "string") {
            parts.push(contentItem.text);
          }

          if (typeof contentItem.value === "string") {
            parts.push(contentItem.value);
          }
        }
      }
    }

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  return JSON.stringify(raw);
}

function parseAiJson(text: string): Record<string, any> {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (parsed && typeof parsed === "object") {
    return parsed as Record<string, any>;
  }

  throw new Error("OpenAI response is not a JSON object.");
}

function normalizeAnswerPayload(
  raw: Record<string, any>,
  documents: SearchDocument[],
  debug: SearchDebug
): AnswerPayload {
  const managerGate = normalizeManagerGate(raw.managerGate);
  const steps = normalizeStringArray(raw.steps, [
    "Notionの参照元を確認する",
    "現在の案件に当てはまる部分を整理する",
    "判断が必要な箇所は課長に確認する",
  ]);
  const checklist = normalizeChecklist(raw.checklist);
  const references = buildReferences(documents);

  return {
    answer: normalizeString(raw.answer, "回答を生成できませんでした。参照元を確認してください。"),
    managerGate,
    steps,
    checklist,
    imagePrompt: normalizeString(raw.imagePrompt, buildImagePrompt("RSJP業務フロー")),
    imageUrl: "",
    references,
    updatedAt: new Date().toISOString(),
    oldPolicyNote: normalizeString(raw.oldPolicyNote, "Notionの参照情報をもとに回答しています。"),
    debug: {
      search: debug,
    },
  };
}

function createFallbackPayload(args: {
  question: string;
  documents: SearchDocument[];
  debug: SearchDebug;
  note: string;
}): AnswerPayload {
  const topTitles = args.documents.slice(0, 5).map((doc) => `・${doc.title}`).join("\n");

  const answer = [
    "Notion検索結果をもとにした暫定回答です。",
    "",
    args.note,
    "",
    "確認できた参照候補:",
    topTitles || "・関連するNotionページを確認できませんでした。",
    "",
    "次に確認すること:",
    "1. 参照元に該当しそうなページがある場合は、Notionで直接内容を確認してください。",
    "2. 費用・契約・支払・例外対応・個人情報に関わる場合は、先方へ回答する前に課長確認をしてください。",
    "3. 関連ページが出ない場合は、検索語、Notion DBの共有設定、Vercel環境変数を確認してください。",
  ].join("\n");

  return {
    answer,
    managerGate: DEFAULT_MANAGER_GATE,
    steps: [
      "検索デバッグで、どのナレッジベースが読まれているか確認する",
      "参照元に関連ページが出ているか確認する",
      "関連ページが出ない場合は、Notionの共有設定と環境変数を確認する",
      "先方へ確定回答を送る前に、課長確認を行う",
    ],
    checklist: [
      { text: "NOTION_API_KEY がVercelに設定されている" },
      { text: "NOTION_DATABASE_ID がVercelに設定されている" },
      { text: "NOTION_DATABASE_ID_2 / NOTION_DATABASE_ID_3 が必要に応じて設定されている" },
      { text: "Notion DBをIntegrationに共有している" },
      { text: "費用・契約・例外対応は課長確認に回す" },
    ],
    imagePrompt: buildImagePrompt("API接続確認"),
    imageUrl: "",
    references: buildReferences(args.documents),
    updatedAt: new Date().toISOString(),
    oldPolicyNote: args.note,
    debug: {
      search: args.debug,
    },
  };
}

function normalizeManagerGate(value: unknown): ManagerGate {
  if (!value || typeof value !== "object") {
    return DEFAULT_MANAGER_GATE;
  }

  const data = value as Record<string, unknown>;

  return {
    canProceedAlone: normalizeStringArray(data.canProceedAlone, DEFAULT_MANAGER_GATE.canProceedAlone),
    needManagerApproval: normalizeStringArray(
      data.needManagerApproval,
      DEFAULT_MANAGER_GATE.needManagerApproval
    ),
    approvalTiming: normalizeStringArray(data.approvalTiming, DEFAULT_MANAGER_GATE.approvalTiming),
    managerQuestionTemplate: normalizeString(
      data.managerQuestionTemplate,
      DEFAULT_MANAGER_GATE.managerQuestionTemplate
    ),
  };
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) {
    return [
      { text: "Notionの参照元を確認した" },
      { text: "判断が必要な点を課長確認に回した" },
    ];
  }

  const items = value
    .map((item) => {
      if (typeof item === "string" && item.trim()) {
        return { text: item.trim() };
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, any>;

        if (typeof record.text === "string" && record.text.trim()) {
          return { text: record.text.trim(), done: Boolean(record.done) };
        }
      }

      return null;
    })
    .filter((item): item is ChecklistItem => Boolean(item));

  return items.length > 0
    ? items
    : [
        { text: "Notionの参照元を確認した" },
        { text: "判断が必要な点を課長確認に回した" },
      ];
}

function buildReferences(documents: SearchDocument[]): string[] {
  const references = documents.map((doc) => {
    if (doc.url) {
      return `${doc.title} - ${doc.url}`;
    }

    return `${doc.title} (${doc.sourceName})`;
  });

  return references.length > 0 ? references : ["Notion参照元なし"];
}

function buildImagePrompt(topic: string): string {
  return [
    `Create a clean professional workflow background for ${topic}.`,
    "Decorative background only.",
    "No readable text, no Japanese characters, no English words, no numbers, no labels, no logo.",
    "Light office style, soft colours, simple flow shapes, suitable for an internal operations manual.",
  ].join(" ");
}

function createSearchTerms(question: string): string[] {
  const normalized = question
    .replace(/[！？。、，．・/\\|()[\]{}「」『』【】,:;'"`~!?@#$%^&*_+=<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const terms = new Set<string>();

  for (const term of normalized.split(" ")) {
    const trimmed = term.trim();

    if (trimmed.length >= 2 && !isWeakSearchTerm(trimmed)) {
      terms.add(trimmed);
    }
  }

  const stripped = stripQuestionSuffix(question);
  if (stripped && stripped.length >= 2) {
    terms.add(stripped);
  }

  const asciiMatches = question.match(/[A-Za-z0-9][A-Za-z0-9_-]*/g) || [];
  for (const match of asciiMatches) {
    if (match.length >= 2) {
      terms.add(match);
    }
  }

  const importantTerms = [
    "見積",
    "請求",
    "支払",
    "支払い",
    "契約",
    "合意書",
    "バス",
    "大型バス",
    "宿舎",
    "保険",
    "ビザ",
    "招へい",
    "学生",
    "参加者",
    "申込",
    "締切",
    "キャンセル",
    "課長",
    "確認",
    "国際課",
    "クレオテック",
    "Coupa",
    "RSJP",
    "RWJP",
    "RDSP",
    "OU",
    "JMU",
    "UCD",
    "FIU",
    "OIC",
    "BKC",
    "衣笠",
    "朱雀",
    "通学",
    "通学方法",
    "通勤",
    "シャトル",
    "キャンパス",
    "修了式",
    "帰国",
    "空港",
    "関空",
    "伊丹",
    "JR",
    "阪急",
    "バス",
    "電車",
    "タクシー",
    "チップ",
    "歯医者",
    "病院",
    "天気",
    "スマホ",
    "SIM",
    "WiFi",
  ];

  for (const term of importantTerms) {
    if (question.toLowerCase().includes(term.toLowerCase())) {
      terms.add(term);
    }
  }

  const japaneseUsefulTerms = extractUsefulJapaneseTerms(question);
  for (const term of japaneseUsefulTerms) {
    if (term.length >= 2 && !isWeakSearchTerm(term)) {
      terms.add(term);
    }
  }

  return Array.from(terms).slice(0, 30);
}

function extractUsefulJapaneseTerms(question: string): string[] {
  const terms: string[] = [];
  const compact = question.replace(/\s+/g, "");

  const candidates = [
    compact.replace(/について.*$/g, ""),
    compact.replace(/を教えてください.*$/g, ""),
    compact.replace(/を教えて.*$/g, ""),
    compact.replace(/してください.*$/g, ""),
    compact.replace(/ですか.*$/g, ""),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.length >= 2 && candidate !== compact) {
      terms.push(candidate);
    }
  }

  const commonWords = [
    "通学方法",
    "通学",
    "修了式",
    "帰国",
    "空港",
    "歯医者",
    "スマホ",
    "チップ",
    "天気",
    "持ち物",
    "キャンパス",
    "バス",
    "電車",
    "請求方法",
    "見積もり",
    "申込方法",
    "参加資格",
  ];

  for (const word of commonWords) {
    if (compact.includes(word)) {
      terms.push(word);
    }
  }

  return terms;
}

function stripQuestionSuffix(value: string): string {
  return value
    .trim()
    .replace(/[？?。.!！]+$/g, "")
    .replace(/について教えてください$/g, "")
    .replace(/について教えて$/g, "")
    .replace(/を教えてください$/g, "")
    .replace(/を教えて$/g, "")
    .replace(/教えてください$/g, "")
    .replace(/教えて$/g, "")
    .replace(/してください$/g, "")
    .trim();
}

function createSearchQueries(question: string, terms: string[]): string[] {
  const queries = [question];

  if (terms.length > 0) {
    queries.push(terms.slice(0, 8).join(" "));
  }

  return Array.from(new Set(queries.filter(Boolean)));
}

function scoreDocument(document: SearchDocument, question: string, searchTerms: string[]): number {
  const query = normalizeText(question);
  const queryCompact = normalizeCompactText(question);
  const title = normalizeText(document.title);
  const titleCompact = normalizeCompactText(document.title);
  const questionField = normalizeText(document.questionText);
  const questionFieldCompact = normalizeCompactText(document.questionText);
  const answerField = normalizeText(document.answerText);
  const keywordField = normalizeText(document.keywordText);
  const categoryField = normalizeText(document.categoryText);
  const programField = normalizeText(document.programText);
  const text = normalizeText(document.text);
  let score = 0;

  if (queryCompact && titleCompact === queryCompact) {
    score += 360;
  } else if (queryCompact && questionFieldCompact === queryCompact) {
    score += 360;
  } else if (queryCompact && titleCompact.includes(queryCompact)) {
    score += 260;
  } else if (queryCompact && questionFieldCompact.includes(queryCompact)) {
    score += 260;
  } else if (queryCompact && queryCompact.includes(titleCompact) && titleCompact.length >= 4) {
    score += 190;
  } else if (
    queryCompact &&
    queryCompact.includes(questionFieldCompact) &&
    questionFieldCompact.length >= 4
  ) {
    score += 190;
  }

  if (query && text.includes(query)) {
    score += 70;
  }

  if (query && answerField.includes(query)) {
    score += 80;
  }

  for (const term of searchTerms) {
    const normalizedTerm = normalizeText(term);
    const compactTerm = normalizeCompactText(term);

    if (!normalizedTerm || !compactTerm || isWeakSearchTerm(normalizedTerm)) {
      continue;
    }

    if (titleCompact.includes(compactTerm)) {
      score += 52;
    }

    if (questionFieldCompact.includes(compactTerm)) {
      score += 60;
    }

    if (keywordField.includes(normalizedTerm)) {
      score += 38;
    }

    if (categoryField.includes(normalizedTerm)) {
      score += 26;
    }

    if (programField.includes(normalizedTerm)) {
      score += 26;
    }

    const answerCount = countOccurrences(answerField, normalizedTerm);
    score += Math.min(answerCount * 12, 48);

    const textCount = countOccurrences(text, normalizedTerm);
    score += Math.min(textCount * 6, 30);
  }

  if (document.sourceType === "database") {
    score += 24;
  }

  if (document.sourceType === "rootPage") {
    score += 4;
  }

  if (document.sourceType === "search") {
    score -= 12;
  }

  if (document.sourceType === "search" && score < 0) {
    score = 0;
  }

  if (document.lastEditedTime) {
    score += 1;
  }

  return score;
}

function selectFinalDocuments(documents: SearchDocument[]): SearchDocument[] {
  if (documents.length === 0) {
    return [];
  }

  const topScore = documents[0].score;
  const hasConfidentDatabaseHit = documents.some(
    (doc) => doc.sourceType === "database" && doc.score >= MIN_CONFIDENT_SCORE
  );

  const selected = documents.filter((doc) => {
    if (doc.score < MIN_CONFIDENT_SCORE) {
      return false;
    }

    if (hasConfidentDatabaseHit && doc.sourceType === "search") {
      return doc.score >= MIN_SEARCH_API_SCORE_WHEN_DATABASE_HIT_EXISTS;
    }

    return doc.score >= Math.max(MIN_CONFIDENT_SCORE, Math.floor(topScore * 0.3));
  });

  if (selected.length > 0) {
    return selected.slice(0, MAX_SELECTED_DOCS);
  }

  return documents.slice(0, Math.min(3, MAX_SELECTED_DOCS));
}

function sortDocumentsByRelevance(a: SearchDocument, b: SearchDocument): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (a.sourceType !== b.sourceType) {
    if (a.sourceType === "database") {
      return -1;
    }

    if (b.sourceType === "database") {
      return 1;
    }

    if (a.sourceType === "search") {
      return 1;
    }

    if (b.sourceType === "search") {
      return -1;
    }
  }

  return b.text.length - a.text.length;
}

function createMatchReason(
  document: SearchDocument,
  question: string,
  searchTerms: string[]
): string {
  const reasons: string[] = [];
  const queryCompact = normalizeCompactText(question);
  const titleCompact = normalizeCompactText(document.title);
  const questionCompact = normalizeCompactText(document.questionText);

  if (queryCompact && titleCompact === queryCompact) {
    reasons.push("タイトル完全一致");
  } else if (queryCompact && questionCompact === queryCompact) {
    reasons.push("Question欄完全一致");
  } else if (queryCompact && titleCompact.includes(queryCompact)) {
    reasons.push("タイトルに質問文を含む");
  } else if (queryCompact && questionCompact.includes(queryCompact)) {
    reasons.push("Question欄に質問文を含む");
  }

  const matchedTerms = searchTerms
    .filter((term) => {
      const compactTerm = normalizeCompactText(term);
      if (!compactTerm || isWeakSearchTerm(term)) {
        return false;
      }

      return (
        normalizeCompactText(document.title).includes(compactTerm) ||
        normalizeCompactText(document.questionText).includes(compactTerm) ||
        normalizeCompactText(document.answerText).includes(compactTerm) ||
        normalizeCompactText(document.keywordText).includes(compactTerm)
      );
    })
    .slice(0, 5);

  if (matchedTerms.length > 0) {
    reasons.push(`一致語: ${matchedTerms.join(", ")}`);
  }

  reasons.push(`参照元: ${document.sourceName}`);

  return reasons.join(" / ");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCompactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizePropertyName(value: string): string {
  return value.toLowerCase().replace(/[\s_\-・/\\|()[\]{}「」『』【】,:;'"`~!?！？。、，．]+/g, "");
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.map((item) => String(item || "").trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function isWeakSearchTerm(value: string): boolean {
  const normalized = normalizeCompactText(value);

  if (!normalized) {
    return true;
  }

  const weakTerms = new Set([
    "教えて",
    "教えてください",
    "ください",
    "について",
    "方法",
    "手順",
    "確認",
    "対応",
    "する",
    "したい",
    "できますか",
    "ですか",
    "ますか",
    "場合",
    "必要",
    "もの",
    "こと",
    "どの",
    "どう",
    "なに",
    "何",
  ]);

  return weakTerms.has(normalized);
}

function countOccurrences(text: string, term: string): number {
  if (!term) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (true) {
    const found = text.indexOf(term, index);

    if (found === -1) {
      break;
    }

    count += 1;
    index = found + term.length;
  }

  return count;
}

function dedupeDocuments(documents: SearchDocument[]): SearchDocument[] {
  const map = new Map<string, SearchDocument>();

  for (const document of documents) {
    const key = document.id;

    if (!map.has(key)) {
      map.set(key, document);
      continue;
    }

    const existing = map.get(key);

    if (!existing || document.score > existing.score || document.text.length > existing.text.length) {
      map.set(key, document);
    }
  }

  return Array.from(map.values());
}

function dedupeNotionPages(pages: NotionPage[]): NotionPage[] {
  const map = new Map<string, NotionPage>();

  for (const page of pages) {
    if (!map.has(page.id)) {
      map.set(page.id, page);
    }
  }

  return Array.from(map.values());
}

function createPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

async function notionFetch<T>(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>
): Promise<T> {
  const notionApiKey = getEnv("NOTION_API_KEY");

  if (!notionApiKey) {
    throw new Error("NOTION_API_KEY is missing.");
  }

  const response = await fetchWithTimeout(
    `https://api.notion.com/v1${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    },
    NOTION_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API HTTP ${response.status}: ${errorText.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanNotionId(id: string): string {
  const trimmed = id.trim();

  if (!trimmed.includes("/")) {
    return trimmed;
  }

  const match = trimmed.match(/[a-f0-9]{32}/i) || trimmed.match(/[a-f0-9-]{36}/i);
  return match ? match[0] : trimmed;
}

function isNotionPage(value: unknown): value is NotionPage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, any>;
  return typeof record.id === "string" && (record.object === "page" || Boolean(record.properties));
}

function isNotionBlock(value: unknown): value is NotionBlock {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, any>;
  return typeof record.id === "string";
}

function getEnv(name: string): string {
  return process.env[name] || "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "外部APIの応答が遅いためタイムアウトしました。";
    }

    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}