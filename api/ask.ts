// FILE: api/ask.ts
// PATH: api/ask.ts

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  maxDuration: 10,
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

type ManagerGate = {
  canProceedAlone: string[];
  needManagerApproval: string[];
  approvalTiming: string[];
  managerQuestionTemplate: string;
};

type ChecklistItem = {
  text: string;
};

type SearchDebug = {
  query: string;
  knowledgeBases: Array<{
    name: string;
    envName: string;
    configured: boolean;
    fetched: number;
    selected: number;
  }>;
  totalCandidates: number;
  selectedPages: number;
  topScore: number;
  threshold: number;
  searchTerms: string[];
  selectedTitles: string[];
  errors: string[];
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

type NotionPage = {
  id: string;
  object?: string;
  url?: string;
  properties?: Record<string, any>;
  created_time?: string;
  last_edited_time?: string;
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

const NOTION_VERSION = "2022-06-28";
const NOTION_TIMEOUT_MS = 2500;
const MAX_PAGES_PER_DB = 5;
const MAX_SELECTED_DOCS = 5;

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
      message: "API Function is available. POST { question: string } to use it.",
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
    sendJson(res, 200, createSafePayload({
      question: "",
      documents: [],
      debug: createEmptyDebug(""),
      note: "質問が空です。質問を入力してください。",
    }));
    return;
  }

  try {
    const result = await searchNotionLight(question);

    sendJson(res, 200, createSafePayload({
      question,
      documents: result.documents,
      debug: result.debug,
      note: result.documents.length > 0
        ? "復旧優先モードで回答しています。Notionの関連候補を軽量検索し、画面が落ちない安全形式で表示しています。"
        : "復旧優先モードで回答しています。Notionの関連候補は確認できませんでした。",
    }));
  } catch (error) {
    const debug = createEmptyDebug(question);
    debug.errors.push(getErrorMessage(error));

    sendJson(res, 200, createSafePayload({
      question,
      documents: [],
      debug,
      note: "API処理中にエラーが発生しましたが、画面が落ちないよう安全な暫定回答を返しています。",
    }));
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
      return parsed && typeof parsed === "object" ? parsed as Record<string, any> : null;
    } catch {
      return null;
    }
  }

  if (typeof body === "object") {
    return body as Record<string, any>;
  }

  return null;
}

async function searchNotionLight(question: string): Promise<{
  documents: SearchDocument[];
  debug: SearchDebug;
}> {
  const debug = createEmptyDebug(question);
  const searchTerms = createSearchTerms(question);
  debug.searchTerms = searchTerms;

  const notionApiKey = getEnv("NOTION_API_KEY");

  if (!notionApiKey) {
    debug.errors.push("NOTION_API_KEY が設定されていません。");
    return { documents: [], debug };
  }

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

  const tasks = databaseConfigs.map(async (configItem) => {
    const kbDebug = {
      name: configItem.name,
      envName: configItem.envName,
      configured: Boolean(configItem.id),
      fetched: 0,
      selected: 0,
    };

    if (!configItem.id) {
      return {
        documents: [] as SearchDocument[],
        kbDebug,
        error: "",
      };
    }

    try {
      const pages = await queryDatabaseLight(configItem.id);
      kbDebug.fetched = pages.length;

      const documents = pages.map((page) => pageToDocument({
        page,
        sourceName: configItem.name,
        sourceEnvName: configItem.envName,
        question,
        searchTerms,
      }));

      const selected = documents
        .filter((doc) => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      kbDebug.selected = selected.length;

      return {
        documents: selected,
        kbDebug,
        error: "",
      };
    } catch (error) {
      return {
        documents: [] as SearchDocument[],
        kbDebug,
        error: `${configItem.envName}: ${getErrorMessage(error)}`,
      };
    }
  });

  const results = await Promise.all(tasks);
  const allDocuments: SearchDocument[] = [];

  for (const result of results) {
    debug.knowledgeBases.push(result.kbDebug);

    if (result.error) {
      debug.errors.push(result.error);
    }

    allDocuments.push(...result.documents);
  }

  const deduped = dedupeDocuments(allDocuments)
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc, question, searchTerms),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = deduped.slice(0, MAX_SELECTED_DOCS);
  const topScore = selected.length > 0 ? selected[0].score : 0;

  debug.totalCandidates = deduped.length;
  debug.selectedPages = selected.length;
  debug.topScore = topScore;
  debug.threshold = 1;
  debug.selectedTitles = selected.map((doc) => `${doc.title} (${doc.sourceEnvName}: ${doc.score})`);

  return {
    documents: selected,
    debug,
  };
}

async function queryDatabaseLight(databaseId: string): Promise<NotionPage[]> {
  const response = await notionFetch<{
    results?: unknown[];
  }>(`/databases/${cleanNotionId(databaseId)}/query`, {
    page_size: MAX_PAGES_PER_DB,
    sorts: [
      {
        timestamp: "last_edited_time",
        direction: "descending",
      },
    ],
  });

  const results = Array.isArray(response.results) ? response.results : [];
  return results.filter(isNotionPage).slice(0, MAX_PAGES_PER_DB);
}

