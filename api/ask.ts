// FILE: api/ask.ts
// PATH: api/ask.ts
/// <reference types="node" />

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

type NotionQueryResponse = {
  results?: unknown[];
  next_cursor?: string | null;
  has_more?: boolean;
};

type SearchDocument = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceEnvName: string;
  text: string;
  score: number;
  lastEditedTime: string;
};

type KnowledgeBaseDebug = {
  name: string;
  envName: string;
  configured: boolean;
  fetched: number;
  selected: number;
};

type SearchDebug = {
  query: string;
  knowledgeBases: KnowledgeBaseDebug[];
  totalCandidates: number;
  selectedPages: number;
  topScore: number;
  threshold: number;
  searchTerms: string[];
  selectedTitles: string[];
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

const NOTION_VERSION = "2022-06-28";
const MAX_DATABASE_PAGES_PER_DB = 35;
const MAX_SEARCH_RESULTS = 25;
const MAX_BLOCK_DEPTH = 2;
const MAX_CONTEXT_DOCS = 12;
const MAX_CONTEXT_CHARS_PER_DOC = 1800;

const DEFAULT_MANAGER_GATE: ManagerGate = {
  canProceedAlone: [
    "Notionに明記されている手順や過去の記録を確認する",
    "必要情報を整理し、関係者へ確認するための下書きを作成する",
    "チェックリストに沿って、抜け漏れを確認する",
  ],
  needManagerApproval: [
    "費用、見積、請求、支払方法、支払期限に関する判断",
    "キャンセル料、契約、合意書、受入可否に関する判断",
    "先方への確約、例外対応、学内ルールにない判断",
    "トラブル、クレーム、個人情報、アレルギー、医療情報を含む対応",
  ],
  approvalTiming: [
    "相手機関や学内関係者へ確定情報として送信する前",
    "費用・日程・受入条件に影響する判断を行う前",
    "Notionの記録と現在の状況に差があると感じた時",
  ],
  managerQuestionTemplate:
    "以下の件について、Notion上では〇〇と確認しました。今回の状況では△△の判断が必要になる可能性があります。先方へ回答する前に、対応方針をご確認いただけますでしょうか。",
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
      message: "API Function is available. Please send a POST request with { question: string }.",
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

  try {
    const question = getQuestionFromRequest(req);

    if (!question) {
      sendJson(res, 400, {
        ok: false,
        error: "Bad Request",
        message: "question が空です。",
      });
      return;
    }

    const searchResult = await searchNotionKnowledge(question);
    const answerPayload = await buildAnswer(question, searchResult.documents, searchResult.debug);

    sendJson(res, 200, answerPayload);
  } catch (error) {
    const debug = createEmptyDebug("unknown");
    debug.errors.push(getErrorMessage(error));

    const fallback = createFallbackPayload({
      question: "unknown",
      documents: [],
      debug,
      note: "API処理中にエラーが発生したため、暫定回答を表示しています。",
    });

    sendJson(res, 200, fallback);
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
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, any>;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (typeof body === "object") {
    return body as Record<string, any>;
  }

  return null;
}

async function searchNotionKnowledge(question: string): Promise<{
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

  const databaseConfigs = [
    {
      name: "Main Manual Database",
      envName: "NOTION_DATABASE_ID",
      id: getEnv("NOTION_DATABASE_ID"),
    },
    {
      name: "Sub Manual Database 2",
      envName: "NOTION_DATABASE_ID_2",
      id: getEnv("NOTION_DATABASE_ID_2"),
    },
    {
      name: "Sub Manual Database 3",
      envName: "NOTION_DATABASE_ID_3",
      id: getEnv("NOTION_DATABASE_ID_3"),
    },
  ];

  const rootPageConfigs = [
    {
      name: "Root Page 1",
      envName: "NOTION_ROOT_PAGE_ID",
      id: getEnv("NOTION_ROOT_PAGE_ID"),
    },
    {
      name: "Root Page 2",
      envName: "NOTION_ROOT_PAGE_ID_2",
      id: getEnv("NOTION_ROOT_PAGE_ID_2"),
    },
  ];

  const allDocuments: SearchDocument[] = [];

  for (const configItem of databaseConfigs) {
    const kbDebug: KnowledgeBaseDebug = {
      name: configItem.name,
      envName: configItem.envName,
      configured: Boolean(configItem.id),
      fetched: 0,
      selected: 0,
    };

    if (!configItem.id) {
      debug.knowledgeBases.push(kbDebug);
      continue;
    }

    try {
      const pages = await queryDatabasePages(configItem.id);
      kbDebug.fetched = pages.length;

      const docs = await enrichPagesToDocuments({
        pages,
        sourceName: configItem.name,
        sourceEnvName: configItem.envName,
        searchTerms,
      });

      kbDebug.selected = docs.filter((doc) => doc.score > 0).length;
      allDocuments.push(...docs);
    } catch (error) {
      debug.errors.push(`${configItem.envName}: ${getErrorMessage(error)}`);
    }

    debug.knowledgeBases.push(kbDebug);
  }

  for (const configItem of rootPageConfigs) {
    const kbDebug: KnowledgeBaseDebug = {
      name: configItem.name,
      envName: configItem.envName,
      configured: Boolean(configItem.id),
      fetched: 0,
      selected: 0,
    };

    if (!configItem.id) {
      debug.knowledgeBases.push(kbDebug);
      continue;
    }

    try {
      const rootDoc = await readRootPageDocument({
        pageId: configItem.id,
        sourceName: configItem.name,
        sourceEnvName: configItem.envName,
        searchTerms,
      });

      if (rootDoc) {
        kbDebug.fetched = 1;
        kbDebug.selected = rootDoc.score > 0 ? 1 : 0;
        allDocuments.push(rootDoc);
      }
    } catch (error) {
      debug.errors.push(`${configItem.envName}: ${getErrorMessage(error)}`);
    }

    debug.knowledgeBases.push(kbDebug);
  }

  try {
    const notionSearchPages = await searchPagesByNotionSearch(question);
    const notionSearchDocs = await enrichPagesToDocuments({
      pages: notionSearchPages,
      sourceName: "Notion Search API",
      sourceEnvName: "NOTION_SEARCH",
      searchTerms,
    });
    allDocuments.push(...notionSearchDocs);
  } catch (error) {
    debug.errors.push(`Notion Search API: ${getErrorMessage(error)}`);
  }

  const deduped = dedupeDocuments(allDocuments);
  const rescored = deduped
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc, question, searchTerms),
    }))
    .sort((a, b) => b.score - a.score);

  const topScore = rescored.length > 0 ? rescored[0].score : 0;
  const threshold = Math.max(3, Math.floor(topScore * 0.18));
  const selected = rescored
    .filter((doc) => doc.score >= threshold || doc.score > 0)
    .slice(0, MAX_CONTEXT_DOCS);

  debug.totalCandidates = rescored.length;
  debug.selectedPages = selected.length;
  debug.topScore = topScore;
  debug.threshold = threshold;
  debug.selectedTitles = selected.map((doc) => `${doc.title} (${doc.sourceEnvName}: ${doc.score})`);

  return {
    documents: selected,
    debug,
  };
}

