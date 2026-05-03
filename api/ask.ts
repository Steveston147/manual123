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
  type: "database";
};

type SearchDocument = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: "database";
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

const MAX_DATABASE_SCAN_PAGES = 180;
const MAX_DATABASE_TARGETED_PAGES = 120;
const MAX_DATABASE_TOTAL_PAGES = 220;
const MAX_SELECTED_DOCS = 7;
const MAX_SEEDS_TO_ENRICH = 18;
const MAX_BLOCKS_PER_PAGE = 70;
const MAX_CHILD_BLOCKS_PER_PARENT = 18;
const MAX_CONTEXT_CHARS_PER_DOC = 2000;
const MAX_OUTPUT_TOKENS = 1800;

const MIN_CONFIDENT_SCORE = 70;
const MIN_DIRECT_ANSWER_SCORE = 180;
const MIN_APPROVED_ANSWER_SCORE = 180;

const APPROVED_ANSWER_SOURCE_NAME = "RSJP Approved Answer Database";

const NOTION_TIMEOUT_MS = 12000;
const OPENAI_TIMEOUT_MS = 20000;

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

const APPROVED_REVISED_ANSWER_PROPERTY_NAMES = [
  "Revised Answer",
  "RevisedAnswer",
  "承認済み回答",
  "修正済み回答",
  "修正回答",
  "回答",
  "Answer",
];

const APPROVED_ORIGINAL_ANSWER_PROPERTY_NAMES = [
  "Original Answer",
  "OriginalAnswer",
  "元の回答",
  "Original",
];