async function notionFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const notionApiKey = getEnv("NOTION_API_KEY");

  if (!notionApiKey) {
    throw new Error("NOTION_API_KEY is missing.");
  }

  const response = await fetchWithTimeout(
    `https://api.notion.com/v1${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    NOTION_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion API HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  return await response.json() as T;
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

function pageToDocument(args: {
  page: NotionPage;
  sourceName: string;
  sourceEnvName: string;
  question: string;
  searchTerms: string[];
}): SearchDocument {
  const title = getPageTitle(args.page);
  const propertyText = getPropertyText(args.page.properties || {});
  const text = [title, propertyText].filter(Boolean).join("\n");

  const document: SearchDocument = {
    id: args.page.id,
    title,
    url: args.page.url || "",
    sourceName: args.sourceName,
    sourceEnvName: args.sourceEnvName,
    text,
    score: 0,
    lastEditedTime: args.page.last_edited_time || args.page.created_time || "",
  };

  document.score = scoreDocument(document, args.question, args.searchTerms);
  return document;
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

  const possibleNames = [
    properties.Name,
    properties.name,
    properties.名前,
    properties.Title,
    properties.title,
  ];

  for (const property of possibleNames) {
    if (!property) {
      continue;
    }

    const title =
      richTextToPlain(property.title) ||
      richTextToPlain(property.rich_text) ||
      String(property.plain_text || "").trim();

    if (title) {
      return title;
    }
  }

  return "Untitled";
}

function getPropertyText(properties: Record<string, any>): string {
  const lines: string[] = [];

  for (const [key, property] of Object.entries(properties)) {
    const value = getPropertyValueText(property);

    if (value) {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

function getPropertyValueText(property: any): string {
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

  return "";
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

function createSafePayload(args: {
  question: string;
  documents: SearchDocument[];
  debug: SearchDebug;
  note: string;
}): AnswerPayload {
  const references = buildReferences(args.documents);
  const topTitles = args.documents.map((doc) => `・${doc.title}`).join("\n");

  const answer = [
    "復旧優先モードで回答しています。",
    "",
    args.note,
    "",
    "Notionで確認できた関連候補:",
    topTitles || "・関連候補はまだ確認できていません。",
    "",
    "現時点では、Notionの本文深掘りやOpenAIによる長文生成は一時的に抑えています。",
    "まずは画面が落ちずに、質問・回答・参照元・課長確認ゲートが表示される状態を優先しています。",
    "",
    "実務上の判断が必要な場合は、先方へ確定回答を送る前に課長確認を行ってください。",
  ].join("\n");

  return {
    answer,
    managerGate: DEFAULT_MANAGER_GATE,
    steps: [
      "質問内容に近いNotion候補が表示されているか確認する",
      "参照候補のタイトルを見て、該当しそうなページをNotionで直接確認する",
      "費用・契約・支払・例外対応に関わる場合は、課長確認用メモを作成する",
      "先方へ送信する前に、回答内容と判断部分を課長に確認する",
    ],
    checklist: [
      { text: "画面が白くならず、回答カードが表示されている" },
      { text: "参照元または検索デバッグが表示されている" },
      { text: "Notion DBの環境変数がVercelに設定されている" },
      { text: "費用・契約・例外対応は課長確認に回す" },
    ],
    imagePrompt: buildImagePrompt("RSJP Manual AI recovery mode"),
    imageUrl: "",
    references,
    updatedAt: new Date().toISOString(),
    oldPolicyNote: args.note,
    debug: {
      search: args.debug,
    },
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

    if (trimmed.length >= 2) {
      terms.add(trimmed);
    }
  }

  const importantTerms = [
    "見積",
    "請求",
    "支払",
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
  ];

  for (const term of importantTerms) {
    if (question.includes(term)) {
      terms.add(term);
    }
  }

  return Array.from(terms).slice(0, 20);
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
    score += 40;
  }

  for (const term of searchTerms) {
    const normalizedTerm = normalizeText(term);

    if (!normalizedTerm) {
      continue;
    }

    if (title.includes(normalizedTerm)) {
      score += 20;
    }

    if (text.includes(normalizedTerm)) {
      score += 8;
    }
  }

  if (document.lastEditedTime) {
    score += 1;
  }

  return score;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeDocuments(documents: SearchDocument[]): SearchDocument[] {
  const map = new Map<string, SearchDocument>();

  for (const document of documents) {
    if (!map.has(document.id)) {
      map.set(document.id, document);
    }
  }

  return Array.from(map.values());
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

function getEnv(name: string): string {
  return process.env[name] || "";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "Notion APIの応答が遅いため、軽量検索を中断しました。";
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