function createEmptyDebug(query: string): SearchDebug {
  return {
    query,
    knowledgeBases: [],
    totalCandidates: 0,
    selectedPages: 0,
    topScore: 0,
    threshold: 0,
    searchTerms: [],
    selectedTitles: [],
    errors: [],
  };
}

async function queryDatabasePages(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  while (pages.length < MAX_DATABASE_PAGES_PER_DB) {
    const body: Record<string, unknown> = {
      page_size: Math.min(25, MAX_DATABASE_PAGES_PER_DB - pages.length),
    };

    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = await notionFetch<NotionQueryResponse>(
      `/databases/${cleanNotionId(databaseId)}/query`,
      "POST",
      body
    );

    const results = Array.isArray(response.results) ? response.results : [];

    for (const item of results) {
      if (isNotionPage(item)) {
        pages.push(item);
      }
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return pages;
}

async function searchPagesByNotionSearch(question: string): Promise<NotionPage[]> {
  const response = await notionFetch<NotionQueryResponse>("/search", "POST", {
    query: question,
    page_size: MAX_SEARCH_RESULTS,
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
  return results.filter(isNotionPage);
}

async function enrichPagesToDocuments(args: {
  pages: NotionPage[];
  sourceName: string;
  sourceEnvName: string;
  searchTerms: string[];
}): Promise<SearchDocument[]> {
  const documents: SearchDocument[] = [];

  for (const page of args.pages) {
    try {
      const title = getPageTitle(page);
      const propertyText = getPropertyText(page.properties || {});
      const blockText = await readBlockText(page.id, 0);
      const text = [propertyText, blockText].filter(Boolean).join("\n\n").trim();

      const document: SearchDocument = {
        id: page.id,
        title,
        url: page.url || "",
        sourceName: args.sourceName,
        sourceEnvName: args.sourceEnvName,
        text,
        score: 0,
        lastEditedTime: page.last_edited_time || page.created_time || "",
      };

      document.score = scoreDocument(document, "", args.searchTerms);
      documents.push(document);
    } catch (error) {
      documents.push({
        id: page.id,
        title: getPageTitle(page),
        url: page.url || "",
        sourceName: args.sourceName,
        sourceEnvName: args.sourceEnvName,
        text: `ページ本文の取得中にエラーが発生しました: ${getErrorMessage(error)}`,
        score: 0,
        lastEditedTime: page.last_edited_time || page.created_time || "",
      });
    }
  }

  return documents;
}

async function readRootPageDocument(args: {
  pageId: string;
  sourceName: string;
  sourceEnvName: string;
  searchTerms: string[];
}): Promise<SearchDocument | null> {
  const page = await notionFetch<NotionPage>(`/pages/${cleanNotionId(args.pageId)}`, "GET");
  const title = getPageTitle(page);
  const propertyText = getPropertyText(page.properties || {});
  const blockText = await readBlockText(args.pageId, 0);
  const text = [propertyText, blockText].filter(Boolean).join("\n\n").trim();

  const document: SearchDocument = {
    id: args.pageId,
    title,
    url: page.url || "",
    sourceName: args.sourceName,
    sourceEnvName: args.sourceEnvName,
    text,
    score: 0,
    lastEditedTime: page.last_edited_time || page.created_time || "",
  };

  document.score = scoreDocument(document, "", args.searchTerms);
  return document;
}

async function readBlockText(blockId: string, depth: number): Promise<string> {
  if (depth > MAX_BLOCK_DEPTH) {
    return "";
  }

  const lines: string[] = [];
  let cursor: string | null = null;

  do {
    const path = cursor
      ? `/blocks/${cleanNotionId(blockId)}/children?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
      : `/blocks/${cleanNotionId(blockId)}/children?page_size=100`;

    const response = await notionFetch<NotionQueryResponse>(path, "GET");
    const blocks = Array.isArray(response.results) ? response.results.filter(isNotionBlock) : [];

    for (const block of blocks) {
      const line = getBlockPlainText(block);
      if (line) {
        lines.push(line);
      }

      if (block.has_children && depth < MAX_BLOCK_DEPTH) {
        const childText = await readBlockText(block.id, depth + 1);
        if (childText) {
          lines.push(childText);
        }
      }
    }

    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor);

  return lines.join("\n").trim();
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

  return richTextToPlain(value.rich_text);
}

function getPageTitle(page: NotionPage): string {
  const properties = page.properties || {};

  for (const property of Object.values(properties)) {
    if (property && property.type === "title") {
      const title = richTextToPlain(property.title);
      if (title) {
        return title;
      }
    }
  }

  const nameProperty = properties.Name || properties.name || properties.名前 || properties.Title || properties.title;

  if (nameProperty) {
    const title =
      richTextToPlain(nameProperty.title) ||
      richTextToPlain(nameProperty.rich_text) ||
      String(nameProperty.plain_text || "").trim();

    if (title) {
      return title;
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

function getPropertyValueText(property: NotionProperty): string {
  const type = property.type;

  if (!type) {
    return "";
  }

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

  if (type === "people") {
    return Array.isArray(property.people)
      ? property.people.map((person: any) => person.name || person.id).filter(Boolean).join(", ")
      : "";
  }

  if (type === "files") {
    return Array.isArray(property.files)
      ? property.files.map((file: any) => file.name || file.file?.url || file.external?.url).filter(Boolean).join(", ")
      : "";
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

function scoreDocument(document: SearchDocument, question: string, searchTerms: string[]): number {
  const title = normalizeText(document.title);
  const text = normalizeText(document.text);
  const query = normalizeText(question);
  let score = 0;

  if (query && title.includes(query)) {
    score += 80;
  }

  if (query && text.includes(query)) {
    score += 45;
  }

  for (const term of searchTerms) {
    const normalizedTerm = normalizeText(term);

    if (!normalizedTerm) {
      continue;
    }

    if (title.includes(normalizedTerm)) {
      score += 20;
    }

    const count = countOccurrences(text, normalizedTerm);
    score += Math.min(count * 4, 28);
  }

  if (document.lastEditedTime) {
    score += 1;
  }

  return score;
}

function createSearchTerms(question: string): string[] {
  const normalized = question
    .replace(/[！？。、，．・/\\|()[\]{}「」『』【】,:;'"`~!?@#$%^&*_+=<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTerms = normalized.split(" ").filter(Boolean);
  const terms = new Set<string>();

  for (const term of rawTerms) {
    const trimmed = term.trim();

    if (trimmed.length >= 2) {
      terms.add(trimmed);
    }
  }

  const importantJapaneseTerms = [
    "見積",
    "請求",
    "支払",
    "契約",
    "合意書",
    "バス",
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
    "RSJP",
    "RWJP",
    "RDSP",
    "OU",
    "JMU",
    "UCD",
    "FIU",
  ];

  for (const term of importantJapaneseTerms) {
    if (question.includes(term)) {
      terms.add(term);
    }
  }

  return Array.from(terms).slice(0, 30);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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
    const key = document.id || `${document.title}-${document.sourceEnvName}`;

    if (!map.has(key)) {
      map.set(key, document);
      continue;
    }

    const existing = map.get(key);

    if (existing && document.text.length > existing.text.length) {
      map.set(key, document);
    }
  }

  return Array.from(map.values());
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
      note: "Notion上で関連度の高いページを確認できませんでした。検索語を変えるか、Notion DBの共有設定を確認してください。",
    });
  }

  const context = buildContextForAi(documents);
  const schema = buildAnswerJsonSchema();

  const systemPrompt = [
    "あなたはRSJP業務マニュアルAIです。",
    "目的は、新人職員が迷わず進め、危ない判断では課長確認で止まれるようにすることです。",
    "Notionの参照情報に基づいて、日本語で実務的に回答してください。",
    "Notionで確認できたことと、確認できなかったことを分けてください。",
    "費用、見積、請求、契約、支払、受入可否、例外対応、先方への確約、個人情報、アレルギー、医療情報は課長確認が必要です。",
    "根拠が弱い場合は、断定せず、課長確認またはNotion確認を促してください。",
    "回答は必ずJSONだけで返してください。",
  ].join("\n");

  const userPrompt = [
    `質問: ${question}`,
    "",
    "Notionから取得した参照情報:",
    context,
    "",
    "出力条件:",
    "- answer は、読みやすい本文にする。",
    "- steps は、新人が順番に進められる手順にする。",
    "- checklist は、作業前後の確認項目にする。",
    "- managerGate は、課長確認が必要な判断を明確にする。",
    "- imagePrompt は、日本語文字を画像生成AIに描かせない前提で、業務フロー図の背景用プロンプトにする。",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getEnv("OPENAI_MODEL") || "gpt-4.1-mini",
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
        text: {
          format: {
            type: "json_schema",
            name: "rsjp_manual_answer",
            strict: true,
            schema,
          },
        },
      }),
    });

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

    return normalizeAnswerPayload({
      raw: parsed,
      documents,
      debug,
      note: "",
    });
  } catch (error) {
    return createFallbackPayload({
      question,
      documents,
      debug,
      note: `OpenAI回答生成中にエラーが発生しました: ${getErrorMessage(error)}`,
    });
  }
}