const APPROVED_CHECKBOX_PROPERTY_NAMES = [
  "Approved",
  "承認済み",
  "承認",
  "確認済み",
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
    "Main Manual Databaseに明記された手順を確認する",
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
    "Main Manual Database上の記載だけでは判断できないとき",
    "自分で判断してよいか少しでも迷ったとき",
  ],
  managerQuestionTemplate:
    "以下の件について、Main Manual Database上では〇〇と理解しました。\n先方へ回答する前に確認させてください。\nこの理解で進めてよろしいでしょうか。",
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
      mode: "Approved Answer Database first, then Main Manual Database",
      message:
        "API Function is available. Please send POST { question: string }. Approved Answer Database is checked first when configured.",
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
      createManualUnknownPayload({
        question: "",
        documents: [],
        debug: createEmptyDebug(""),
        note: "質問が空です。質問を入力してください。",
      })
    );
    return;
  }

  try {
    const approvedResult = await searchApprovedAnswerKnowledge(question);

    if (approvedResult.payload) {
      sendJson(res, 200, approvedResult.payload);
      return;
    }

    const searchResult = await searchKnowledge(question);
    mergeApprovedDebug(searchResult.debug, approvedResult.debug);

    const answerPayload = await buildAnswer(question, searchResult.documents, searchResult.debug);

    sendJson(res, 200, answerPayload);
  } catch (error) {
    const debug = createEmptyDebug(question);
    debug.errors.push(getErrorMessage(error));

    sendJson(
      res,
      200,
      createManualUnknownPayload({
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
  const mainDatabaseId = getEnv("NOTION_DATABASE_ID");

  if (!notionApiKey) {
    debug.errors.push("NOTION_API_KEY が設定されていません。");
    return { documents: [], debug };
  }

  if (!mainDatabaseId) {
    debug.errors.push("NOTION_DATABASE_ID が設定されていません。Main Manual Databaseを参照できません。");
    return { documents: [], debug };
  }

  const searchTerms = createSearchTerms(question);
  const anchorTerms = extractAnchorTerms(question);
  const topicTerms = extractPrimaryTopicTerms(question);

  debug.searchTerms = Array.from(new Set([...searchTerms, ...anchorTerms, ...topicTerms]));
  debug.searchQueries = createSearchQueries(question, debug.searchTerms);

  const source: SourceConfig = {
    name: "Main Manual Database",
    envName: "NOTION_DATABASE_ID",
    id: mainDatabaseId,
    type: "database",
  };

  const seedDocuments: SearchDocument[] = [];

  try {
    const pages = await queryDatabasePages(source.id, question, debug.searchTerms);
    debug.databasePageCount = pages.length;
    debug.seedPageCount = pages.length;
    debug.sourceCounts[source.name] = pages.length;
    debug.sourceCounts["Manual Database 2"] = 0;
    debug.sourceCounts["Manual Database 3"] = 0;
    debug.sourceCounts["Root Page 1"] = 0;
    debug.sourceCounts["Root Page 2"] = 0;
    debug.sourceCounts["Notion Search API"] = 0;

    for (const page of pages) {
      seedDocuments.push(pageToDocument(page, source, question, debug.searchTerms));
    }
  } catch (error) {
    debug.errors.push(`${source.envName}: ${getErrorMessage(error)}`);
    debug.sourceCounts[source.name] = 0;
  }

  const dedupedSeeds = dedupeDocuments(seedDocuments)
    .map((doc) => ({
      ...doc,
      score: scoreDocument(doc, question, debug.searchTerms),
    }))
    .sort(sortDocumentsByRelevance);

  const topSeeds = dedupedSeeds.slice(0, MAX_SEEDS_TO_ENRICH);

  const enrichedDocuments = await Promise.all(
    topSeeds.map(async (doc) => {
      try {
        const blockText = await readPageBlockText(doc.id);
        const text = [doc.text, blockText ? `BlockContent: ${blockText}` : ""]
          .filter(Boolean)
          .join("\n\n")
          .trim();

        const enriched: SearchDocument = {
          ...doc,
          blockText,
          text: text || doc.text,
        };

        enriched.score = scoreDocument(enriched, question, debug.searchTerms);
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
      score: scoreDocument(doc, question, debug.searchTerms),
    }))
    .sort(sortDocumentsByRelevance);

  const finalDocuments = selectFinalDocuments(rankedDocuments, question);

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
    matchReason: createMatchReason(doc, question, debug.searchTerms),
  }));

  return {
    documents: finalDocuments,
    debug,
  };
}


async function searchApprovedAnswerKnowledge(question: string): Promise<{
  payload: AnswerPayload | null;
  documents: SearchDocument[];
  debug: SearchDebug;
}> {
  const debug = createEmptyDebug(question);
  const notionApiKey = getEnv("NOTION_API_KEY");
  const approvedDatabaseId = getEnv("NOTION_APPROVED_ANSWER_DATABASE_ID");

  debug.searchTerms = createSearchTerms(question);
  debug.searchQueries = createSearchQueries(question, debug.searchTerms);
  debug.sourceCounts[APPROVED_ANSWER_SOURCE_NAME] = 0;

  if (!notionApiKey) {
    debug.errors.push("NOTION_API_KEY が設定されていないため、承認済み回答DBを確認できません。");
    return { payload: null, documents: [], debug };
  }

  if (!approvedDatabaseId) {
    debug.errors.push(
      "NOTION_APPROVED_ANSWER_DATABASE_ID が設定されていないため、承認済み回答DBを確認できません。"
    );
    return { payload: null, documents: [], debug };
  }

  const source: SourceConfig = {
    name: APPROVED_ANSWER_SOURCE_NAME,
    envName: "NOTION_APPROVED_ANSWER_DATABASE_ID",
    id: approvedDatabaseId,
    type: "database",
  };

  try {
    const pages = await queryDatabasePages(source.id, question, debug.searchTerms);
    const approvedPages = pages.filter((page) => isApprovedAnswerPage(page.properties || {}));

    debug.databasePageCount = approvedPages.length;
    debug.seedPageCount = approvedPages.length;
    debug.sourceCounts[APPROVED_ANSWER_SOURCE_NAME] = approvedPages.length;

    const documents = approvedPages
      .map((page) => approvedPageToDocument(page, source, question, debug.searchTerms))
      .filter((doc) => doc.answerText.trim().length > 0)
      .map((doc) => ({
        ...doc,
        score: scoreApprovedAnswerDocument(doc, question, debug.searchTerms),
      }))
      .sort(sortDocumentsByRelevance);

    const selectedDocuments = selectApprovedAnswerDocuments(documents, question);

    debug.discoveredPageCount = documents.length;
    debug.selectedPageCount = selectedDocuments.length;
    debug.maxScore = selectedDocuments.length > 0 ? selectedDocuments[0].score : 0;
    debug.minimumScore =
      selectedDocuments.length > 0 ? selectedDocuments[selectedDocuments.length - 1].score : 0;
    debug.selectedPages = selectedDocuments.map((doc) => ({
      title: doc.title,
      score: doc.score,
      url: doc.url,
      lastEditedTime: doc.lastEditedTime,
      contentPreview: createPreview(doc.text),
      sourceName: doc.sourceName,
      sourceType: doc.sourceType,
      matchReason: createApprovedMatchReason(doc, question, debug.searchTerms),
    }));

    const bestDocument = selectedDocuments[0];

    if (!bestDocument || !isConfidentApprovedAnswerMatch(bestDocument, question)) {
      return { payload: null, documents: selectedDocuments, debug };
    }

    return {
      payload: createApprovedAnswerPayload(question, bestDocument, selectedDocuments, debug),
      documents: selectedDocuments,
      debug,
    };
  } catch (error) {
    debug.errors.push(`${source.envName}: ${getErrorMessage(error)}`);
    debug.sourceCounts[APPROVED_ANSWER_SOURCE_NAME] = 0;
    return { payload: null, documents: [], debug };
  }
}

function mergeApprovedDebug(mainDebug: SearchDebug, approvedDebug: SearchDebug): void {
  mainDebug.sourceCounts[APPROVED_ANSWER_SOURCE_NAME] =
    approvedDebug.sourceCounts[APPROVED_ANSWER_SOURCE_NAME] || 0;

  for (const error of approvedDebug.errors) {
    if (!mainDebug.errors.includes(error)) {
      mainDebug.errors.push(error);
    }
  }

  const mergedTerms = new Set([...approvedDebug.searchTerms, ...mainDebug.searchTerms]);
  mainDebug.searchTerms = Array.from(mergedTerms).slice(0, 50);

  const mergedQueries = new Set([...approvedDebug.searchQueries, ...mainDebug.searchQueries]);
  mainDebug.searchQueries = Array.from(mergedQueries).filter(Boolean).slice(0, 20);
}

function isApprovedAnswerPage(properties: Record<string, NotionProperty>): boolean {
  const approved = getCheckboxPropertyByNames(properties, APPROVED_CHECKBOX_PROPERTY_NAMES);
  if (approved) {
    return true;
  }

  const statusText = getPropertyTextByNames(properties, STATUS_PROPERTY_NAMES);
  return isApprovedStatusText(statusText);
}

function getCheckboxPropertyByNames(
  properties: Record<string, NotionProperty>,
  names: string[]
): boolean {
  const wanted = names.map(normalizePropertyName);

  for (const [key, property] of Object.entries(properties)) {
    if (!wanted.includes(normalizePropertyName(key))) {
      continue;
    }

    if (property && property.type === "checkbox") {
      return Boolean(property.checkbox);
    }

    const value = getPropertyValueText(property).toLowerCase();
    if (["true", "yes", "approved", "承認済み", "承認"].includes(value)) {
      return true;
    }
  }

  return false;
}

function isApprovedStatusText(value: string): boolean {
  const normalized = normalizeCompactText(value);
  return (
    normalized.includes("approved") ||
    normalized.includes("承認済み") ||
    normalized.includes("承認")
  );
}

function approvedPageToDocument(
  page: NotionPage,
  source: SourceConfig,
  question: string,
  searchTerms: string[]
): SearchDocument {
  const properties = page.properties || {};
  const title = getPageTitle(page);
  const propertyText = getPropertyText(properties);

  const questionText = getPropertyTextByNames(properties, QUESTION_PROPERTY_NAMES) || title;
  const revisedAnswerText = getPropertyTextByNames(properties, APPROVED_REVISED_ANSWER_PROPERTY_NAMES);
  const originalAnswerText = getPropertyTextByNames(properties, APPROVED_ORIGINAL_ANSWER_PROPERTY_NAMES);
  const keywordText = getPropertyTextByNames(properties, KEYWORD_PROPERTY_NAMES);
  const categoryText = getPropertyTextByNames(properties, CATEGORY_PROPERTY_NAMES);
  const programText = getPropertyTextByNames(properties, PROGRAM_PROPERTY_NAMES);
  const statusText = getPropertyTextByNames(properties, STATUS_PROPERTY_NAMES);

  const text = [
    title,
    questionText ? `Question: ${questionText}` : "",
    revisedAnswerText ? `Approved Answer: ${revisedAnswerText}` : "",
    originalAnswerText ? `Original Answer: ${originalAnswerText}` : "",
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
    answerText: revisedAnswerText,
    keywordText,
    categoryText,
    programText,
    statusText,
    score: 0,
    lastEditedTime: page.last_edited_time || page.created_time || "",
  };

  doc.score = scoreApprovedAnswerDocument(doc, question, searchTerms);
  return doc;
}

function scoreApprovedAnswerDocument(
  document: SearchDocument,
  question: string,
  searchTerms: string[]
): number {
  let score = scoreDocument(document, question, searchTerms);
  const queryCompact = normalizeCompactText(question);
  const titleCompact = normalizeCompactText(document.title);
  const questionCompact = normalizeCompactText(document.questionText);
  const primaryTopicTerms = extractPrimaryTopicTerms(question);

  if (queryCompact && titleCompact === queryCompact) {
    score += 700;
  } else if (queryCompact && questionCompact === queryCompact) {
    score += 700;
  } else if (queryCompact && titleCompact.includes(queryCompact)) {
    score += 420;
  } else if (queryCompact && questionCompact.includes(queryCompact)) {
    score += 420;
  } else if (queryCompact && queryCompact.includes(titleCompact) && titleCompact.length >= 4) {
    score += 260;
  } else if (queryCompact && queryCompact.includes(questionCompact) && questionCompact.length >= 4) {
    score += 260;
  }

  if (primaryTopicTerms.length > 0 && documentMatchesAnyTerm(document, primaryTopicTerms)) {
    score += 160;
  }

  const meaningfulTerms = searchTerms.filter((term) => {
    const compact = normalizeCompactText(term);
    return compact.length >= 2 && !isWeakSearchTerm(term);
  });

  const matchedMeaningfulTerms = meaningfulTerms.filter((term) =>
    documentMatchesAnyTerm(document, [term])
  );

  score += Math.min(matchedMeaningfulTerms.length * 18, 120);

  if (document.answerText.trim().length >= 20) {
    score += 30;
  }

  return Math.max(score, 0);
}

function selectApprovedAnswerDocuments(
  documents: SearchDocument[],
  question: string
): SearchDocument[] {
  if (documents.length === 0) {
    return [];
  }

  const primaryTopicTerms = extractPrimaryTopicTerms(question);
  const baseDocuments =
    primaryTopicTerms.length > 0
      ? documents.filter((doc) => documentMatchesAnyTerm(doc, primaryTopicTerms))
      : documents;

  const candidates = baseDocuments.length > 0 ? baseDocuments : documents;
  const topScore = candidates[0]?.score || 0;

  return candidates
    .filter((doc) => {
      if (doc.score < MIN_APPROVED_ANSWER_SCORE) {
        return false;
      }

      return doc.score >= Math.max(MIN_APPROVED_ANSWER_SCORE, Math.floor(topScore * 0.4));
    })
    .slice(0, 5);
}

function isConfidentApprovedAnswerMatch(document: SearchDocument, question: string): boolean {
  if (!document.answerText || document.answerText.trim().length < 8) {
    return false;
  }

  if (document.score < MIN_APPROVED_ANSWER_SCORE) {
    return false;
  }

  const queryCompact = normalizeCompactText(question);
  const titleCompact = normalizeCompactText(document.title);
  const questionCompact = normalizeCompactText(document.questionText);

  if (
    queryCompact &&
    (titleCompact === queryCompact ||
      questionCompact === queryCompact ||
      titleCompact.includes(queryCompact) ||
      questionCompact.includes(queryCompact))
  ) {
    return true;
  }

  const primaryTopicTerms = extractPrimaryTopicTerms(question);
  if (primaryTopicTerms.length > 0) {
    return documentMatchesAnyTerm(document, primaryTopicTerms) && document.score >= MIN_APPROVED_ANSWER_SCORE;
  }

  const meaningfulTerms = createSearchTerms(question).filter((term) => {
    const compact = normalizeCompactText(term);
    return compact.length >= 2 && !isWeakSearchTerm(term);
  });

  const matchedCount = meaningfulTerms.filter((term) => documentMatchesAnyTerm(document, [term])).length;

  return matchedCount >= 2 && document.score >= MIN_APPROVED_ANSWER_SCORE + 40;
}

function createApprovedAnswerPayload(
  question: string,
  document: SearchDocument,
  documents: SearchDocument[],
  debug: SearchDebug
): AnswerPayload {
  const answer = [
    "承認済み回答DBから、過去にスタッフが修正・確認した回答を優先して表示します。",
    "",
    document.answerText.trim(),
    "",
    "※この回答は承認済み回答DBに保存された内容です。案件ごとの条件が変わる場合や、費用・契約・例外対応を含む場合は、先方へ回答する前に課長確認をしてください。",
  ].join("\n");

  return {
    answer,
    managerGate: createManagerGateForApprovedAnswer(document),
    steps: [
      "承認済み回答DBから採用された回答内容を確認する",
      "今回の質問内容と、保存済み回答の前提条件が合っているか確認する",
      "必要に応じてMain Manual Databaseの参照元も確認する",
      "先方へ送る前に、費用・契約・例外対応・個人情報に関わる点がないか確認する",
      "判断が必要な場合は、課長確認用メモを作成する",
    ],
    checklist: [
      { text: "承認済み回答DBから回答していることを確認した" },
      { text: "今回の案件と保存済み回答の前提条件が一致している" },
      { text: "Main Manual Databaseにない内容を追加で判断していない" },
      { text: "費用・契約・支払・例外対応・個人情報に関わる場合は課長確認に回す" },
    ],
    imagePrompt: buildImagePrompt("approved RSJP answer workflow"),
    imageUrl: "",
    references: buildReferences(documents),
    updatedAt: new Date().toISOString(),
    oldPolicyNote:
      "承認済み回答DBに保存されたスタッフ確認済み回答を、Main Manual Databaseより優先して表示しています。",
    debug: {
      search: debug,
    },
  };
}

function createManagerGateForApprovedAnswer(document: SearchDocument): ManagerGate {
  return {
    canProceedAlone: [
      "承認済み回答DBの内容を確認する",
      "今回の質問と保存済み回答の前提条件を照合する",
      "保存済み回答をもとに、案内文や作業メモを作成する",
      "Main Manual Databaseの参照元を追加確認する",
    ],
    needManagerApproval: [
      "保存済み回答と今回の案件条件が違う場合",
      "費用、見積、請求、支払、キャンセル、契約、受入可否に関わる場合",
      "先方に対して例外的な対応や確約を行う場合",
      "個人情報、アレルギー、医療情報、安全面の判断を含む場合",
      "保存済み回答の内容が古い可能性がある場合",
    ],
    approvalTiming: [
      "先方へ回答を送る前",
      "保存済み回答を今回の案件に合わせて変更する前",
      "Main Manual Databaseとの整合性に迷った時",
      "費用・契約・例外対応を含む時",
    ],
    managerQuestionTemplate: [
      `承認済み回答DBの「${document.title}」を参照しました。`,
      "今回の案件にも同じ考え方で案内してよいか確認させてください。",
      "必要であれば、修正後に再度承認済み回答DBへ保存します。",
    ].join("\n"),
  };
}

function createApprovedMatchReason(
  document: SearchDocument,
  question: string,
  searchTerms: string[]
): string {
  const reasons: string[] = [];
  const queryCompact = normalizeCompactText(question);
  const titleCompact = normalizeCompactText(document.title);
  const questionCompact = normalizeCompactText(document.questionText);

  if (queryCompact && titleCompact === queryCompact) {
    reasons.push("承認済み回答タイトル完全一致");
  } else if (queryCompact && questionCompact === queryCompact) {
    reasons.push("承認済みQuestion欄完全一致");
  } else if (queryCompact && titleCompact.includes(queryCompact)) {
    reasons.push("承認済み回答タイトルに質問文を含む");
  } else if (queryCompact && questionCompact.includes(queryCompact)) {
    reasons.push("承認済みQuestion欄に質問文を含む");
  }

  const matchedTerms = searchTerms
    .filter((term) => documentMatchesAnyTerm(document, [term]))
    .slice(0, 6);

  if (matchedTerms.length > 0) {
    reasons.push(`一致語: ${matchedTerms.join(", ")}`);
  }

  reasons.push("参照元: 承認済み回答DB");

  return reasons.join(" / ");
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
  const targetedTask = queryDatabaseTargetedPages(databaseId, question, searchTerms);
  const scanTask = queryDatabaseScanPages(databaseId);

  const [targetedPages, scanPages] = await Promise.all([targetedTask, scanTask]);

  return dedupeNotionPages([...targetedPages, ...scanPages]).slice(0, MAX_DATABASE_TOTAL_PAGES);
}

async function queryDatabaseScanPages(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null | undefined = undefined;

  while (pages.length < MAX_DATABASE_SCAN_PAGES) {
    const body: Record<string, unknown> = {
      page_size: Math.min(100, MAX_DATABASE_SCAN_PAGES - pages.length),
      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending",
        },
      ],
    };

    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = await notionFetch<NotionListResponse>(
      `/databases/${cleanNotionId(databaseId)}/query`,
      "POST",
      body
    );

    const results = Array.isArray(response.results) ? response.results : [];
    pages.push(...results.filter(isNotionPage));

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return pages.slice(0, MAX_DATABASE_SCAN_PAGES);
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

    const pages: NotionPage[] = [];
    let cursor: string | null | undefined = undefined;

    while (pages.length < MAX_DATABASE_TARGETED_PAGES) {
      const body: Record<string, unknown> = {
        page_size: Math.min(100, MAX_DATABASE_TARGETED_PAGES - pages.length),
        filter,
        sorts: [
          {
            timestamp: "last_edited_time",
            direction: "descending",
          },
        ],
      };

      if (cursor) {
        body.start_cursor = cursor;
      }

      const response = await notionFetch<NotionListResponse>(
        `/databases/${cleanNotionId(databaseId)}/query`,
        "POST",
        body
      );

      const results = Array.isArray(response.results) ? response.results : [];
      pages.push(...results.filter(isNotionPage));

      if (!response.has_more || !response.next_cursor) {
        break;
      }

      cursor = response.next_cursor;
    }

    return pages.slice(0, MAX_DATABASE_TARGETED_PAGES);
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
    .slice(0, 12);

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
    or: filters.slice(0, 95),
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
    return 98;
  }

  if (ANSWER_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 88;
  }

  if (KEYWORD_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 78;
  }

  if (PROGRAM_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 65;
  }

  if (CATEGORY_PROPERTY_NAMES.some((item) => normalizePropertyName(item) === normalizedName)) {
    return 62;
  }

  return 25;
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
    ...extractPrimaryTopicTerms(question),
    ...extractAnchorTerms(question),
    ...searchTerms,
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .filter((item) => !isWeakSearchTerm(item))
    )
  ).slice(0, 12);
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

    if (block.has_children && lines.join("\n").length < 3200) {
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

  const fallbackCandidates = [
    properties.Name,
    properties.name,
    properties.Title,
    properties.title,
    properties.名前,
  ];

  for (const candidate of fallbackCandidates) {
    const value = getPropertyValueText(candidate);
    if (value) {
      return value;
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
  if (!property) {
    return "";
  }

  if (!property.type) {
    if (typeof property.plain_text === "string") {
      return property.plain_text.trim();
    }

    if (typeof property.text === "string") {
      return property.text.trim();
    }

    if (Array.isArray(property.title)) {
      return richTextToPlain(property.title);
    }

    if (Array.isArray(property.rich_text)) {
      return richTextToPlain(property.rich_text);
    }

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

  if (type === "unique_id") {
    const prefix = property.unique_id?.prefix || "";
    const number = property.unique_id?.number ?? "";
    return [prefix, number].filter(Boolean).join("-");
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

  if (type === "quote") {
    const text = richTextToPlain(value.rich_text);
    return text ? `引用: ${text}` : "";
  }

  if (type === "callout") {
    const text = richTextToPlain(value.rich_text);
    return text ? `注記: ${text}` : "";
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
  if (documents.length === 0) {
    return createManualUnknownPayload({
      question,
      documents,
      debug,
      note: "Main Manual Databaseで関連候補を確認できませんでした。",
    });
  }

  const topScore = documents[0]?.score || 0;

  if (!hasEnoughEvidence(question, documents)) {
    return createManualUnknownPayload({
      question,
      documents,
      debug,
      note: `Main Manual Database内の根拠が十分ではないため、断定回答を避けています。最高スコアは ${topScore} です。`,
    });
  }

  const directAnswerPayload = createDirectAnswerPayloadIfReliable(question, documents, debug);
  if (directAnswerPayload) {
    return directAnswerPayload;
  }

  const openaiApiKey = getEnv("OPENAI_API_KEY");

  if (!openaiApiKey) {
    return createManualUnknownPayload({
      question,
      documents,
      debug,
      note: "OPENAI_API_KEY が設定されていないため、AI回答を生成できません。Main Manual Databaseの参照候補のみ表示します。",
    });
  }

  const context = buildContextForAi(documents);
  const schema = buildAnswerJsonSchema();

  const systemPrompt = [
    "あなたはRSJP業務マニュアルAIです。",
    "このアプリはMain Manual Database専用です。",
    "Manual Database 2、Manual Database 3、Root Page、Notion Search API、外部Web、一般知識は参照しません。",
    "目的は、新人職員が業務手順を確認し、危ない判断では課長確認で止まれるようにすることです。",
    "必ずMain Manual Databaseから取得した参照情報だけに基づいて、日本語で回答してください。",
    "外部知識、一般知識、推測、連想で不足情報を補ってはいけません。",
    "参照情報に明記されていない学校名、団体名、住所、電話番号、URL、担当部署名、制度名、料金、日付を作ってはいけません。",
    "Reference 1 は最も重要な参照元です。ただしReference 1だけで不足する場合はReference 2以降も使ってください。",
    "質問の主題と参照情報がずれている場合は、無理に回答せず『Main Manual Databaseでは確認できません』と書いてください。",
    "Notionで確認できたことと、確認できなかったことを分けてください。",
    "費用、見積、請求、契約、支払、受入可否、例外対応、先方への確約、個人情報、アレルギー、医療情報は課長確認が必要です。",
    "回答は短く、実務でそのまま使える形にしてください。",
    "回答は必ずJSONだけで返してください。",
  ].join("\n");

  const userPrompt = [
    `質問: ${question}`,
    "",
    "Main Manual Databaseから取得した参照情報:",
    context,
    "",
    "出力条件:",
    "- answer は、初心者向けに読みやすい本文にする。",
    "- Main Manual Databaseに書かれていない内容は補足しない。",
    "- 主題が一致していない参照元をもとに回答しない。",
    "- 不足情報がある場合は、補完せず『Main Manual Databaseでは確認できません』と書く。",
    "- steps は、参照情報に基づいて新人が順番に進められる手順にする。",
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

      return createManualUnknownPayload({
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
    return createManualUnknownPayload({
      question,
      documents,
      debug,
      note: `OpenAI回答生成中にエラーが発生しました: ${getErrorMessage(error)}`,
    });
  }
}

function hasEnoughEvidence(question: string, documents: SearchDocument[]): boolean {
  if (documents.length === 0) {
    return false;
  }

  const topDocument = documents[0];
  const topScore = topDocument.score;

  if (topScore < MIN_CONFIDENT_SCORE) {
    return false;
  }

  const primaryTerms = extractPrimaryTopicTerms(question);

  if (primaryTerms.length === 0) {
    return topScore >= MIN_CONFIDENT_SCORE;
  }

  const hasPrimaryMatch = documents
    .slice(0, Math.min(3, documents.length))
    .some((doc) => documentMatchesAnyTerm(doc, primaryTerms));

  return hasPrimaryMatch && topScore >= MIN_CONFIDENT_SCORE;
}

function createDirectAnswerPayloadIfReliable(
  question: string,
  documents: SearchDocument[],
  debug: SearchDebug
): AnswerPayload | null {
  const topDocument = documents[0];

  if (!topDocument) {
    return null;
  }

  if (topDocument.score < MIN_DIRECT_ANSWER_SCORE) {
    return null;
  }

  if (isComplexOperationalQuestion(question)) {
    return null;
  }

  const answerText = extractDirectAnswerText(topDocument);

  if (!answerText || answerText.length < 8) {
    return null;
  }

  const answer = [
    "Main Manual Databaseの記載では、以下のように案内されています。",
    "",
    answerText,
    "",
    "※この回答はMain Manual Databaseの記載をもとにしています。記載のない情報は補足していません。",
  ].join("\n");

  return {
    answer,
    managerGate: createSafeManagerGateForDirectAnswer(topDocument),
    steps: [
      "採用されたMain Manual Databaseの参照元を確認する",
      "記載内容をもとに案内または作業を進める",
      "Main Manual Databaseに記載のない情報を追加しない",
      "例外対応、費用、安全面、契約判断が関係する場合は課長確認を行う",
    ],
    checklist: [
      { text: "採用されたMain Manual Databaseのページが質問内容と一致している" },
      { text: "参照元の記載内容を確認した" },
      { text: "Main Manual Databaseにない情報を追加していない" },
      { text: "例外対応や判断が必要な内容は課長確認に回した" },
    ],
    imagePrompt: buildImagePrompt("RSJP manual answer workflow"),
    imageUrl: "",
    references: buildReferences(documents),
    updatedAt: new Date().toISOString(),
    oldPolicyNote:
      "Main Manual Databaseの明確な記載を優先し、外部知識で補完せずに回答しています。",
    debug: {
      search: debug,
    },
  };
}

function isComplexOperationalQuestion(question: string): boolean {
  const compact = normalizeCompactText(question);
  const complexMarkers = [
    "順番",
    "一連",
    "流れ",
    "手順",
    "から",
    "まで",
    "見積",
    "請求",
    "発注",
    "支払",
    "契約",
    "処理",
    "例外",
    "キャンセル",
  ];

  return complexMarkers.filter((marker) => compact.includes(normalizeCompactText(marker))).length >= 2;
}

function extractDirectAnswerText(document: SearchDocument): string {
  const answerText = normalizeString(document.answerText);

  if (answerText) {
    return answerText;
  }

  const match = document.text.match(/Answer:\s*([\s\S]*?)(?:\n(?:Keyword|Category|Program|Status|Question):|$)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return "";
}

function createSafeManagerGateForDirectAnswer(document: SearchDocument): ManagerGate {
  return {
    canProceedAlone: [
      "Main Manual Databaseに書かれた範囲を確認する",
      "Main Manual Databaseの記載をもとに案内文や作業メモを作成する",
      "参照元ページを確認する",
    ],
    needManagerApproval: [
      "Main Manual Databaseにない内容を補足して案内する場合",
      "費用、契約、支払、キャンセル、受入可否、安全面に関わる判断がある場合",
      "参加者や相手機関に対して例外的な対応を認める場合",
      "Main Manual Databaseの記載と実際の運用が違う可能性がある場合",
    ],
    approvalTiming: [
      "先方へ回答する前",
      "Main Manual Databaseにない情報を追加したくなった時",
      "例外対応や判断を含む案内をする前",
    ],
    managerQuestionTemplate: [
      `以下のMain Manual Databaseページを参照しました：${document.title}`,
      "記載では〇〇と理解しました。",
      "この内容をもとに先方へ案内してよろしいでしょうか。",
    ].join("\n"),
  };
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
        "Strict safety rule:",
        "Use only the information written in this Main Manual Database reference. Do not add school names, addresses, phone numbers, URLs, fees, dates, or department names that are not written here.",
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
    "Main Manual Databaseの参照元を確認する",
    "現在の案件に当てはまる部分を整理する",
    "判断が必要な箇所は課長に確認する",
  ]);
  const checklist = normalizeChecklist(raw.checklist);
  const references = buildReferences(documents);

  return {
    answer: normalizeString(raw.answer, "回答を生成できませんでした。Main Manual Databaseの参照元を確認してください。"),
    managerGate,
    steps,
    checklist,
    imagePrompt: normalizeString(raw.imagePrompt, buildImagePrompt("RSJP業務フロー")),
    imageUrl: "",
    references,
    updatedAt: new Date().toISOString(),
    oldPolicyNote: normalizeString(raw.oldPolicyNote, "Main Manual Databaseの参照情報をもとに回答しています。"),
    debug: {
      search: debug,
    },
  };
}

function createManualUnknownPayload(args: {
  question: string;
  documents: SearchDocument[];
  debug: SearchDebug;
  note: string;
}): AnswerPayload {
  const topTitles = args.documents.slice(0, 5).map((doc) => `・${doc.title}`).join("\n");

  const answer = [
    "Main Manual Databaseでは、質問に対する十分な根拠を確認できませんでした。",
    "",
    args.note,
    "",
    "確認できた参照候補:",
    topTitles || "・関連するMain Manual Databaseページを確認できませんでした。",
    "",
    "対応方針:",
    "1. Main Manual Database内の該当ページを直接確認してください。",
    "2. 参照候補が質問の主題とずれている場合は、その内容で回答しないでください。",
    "3. 費用・契約・支払・例外対応・個人情報に関わる場合は、先方へ回答する前に課長確認をしてください。",
    "4. 学生向けFAQやプログラム詳細に関する質問は、別アプリまたはFAQ用ナレッジで確認してください。",
  ].join("\n");

  return {
    answer,
    managerGate: DEFAULT_MANAGER_GATE,
    steps: [
      "検索デバッグで、Main Manual Databaseが読まれているか確認する",
      "参照元に関連ページが出ているか確認する",
      "関連ページが出ない場合は、Main Manual Databaseのページ名・キーワード・本文を確認する",
      "先方へ確定回答を送る前に、課長確認を行う",
    ],
    checklist: [
      { text: "NOTION_API_KEY がVercelに設定されている" },
      { text: "NOTION_DATABASE_ID がVercelに設定されている" },
      { text: "Main Manual DatabaseがNotion Integrationに共有されている" },
      { text: "参照候補が質問の主題と一致している" },
      { text: "費用・契約・例外対応は課長確認に回す" },
    ],
    imagePrompt: buildImagePrompt("Main Manual Database confirmation workflow"),
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
      { text: "Main Manual Databaseの参照元を確認した" },
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
        { text: "Main Manual Databaseの参照元を確認した" },
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

  return references.length > 0 ? references : ["Main Manual Database参照元なし"];
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
    "見積書",
    "請求",
    "請求書",
    "支払",
    "支払い",
    "契約",
    "合意書",
    "発注",
    "COUPA",
    "Coupa",
    "業者",
    "バス",
    "大型バス",
    "チャーターバス",
    "ヤサカ",
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
    "OIC",
    "BKC",
    "衣笠",
    "朱雀",
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

  return Array.from(terms).slice(0, 40);
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
    "大型バス",
    "チャーターバス",
    "バス手配",
    "発注方法",
    "見積依頼",
    "見積書",
    "請求書",
    "請求書処理",
    "支払処理",
    "業者発注",
    "人数変更",
    "交通費",
    "宿舎手配",
    "保険加入",
    "ビザ書類",
    "招へい理由書",
    "参加資格",
    "参加対象外",
    "アレルギー",
  ];

  for (const word of commonWords) {
    if (compact.includes(word)) {
      terms.push(word);
    }
  }

  return terms;
}

function extractPrimaryTopicTerms(question: string): string[] {
  const compact = normalizeCompactText(question);
  const topicGroups = [
    ["大型バス", "チャーターバス", "バス手配", "貸切バス", "ヤサカ"],
    ["Coupa", "COUPA", "クーパ", "発注", "業者発注"],
    ["見積", "見積書", "見積依頼"],
    ["請求", "請求書", "請求書処理"],
    ["支払", "支払い", "支払処理"],
    ["宿舎", "宿泊", "エポック", "ホテル"],
    ["保険", "学研賠", "学研災"],
    ["ビザ", "招へい", "招へい理由書"],
    ["契約", "合意書", "協定"],
    ["キャンセル", "取消", "返金"],
  ];

  for (const group of topicGroups) {
    const matched = group.some((term) => compact.includes(normalizeCompactText(term)));
    if (matched) {
      return group;
    }
  }

  return [];
}

function extractAnchorTerms(question: string): string[] {
  const anchors = new Set<string>();
  const compact = question.replace(/\s+/g, "");

  const asciiMatches = question.match(/\b[A-Z0-9][A-Z0-9_-]{1,}\b/g) || [];
  for (const match of asciiMatches) {
    anchors.add(match);
  }

  const knownAnchors = [
    "OIC",
    "BKC",
    "RSJP",
    "RWJP",
    "RDSP",
    "OU",
    "JMU",
    "UCD",
    "FIU",
    "CWRU",
    "Rutgers",
    "CityUHK",
    "Coupa",
    "Convera",
    "COUPA",
    "衣笠",
    "朱雀",
    "茨木",
    "京都",
    "大阪",
    "奈良",
    "関空",
    "伊丹",
    "JR",
    "阪急",
  ];

  for (const anchor of knownAnchors) {
    if (compact.toLowerCase().includes(anchor.toLowerCase())) {
      anchors.add(anchor);
    }
  }

  return Array.from(anchors).filter((item) => item.length >= 2);
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
    queries.push(terms.slice(0, 12).join(" "));
  }

  return Array.from(new Set(queries.filter(Boolean)));
}

function scoreDocument(document: SearchDocument, question: string, searchTerms: string[]): number {
  const query = normalizeText(question);
  const queryCompact = normalizeCompactText(question);
  const titleCompact = normalizeCompactText(document.title);
  const questionFieldCompact = normalizeCompactText(document.questionText);
  const answerField = normalizeText(document.answerText);
  const answerFieldCompact = normalizeCompactText(document.answerText);
  const keywordField = normalizeText(document.keywordText);
  const keywordFieldCompact = normalizeCompactText(document.keywordText);
  const categoryField = normalizeText(document.categoryText);
  const categoryFieldCompact = normalizeCompactText(document.categoryText);
  const programField = normalizeText(document.programText);
  const programFieldCompact = normalizeCompactText(document.programText);
  const text = normalizeText(document.text);
  const textCompact = normalizeCompactText(document.text);
  const anchorTerms = extractAnchorTerms(question);
  const primaryTopicTerms = extractPrimaryTopicTerms(question);
  let score = 0;

  if (queryCompact && titleCompact === queryCompact) {
    score += 520;
  } else if (queryCompact && questionFieldCompact === queryCompact) {
    score += 520;
  } else if (queryCompact && titleCompact.includes(queryCompact)) {
    score += 360;
  } else if (queryCompact && questionFieldCompact.includes(queryCompact)) {
    score += 360;
  } else if (queryCompact && queryCompact.includes(titleCompact) && titleCompact.length >= 4) {
    score += 220;
  } else if (
    queryCompact &&
    queryCompact.includes(questionFieldCompact) &&
    questionFieldCompact.length >= 4
  ) {
    score += 220;
  }

  if (primaryTopicTerms.length > 0) {
    if (documentMatchesAnyTerm(document, primaryTopicTerms)) {
      score += 240;
    } else {
      score -= 260;
    }
  }

  if (query && text.includes(query)) {
    score += 70;
  }

  if (query && answerField.includes(query)) {
    score += 80;
  }

  for (const anchor of anchorTerms) {
    const anchorCompact = normalizeCompactText(anchor);

    if (!anchorCompact) {
      continue;
    }

    if (titleCompact.includes(anchorCompact) || questionFieldCompact.includes(anchorCompact)) {
      score += 130;
    } else if (
      keywordFieldCompact.includes(anchorCompact) ||
      programFieldCompact.includes(anchorCompact) ||
      categoryFieldCompact.includes(anchorCompact)
    ) {
      score += 90;
    } else if (answerFieldCompact.includes(anchorCompact)) {
      score += 55;
    } else if (textCompact.includes(anchorCompact)) {
      score += 25;
    } else {
      score -= 55;
    }
  }

  for (const term of searchTerms) {
    const normalizedTerm = normalizeText(term);
    const compactTerm = normalizeCompactText(term);

    if (!normalizedTerm || !compactTerm || isWeakSearchTerm(normalizedTerm)) {
      continue;
    }

    if (titleCompact.includes(compactTerm)) {
      score += 58;
    }

    if (questionFieldCompact.includes(compactTerm)) {
      score += 68;
    }

    if (keywordField.includes(normalizedTerm) || keywordFieldCompact.includes(compactTerm)) {
      score += 40;
    }

    if (categoryField.includes(normalizedTerm) || categoryFieldCompact.includes(compactTerm)) {
      score += 28;
    }

    if (programField.includes(normalizedTerm) || programFieldCompact.includes(compactTerm)) {
      score += 28;
    }

    const answerCount = countOccurrences(answerField, normalizedTerm);
    score += Math.min(answerCount * 12, 48);

    const textCount = countOccurrences(text, normalizedTerm);
    score += Math.min(textCount * 5, 28);
  }

  if (document.answerText && document.answerText.trim().length >= 8) {
    score += 12;
  }

  if (document.lastEditedTime) {
    score += 1;
  }

  return Math.max(score, 0);
}

function selectFinalDocuments(documents: SearchDocument[], question: string): SearchDocument[] {
  if (documents.length === 0) {
    return [];
  }

  const primaryTopicTerms = extractPrimaryTopicTerms(question);
  const primaryMatchingDocs =
    primaryTopicTerms.length > 0
      ? documents.filter((doc) => documentMatchesAnyTerm(doc, primaryTopicTerms))
      : [];

  const baseDocuments = primaryMatchingDocs.length > 0 ? primaryMatchingDocs : documents;
  const topScore = baseDocuments[0].score;

  const selected = baseDocuments.filter((doc) => {
    if (doc.score < MIN_CONFIDENT_SCORE) {
      return false;
    }

    return doc.score >= Math.max(MIN_CONFIDENT_SCORE, Math.floor(topScore * 0.25));
  });

  if (selected.length > 0) {
    return selected.slice(0, MAX_SELECTED_DOCS);
  }

  return baseDocuments.slice(0, Math.min(3, MAX_SELECTED_DOCS));
}

function documentMatchesAnyTerm(document: SearchDocument, terms: string[]): boolean {
  const target = normalizeCompactText(
    [
      document.title,
      document.questionText,
      document.answerText,
      document.keywordText,
      document.categoryText,
      document.programText,
      document.text,
    ].join("\n")
  );

  return terms.some((term) => target.includes(normalizeCompactText(term)));
}

function sortDocumentsByRelevance(a: SearchDocument, b: SearchDocument): number {
  if (b.score !== a.score) {
    return b.score - a.score;
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
  const primaryTopicTerms = extractPrimaryTopicTerms(question);
  const anchors = extractAnchorTerms(question);

  if (queryCompact && titleCompact === queryCompact) {
    reasons.push("タイトル完全一致");
  } else if (queryCompact && questionCompact === queryCompact) {
    reasons.push("Question欄完全一致");
  } else if (queryCompact && titleCompact.includes(queryCompact)) {
    reasons.push("タイトルに質問文を含む");
  } else if (queryCompact && questionCompact.includes(queryCompact)) {
    reasons.push("Question欄に質問文を含む");
  }

  const matchedPrimaryTerms = primaryTopicTerms.filter((term) => documentMatchesAnyTerm(document, [term]));
  if (matchedPrimaryTerms.length > 0) {
    reasons.push(`主題語一致: ${matchedPrimaryTerms.join(", ")}`);
  }

  const matchedAnchors = anchors.filter((anchor) => documentMatchesAnyTerm(document, [anchor]));
  if (matchedAnchors.length > 0) {
    reasons.push(`固有語一致: ${matchedAnchors.join(", ")}`);
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
    .slice(0, 6);

  if (matchedTerms.length > 0) {
    reasons.push(`一致語: ${matchedTerms.join(", ")}`);
  }

  reasons.push("参照元: Main Manual Database");

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
  return text.replace(/\s+/g, " ").trim().slice(0, 360);
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