function buildContextForAi(documents: SearchDocument[]): string {
  return documents
    .slice(0, MAX_CONTEXT_DOCS)
    .map((document, index) => {
      const excerpt = document.text.slice(0, MAX_CONTEXT_CHARS_PER_DOC);
      return [
        `--- Reference ${index + 1} ---`,
        `Title: ${document.title}`,
        `Source: ${document.sourceName}`,
        `URL: ${document.url || "N/A"}`,
        `Score: ${document.score}`,
        "Content:",
        excerpt,
      ].join("\n");
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

function normalizeAnswerPayload(args: {
  raw: Record<string, any>;
  documents: SearchDocument[];
  debug: SearchDebug;
  note: string;
}): AnswerPayload {
  const rawManagerGate = args.raw.managerGate || {};
  const managerGate: ManagerGate = {
    canProceedAlone: toStringArray(rawManagerGate.canProceedAlone, DEFAULT_MANAGER_GATE.canProceedAlone),
    needManagerApproval: toStringArray(rawManagerGate.needManagerApproval, DEFAULT_MANAGER_GATE.needManagerApproval),
    approvalTiming: toStringArray(rawManagerGate.approvalTiming, DEFAULT_MANAGER_GATE.approvalTiming),
    managerQuestionTemplate:
      typeof rawManagerGate.managerQuestionTemplate === "string" && rawManagerGate.managerQuestionTemplate.trim()
        ? rawManagerGate.managerQuestionTemplate.trim()
        : DEFAULT_MANAGER_GATE.managerQuestionTemplate,
  };

  const checklist = normalizeChecklist(args.raw.checklist);

  return {
    answer: typeof args.raw.answer === "string" ? args.raw.answer : "回答を生成できませんでした。",
    managerGate,
    steps: toStringArray(args.raw.steps, [
      "Notionの参照元を確認する",
      "現在の案件に当てはまる部分を整理する",
      "判断が必要な箇所は課長に確認する",
    ]),
    checklist,
    imagePrompt:
      typeof args.raw.imagePrompt === "string" && args.raw.imagePrompt.trim()
        ? args.raw.imagePrompt.trim()
        : buildImagePrompt("RSJP業務フロー"),
    imageUrl: "",
    references: buildReferences(args.documents),
    updatedAt: new Date().toISOString(),
    oldPolicyNote: args.note || (typeof args.raw.oldPolicyNote === "string" ? args.raw.oldPolicyNote : ""),
    debug: {
      search: args.debug,
    },
  };
}

function createFallbackPayload(args: {
  question: string;
  documents: SearchDocument[];
  debug: SearchDebug;
  note: string;
}): AnswerPayload {
  const references = buildReferences(args.documents);
  const topTitles = args.documents.slice(0, 5).map((doc) => `・${doc.title}`).join("\n");

  const answer = [
    "Notion検索は実行しましたが、AI回答生成または参照確認に一部問題があるため、暫定回答を表示します。",
    "",
    "確認できた参照候補:",
    topTitles || "・関連するNotionページを確認できませんでした。",
    "",
    "次に確認すること:",
    "1. Notion DBがIntegrationに共有されているか確認してください。",
    "2. NOTION_DATABASE_ID、NOTION_DATABASE_ID_2、NOTION_DATABASE_ID_3 がVercelに設定されているか確認してください。",
    "3. 先方へ確定回答を送る前に、課長確認を入れてください。",
  ].join("\n");

  return {
    answer,
    managerGate: DEFAULT_MANAGER_GATE,
    steps: [
      "検索デバッグで、どのナレッジベースが読まれているか確認する",
      "参照元に関連ページが出ているか確認する",
      "関連ページが出ない場合は、Notionの共有設定と環境変数を確認する",
      "費用・契約・例外対応に関わる場合は、先方送信前に課長確認を行う",
    ],
    checklist: [
      { text: "NOTION_API_KEY がVercelに設定されている" },
      { text: "NOTION_DATABASE_ID がVercelに設定されている" },
      { text: "NOTION_DATABASE_ID_2 / NOTION_DATABASE_ID_3 が必要に応じて設定されている" },
      { text: "Notion DBをIntegrationに共有している" },
      { text: "OPENAI_API_KEY がVercelに設定されている" },
      { text: "Vercelの最新デプロイが成功している" },
    ],
    imagePrompt: buildImagePrompt("API接続確認"),
    imageUrl: "",
    references,
    updatedAt: new Date().toISOString(),
    oldPolicyNote: args.note,
    debug: {
      search: args.debug,
    },
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
      if (typeof item === "string") {
        return { text: item };
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, any>;
        if (typeof record.text === "string") {
          return { text: record.text };
        }
      }

      return null;
    })
    .filter((item): item is ChecklistItem => Boolean(item && item.text));

  return items.length > 0
    ? items
    : [
        { text: "Notionの参照元を確認した" },
        { text: "判断が必要な点を課長確認に回した" },
      ];
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.map((item) => String(item || "").trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function buildReferences(documents: SearchDocument[]): string[] {
  const references = documents
    .slice(0, MAX_CONTEXT_DOCS)
    .map((doc) => {
      if (doc.url) {
        return `${doc.title} - ${doc.url}`;
      }
      return doc.title;
    })
    .filter(Boolean);

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

async function notionFetch<T>(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>
): Promise<T> {
  const notionApiKey = getEnv("NOTION_API_KEY");

  if (!notionApiKey) {
    throw new Error("NOTION_API_KEY is missing.");
  }

  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API HTTP ${response.status}: ${errorText.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

function cleanNotionId(id: string): string {
  return id.trim();
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