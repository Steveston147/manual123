// FILE: src/App.tsx
// PATH: src/App.tsx
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type ChecklistItem = {
  text: string;
  done?: boolean;
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
  sourceName?: string;
  sourceType?: string;
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
  sourceCounts?: Record<string, number>;
  errors?: string[];
};

type AnswerPayload = {
  answer: string;
  steps: string[];
  checklist: ChecklistItem[];
  imagePrompt: string;
  imageUrl?: string;
  references?: string[];
  updatedAt?: string;
  oldPolicyNote?: string;
  managerGate?: ManagerGate;
  debug?: {
    search?: SearchDebug;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  question?: string;
  payload?: AnswerPayload;
  rawText?: string;
  createdAt: string;
};

type RevisionRecord = {
  id: string;
  question: string;
  originalAnswer: string;
  revisedAnswer: string;
  revisedAt: string;
  note: string;
};

type AuthState = {
  email: string;
  token: string;
};

type GenerateImageResponse = {
  ok?: boolean;
  imageUrl?: string;
  error?: string;
  model?: string;
  size?: string;
  quality?: string;
  createdAt?: string;
};

const STORAGE_KEYS = {
  messages: "rsjp_manual_messages_v3",
  revisions: "rsjp_manual_revisions_v2",
  settings: "rsjp_manual_settings_v2",
};

const DEFAULT_SETTINGS = {
  qaWebhookUrl: "/api/ask",
  authWebhookUrl: "",
  revisionNotionWebhookUrl: "",
  notionDatabaseUrl:
    "https://www.notion.so/fe38f692c4874cd291cb51fbb49566fc?v=8e64c3768093465d9b8791fce4c17b10",
  notionRevisionDatabaseId: "",
  enforceLatestPolicy: true,
  imageProvider: "openai-images",
  imageModel: "gpt-image-1",
};

const ENABLE_IMAGE_GENERATION: boolean = false;

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

const QUICK_SAMPLE_QUESTIONS = [
  "大型バスの発注方法を、見積依頼から請求書処理まで順番に教えてください。",
  "参加対象外の学生から問い合わせが来た場合の対応を教えてください。",
  "小学校訪問でアレルギー情報を確認するときの手順を教えてください。",
  "契約書や支払期限に関する確認ポイントを教えてください。",
];

const LOGIN_FEATURES = [
  {
    title: "Notion検索",
    text: "RSJPマニュアルDBから関連ページを探し、根拠付きで回答します。",
    icon: "⌕",
  },
  {
    title: "課長確認ゲート",
    text: "新人が進めてよい作業と、確認が必要な判断を分けます。",
    icon: "✓",
  },
  {
    title: "手順化",
    text: "長い業務説明を、作業順・チェックリスト・確認ポイントに整理します。",
    icon: "▣",
  },
  {
    title: "印刷対応",
    text: "回答をそのまま新人説明・引き継ぎ資料として印刷できます。",
    icon: "↧",
  },
];

const LOGIN_STATS = [
  { label: "Manual DB", value: "Notion" },
  { label: "Safety", value: "Manager Gate" },
  { label: "Output", value: "Answer + Steps" },
];

const WORKFLOW_STEPS = [
  "質問する",
  "Notionを検索",
  "回答を整理",
  "課長確認",
  "作業実行",
];

type Settings = typeof DEFAULT_SETTINGS;

type AskRequestPayload = {
  question: string;
  requestedBy: string;
  dataSource: {
    provider: string;
    notionDatabaseUrl: string;
    requireLatestIfDuplicated: boolean;
  };
  outputFormat: {
    answer: string;
    managerGate: string;
    steps: string;
    checklist: string;
    imagePrompt: string;
    imageUrl: string;
    references: string;
    updatedAt: string;
    oldPolicyNote: string;
  };
  imageGeneration: {
    provider: string;
    model: string;
  };
  policy: {
    beginnerFriendly: boolean;
    avoidPersonalDependency: boolean;
    includeManagerApprovalGate: boolean;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeSetStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存に失敗しても画面は落とさない
  }
}

function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeChecklistItems(value: unknown, fallback: ChecklistItem[]) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item): ChecklistItem | null => {
      if (typeof item === "string" && item.trim()) {
        return { text: item.trim() };
      }

      if (isRecord(item) && typeof item.text === "string" && item.text.trim()) {
        return {
          text: item.text.trim(),
          done: typeof item.done === "boolean" ? item.done : false,
        };
      }

      return null;
    })
    .filter((item): item is ChecklistItem => Boolean(item));

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeManagerGate(value: unknown): ManagerGate {
  if (!isRecord(value)) return DEFAULT_MANAGER_GATE;

  return {
    canProceedAlone: normalizeStringArray(
      value.canProceedAlone,
      DEFAULT_MANAGER_GATE.canProceedAlone
    ),
    needManagerApproval: normalizeStringArray(
      value.needManagerApproval,
      DEFAULT_MANAGER_GATE.needManagerApproval
    ),
    approvalTiming: normalizeStringArray(
      value.approvalTiming,
      DEFAULT_MANAGER_GATE.approvalTiming
    ),
    managerQuestionTemplate: normalizeString(
      value.managerQuestionTemplate,
      DEFAULT_MANAGER_GATE.managerQuestionTemplate
    ),
  };
}

function normalizeSearchDebug(value: unknown): SearchDebug {
  if (!isRecord(value)) {
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
      errors: [],
    };
  }

  const knowledgeBases = Array.isArray(value.knowledgeBases)
    ? value.knowledgeBases
    : [];

  const sourceCountsFromKnowledgeBases: Record<string, number> = {};

  knowledgeBases.forEach((item) => {
    if (!isRecord(item)) return;

    const name = normalizeString(item.name, normalizeString(item.envName, "Unknown"));
    const count = normalizeNumber(item.selected, normalizeNumber(item.fetched, 0));
    sourceCountsFromKnowledgeBases[name] = count;
  });

  const sourceCounts = isRecord(value.sourceCounts)
    ? Object.fromEntries(
        Object.entries(value.sourceCounts)
          .filter(([, count]) => typeof count === "number")
          .map(([sourceName, count]) => [sourceName, count as number])
      )
    : sourceCountsFromKnowledgeBases;

  const selectedPagesFromArray = Array.isArray(value.selectedPages)
    ? value.selectedPages
        .map((page, index): SearchDebugPage | null => {
          if (isRecord(page)) {
            return {
              title: normalizeString(page.title, `Page ${index + 1}`),
              score: normalizeNumber(page.score, 0),
              url: typeof page.url === "string" ? page.url : undefined,
              lastEditedTime:
                typeof page.lastEditedTime === "string"
                  ? page.lastEditedTime
                  : undefined,
              contentPreview: normalizeString(page.contentPreview, ""),
              sourceName:
                typeof page.sourceName === "string" ? page.sourceName : undefined,
              sourceType:
                typeof page.sourceType === "string" ? page.sourceType : undefined,
            };
          }

          return null;
        })
        .filter((page): page is SearchDebugPage => Boolean(page))
    : [];

  const selectedPagesFromTitles = Array.isArray(value.selectedTitles)
    ? value.selectedTitles
        .filter((item): item is string => typeof item === "string")
        .map((title, index) => ({
          title,
          score: 0,
          contentPreview: "APIから返された候補タイトルです。",
          sourceName: "API Debug",
          sourceType: `candidate-${index + 1}`,
        }))
    : [];

  const selectedPages =
    selectedPagesFromArray.length > 0 ? selectedPagesFromArray : selectedPagesFromTitles;

  return {
    searchTerms: normalizeStringArray(value.searchTerms, []),
    searchQueries: normalizeStringArray(
      value.searchQueries,
      typeof value.query === "string" && value.query.trim() ? [value.query.trim()] : []
    ),
    databasePageCount: normalizeNumber(
      value.databasePageCount,
      knowledgeBases.reduce((sum, item) => {
        if (!isRecord(item)) return sum;
        return sum + normalizeNumber(item.fetched, 0);
      }, 0)
    ),
    seedPageCount: normalizeNumber(value.seedPageCount, normalizeNumber(value.totalCandidates, 0)),
    discoveredPageCount: normalizeNumber(
      value.discoveredPageCount,
      normalizeNumber(value.totalCandidates, 0)
    ),
    selectedPageCount: normalizeNumber(
      value.selectedPageCount,
      typeof value.selectedPages === "number" ? value.selectedPages : selectedPages.length
    ),
    maxScore: normalizeNumber(value.maxScore, normalizeNumber(value.topScore, 0)),
    minimumScore: normalizeNumber(value.minimumScore, normalizeNumber(value.threshold, 0)),
    selectedPages,
    sourceCounts,
    errors: normalizeStringArray(value.errors, []),
  };
}

function normalizeAnswerPayload(question: string, raw: unknown): AnswerPayload {
  if (typeof raw === "string") {
    return {
      answer: raw,
      managerGate: DEFAULT_MANAGER_GATE,
      steps: ["回答本文を確認し、不足部分を追質問してください。"],
      checklist: [
        { text: "回答に具体的な作業手順がある" },
        { text: "担当者依存の表現がない" },
        { text: "先方へ送る前に課長確認が必要な点を確認した" },
      ],
      imagePrompt:
        "Background image only. No text, no letters, no numbers, no labels. Friendly flat illustration for an administrative workflow manual.",
      imageUrl: "",
      references: ["API response"],
      updatedAt: nowIso(),
      oldPolicyNote:
        "過去版との差分情報は取得できませんでした。必要なら更新日を指定して再質問してください。",
    };
  }

  const data = isRecord(raw) ? raw : {};

  const debugSearch =
    isRecord(data.debug) && data.debug.search
      ? normalizeSearchDebug(data.debug.search)
      : undefined;

  return {
    answer: normalizeString(
      data.answer,
      normalizeString(
        data.text,
        `「${question}」への回答データが不足していたため、再実行してください。`
      )
    ),
    managerGate: normalizeManagerGate(data.managerGate),
    steps: normalizeStringArray(data.steps, [
      "質問の目的を確認する",
      "Notion APIで最新更新日を確認する",
      "業務手順を順番に実行する",
    ]),
    checklist: normalizeChecklistItems(data.checklist, [
      { text: "対象手順を最後まで実施した" },
      { text: "記録を保存した" },
      { text: "課長確認が必要な内容を送信前に確認した" },
    ]),
    imagePrompt: normalizeString(
      data.imagePrompt,
      "Background image only. No text, no letters, no numbers, no labels. Friendly flat illustration for an administrative workflow manual."
    ),
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    references: normalizeStringArray(data.references, ["Notion API 最新版"]),
    updatedAt: normalizeString(data.updatedAt, nowIso()),
    oldPolicyNote: normalizeString(
      data.oldPolicyNote,
      "過去運用との差分は、更新履歴の要約を確認してください。"
    ),
    debug: debugSearch ? { search: debugSearch } : undefined,
  };
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;

  const role = value.role === "user" || value.role === "assistant" ? value.role : null;
  if (!role) return null;

  const id = normalizeString(value.id, makeId());
  const createdAt = normalizeString(value.createdAt, nowIso());

  if (role === "user") {
    const rawText = normalizeString(value.rawText, normalizeString(value.question, ""));

    return {
      id,
      role,
      rawText,
      createdAt,
    };
  }

  const question = normalizeString(value.question, "");
  const payload = normalizeAnswerPayload(question, value.payload ?? value.rawText ?? "");

  return {
    id,
    role,
    question,
    payload,
    createdAt,
  };
}

function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeChatMessage)
    .filter((message): message is ChatMessage => Boolean(message))
    .slice(-50);
}

function normalizeRevisionRecord(value: unknown): RevisionRecord | null {
  if (!isRecord(value)) return null;

  return {
    id: normalizeString(value.id, makeId()),
    question: normalizeString(value.question, ""),
    originalAnswer: normalizeString(value.originalAnswer, ""),
    revisedAnswer: normalizeString(value.revisedAnswer, ""),
    revisedAt: normalizeString(value.revisedAt, nowIso()),
    note: normalizeString(value.note, ""),
  };
}

function normalizeRevisionRecords(value: unknown): RevisionRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeRevisionRecord)
    .filter((record): record is RevisionRecord => Boolean(record))
    .slice(0, 100);
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;

  return {
    qaWebhookUrl: normalizeString(value.qaWebhookUrl, DEFAULT_SETTINGS.qaWebhookUrl),
    authWebhookUrl: normalizeString(value.authWebhookUrl, DEFAULT_SETTINGS.authWebhookUrl),
    revisionNotionWebhookUrl: normalizeString(
      value.revisionNotionWebhookUrl,
      DEFAULT_SETTINGS.revisionNotionWebhookUrl
    ),
    notionDatabaseUrl: normalizeString(
      value.notionDatabaseUrl,
      DEFAULT_SETTINGS.notionDatabaseUrl
    ),
    notionRevisionDatabaseId: normalizeString(
      value.notionRevisionDatabaseId,
      DEFAULT_SETTINGS.notionRevisionDatabaseId
    ),
    enforceLatestPolicy: normalizeBoolean(
      value.enforceLatestPolicy,
      DEFAULT_SETTINGS.enforceLatestPolicy
    ),
    imageProvider: normalizeString(value.imageProvider, DEFAULT_SETTINGS.imageProvider),
    imageModel: normalizeString(value.imageModel, DEFAULT_SETTINGS.imageModel),
  };
}

function loadMessagesFromStorage() {
  const parsed = safeParse<unknown>(localStorage.getItem(STORAGE_KEYS.messages), []);
  const normalized = normalizeChatMessages(parsed);
  safeSetStorage(STORAGE_KEYS.messages, normalized);
  return normalized;
}

function loadRevisionsFromStorage() {
  const parsed = safeParse<unknown>(localStorage.getItem(STORAGE_KEYS.revisions), []);
  const normalized = normalizeRevisionRecords(parsed);
  safeSetStorage(STORAGE_KEYS.revisions, normalized);
  return normalized;
}

function loadSettingsFromStorage() {
  const parsed = safeParse<unknown>(localStorage.getItem(STORAGE_KEYS.settings), DEFAULT_SETTINGS);
  const normalized = normalizeSettings(parsed);
  safeSetStorage(STORAGE_KEYS.settings, normalized);
  return normalized;
}

function isInternalAskApi(url: string) {
  const normalized = url.trim();

  return normalized === "/api/ask" || normalized === "api/ask";
}

function shouldUseLocalMock(url: string) {
  return import.meta.env.DEV && isInternalAskApi(url);
}

function formatDateTime(value?: string) {
  if (!value) return "不明";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

function formatHeaderDateTime(value: Date) {
  const datePart = value.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const timePart = value.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${datePart} ${timePart}`;
}

function stripListPrefixForUi(value: string) {
  return value
    .replace(/^\s*(\d+[\.)]|[０-９]+[．.)）]|[①②③④⑤⑥⑦⑧⑨⑩]|[-・●■])\s*/g, "")
    .trim();
}

function makeSlideLabel(value: string, index: number) {
  const text = stripListPrefixForUi(value)
    .replace(/\s+/g, "")
    .trim();

  const rules = [
    { keys: ["問い合わせ", "確認"], label: "内容確認" },
    { keys: ["参加対象"], label: "参加条件" },
    { keys: ["大学生"], label: "大学生確認" },
    { keys: ["大学院生"], label: "大学院生確認" },
    { keys: ["高校生", "対象外"], label: "対象外判断" },
    { keys: ["高校生"], label: "高校生確認" },
    { keys: ["代替"], label: "代替案内" },
    { keys: ["別窓口"], label: "窓口確認" },
    { keys: ["最新", "確認"], label: "最新確認" },
    { keys: ["学内", "指示"], label: "学内確認" },
    { keys: ["見積"], label: "見積依頼" },
    { keys: ["発注"], label: "発注" },
    { keys: ["請求"], label: "請求確認" },
    { keys: ["納品"], label: "納品確認" },
    { keys: ["支払"], label: "支払確認" },
    { keys: ["契約"], label: "契約確認" },
    { keys: ["アレルギー"], label: "情報確認" },
    { keys: ["給食"], label: "給食確認" },
    { keys: ["空港"], label: "送迎確認" },
    { keys: ["宿泊"], label: "宿泊確認" },
    { keys: ["保険"], label: "保険確認" },
    { keys: ["メール"], label: "メール連絡" },
    { keys: ["学生"], label: "学生対応" },
    { keys: ["教員"], label: "教員確認" },
  ];

  const matched = rules.find((rule) =>
    rule.keys.every((key) => text.includes(key))
  );

  if (matched) return matched.label;

  const cleaned = text
    .replace(/してください/g, "")
    .replace(/確認する/g, "確認")
    .replace(/確認して/g, "確認")
    .replace(/必要がある/g, "")
    .replace(/であること/g, "")
    .replace(/すること/g, "")
    .replace(/する/g, "")
    .replace(/[。．、,]/g, "");

  if (cleaned.length <= 8) return cleaned;

  return `手順${index + 1}`;
}

function buildBackgroundImagePrompt(payload: AnswerPayload) {
  const stepCount = Math.max(1, Math.min(payload.steps.length, 6));

  return [
    "Create a clean 16:9 horizontal background illustration for an internal university administrative manual.",
    "Theme: international student programme office workflow, administrative staff, student inquiry, documents, email, checklist, decision making, handoff, and follow-up.",
    `Show about ${stepCount} simple visual stages using only icons and scenes, without any readable text.`,
    "Style: friendly Japanese ponchi-e style, simple flat illustration, soft pastel colours, calm professional mood, clear composition, generous whitespace.",
    "Important: do not draw any readable text at all. No Japanese characters, no English words, no numbers, no labels, no captions, no logo, no seal, no stamp, no official emblem, no random letters.",
    "The final image is only a decorative background. All accurate Japanese labels and workflow text will be added later by HTML/CSS in the app.",
  ].join(" ");
}

function buildAskRequest(
  question: string,
  auth: AuthState,
  settings: Settings
): AskRequestPayload {
  return {
    question,
    requestedBy: auth.email,
    dataSource: {
      provider: "notion-api",
      notionDatabaseUrl: settings.notionDatabaseUrl,
      requireLatestIfDuplicated: settings.enforceLatestPolicy,
    },
    outputFormat: {
      answer: "string",
      managerGate:
        "{canProceedAlone:string[], needManagerApproval:string[], approvalTiming:string[], managerQuestionTemplate:string}",
      steps: "string[]",
      checklist: "{text,done?}[]",
      imagePrompt: "string",
      imageUrl: "string?",
      references: "string[]",
      updatedAt: "ISO string",
      oldPolicyNote: "string",
    },
    imageGeneration: {
      provider: settings.imageProvider,
      model: settings.imageModel,
    },
    policy: {
      beginnerFriendly: true,
      avoidPersonalDependency: true,
      includeManagerApprovalGate: true,
    },
  };
}

async function localAskMock(requestBody: AskRequestPayload): Promise<AnswerPayload> {
  await new Promise((resolve) => window.setTimeout(resolve, 500));

  return {
    answer: `これは自前APIへ移行するためのローカル確認用テスト回答です。

質問内容：
${requestBody.question}

現在はStackBlitz / Vite の開発画面で動作確認中のため、実際の /api/ask には送信せず、画面内のモック回答を返しています。

この表示が出ていれば、フロント側の流れは成功です。
次の段階で、Vercel Functions の /api/ask と接続します。`,
    managerGate: {
      canProceedAlone: [
        "運用設定の内容を確認する",
        "質問内容と回答内容を読み比べる",
        "手順とチェックリストに沿って、作業メモを作成する",
      ],
      needManagerApproval: [
        "先方へ正式な回答を送る場合",
        "費用、契約、支払期限、キャンセル料に関わる場合",
        "Notionに明記されていない例外対応を判断する場合",
      ],
      approvalTiming: [
        "先方へメールを送る前",
        "金額や日程などを確定する前",
        "自分だけで判断してよいか迷ったとき",
      ],
      managerQuestionTemplate:
        "以下の件について、Notion上では〇〇と理解しました。\n先方へ回答する前に確認させてください。\nこの理解で進めてよろしいでしょうか。",
    },
    steps: [
      "運用設定でQ&A API URLが /api/ask になっていることを確認する",
      "質問画面でテスト質問を送信する",
      "開発環境ではローカルモック回答を表示する",
      "Vercelデプロイ後は /api/ask の本物のAPIに接続する",
    ],
    checklist: [
      { text: "Q&A API URLが /api/ask になっている" },
      { text: "HTTP 404ではなくテスト回答が表示された" },
      { text: "画面に課長確認ゲートが表示された" },
      { text: "画面に手順とチェックリストが表示された" },
    ],
    imagePrompt:
      "Background image only. No text, no letters, no numbers, no labels. Friendly flat illustration showing a university office workflow with documents, email, checklist, and screen display.",
    imageUrl: "",
    references: ["ローカル確認用モック回答"],
    updatedAt: nowIso(),
    oldPolicyNote:
      "この段階ではNotion APIにはまだ接続していません。次のStepでNotion検索を追加します。",
    debug: {
      search: {
        searchTerms: ["ローカル確認"],
        searchQueries: [requestBody.question],
        databasePageCount: 0,
        seedPageCount: 0,
        discoveredPageCount: 0,
        selectedPageCount: 0,
        maxScore: 0,
        minimumScore: 0,
        selectedPages: [],
        sourceCounts: {
          "Local Mock": 0,
        },
      },
    },
  };
}

function assistantFromRaw(question: string, raw: unknown): AnswerPayload {
  return normalizeAnswerPayload(question, raw);
}

function renderSearchDebug(debug?: SearchDebug) {
  if (!debug) return null;

  const searchTerms = Array.isArray(debug.searchTerms) ? debug.searchTerms : [];
  const searchQueries = Array.isArray(debug.searchQueries) ? debug.searchQueries : [];
  const selectedPages = Array.isArray(debug.selectedPages) ? debug.selectedPages : [];
  const sourceCounts = debug.sourceCounts ?? {};
  const errors = Array.isArray(debug.errors) ? debug.errors : [];

  return (
    <details className="debug-panel no-print">
      <summary>検索デバッグ（開発確認用）</summary>

      <div className="debug-content">
        <section className="debug-section">
          <h4>検索サマリー</h4>

          <div className="debug-grid">
            <p className="meta">DBページ数: {debug.databasePageCount ?? 0}</p>
            <p className="meta">候補ページ数: {debug.seedPageCount ?? 0}</p>
            <p className="meta">探索ページ数: {debug.discoveredPageCount ?? 0}</p>
            <p className="meta">採用ページ数: {debug.selectedPageCount ?? 0}</p>
            <p className="meta">最高スコア: {debug.maxScore ?? 0}</p>
            <p className="meta">採用基準: {debug.minimumScore ?? 0}</p>
          </div>
        </section>

        {errors.length > 0 && (
          <section className="debug-section">
            <h4>エラー情報</h4>
            <ol className="compact-list">
              {errors.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ol>
          </section>
        )}

        <section className="debug-section">
          <h4>ナレッジベース別件数</h4>

          {Object.keys(sourceCounts).length > 0 ? (
            <div className="debug-grid">
              {Object.entries(sourceCounts).map(([sourceName, count]) => (
                <p className="meta" key={sourceName}>
                  {sourceName}: {count}
                </p>
              ))}
            </div>
          ) : (
            <p className="meta">ナレッジベース別件数は未取得です。</p>
          )}
        </section>

        <section className="debug-section">
          <h4>検索語</h4>

          {searchTerms.length > 0 ? (
            <div className="tag-row">
              {searchTerms.map((term) => (
                <span className="tag" key={term}>
                  {term}
                </span>
              ))}
            </div>
          ) : (
            <p className="meta">検索語なし</p>
          )}
        </section>

        <section className="debug-section">
          <h4>検索クエリ</h4>

          {searchQueries.length > 0 ? (
            <ol className="compact-list">
              {searchQueries.map((query) => (
                <li key={query}>{query}</li>
              ))}
            </ol>
          ) : (
            <p className="meta">検索クエリなし</p>
          )}
        </section>

        <section className="debug-section">
          <h4>採用されたNotionページ</h4>

          {selectedPages.length > 0 ? (
            <div className="source-card-list">
              {selectedPages.map((page, index) => (
                <article className="source-card" key={`${page.title}-${index}`}>
                  <p className="source-title">
                    {index + 1}. {page.title}
                  </p>

                  <p className="meta">
                    score: {page.score}
                    {page.sourceName ? ` / KB: ${page.sourceName}` : ""}
                    {page.sourceType ? ` / 種別: ${page.sourceType}` : ""}
                    {page.lastEditedTime
                      ? ` / 更新: ${formatDateTime(page.lastEditedTime)}`
                      : ""}
                  </p>

                  {page.url && (
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-link"
                    >
                      Notionページを開く
                    </a>
                  )}

                  <p className="meta source-preview">
                    {page.contentPreview || "本文プレビューなし"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="meta">採用ページなし</p>
          )}
        </section>
      </div>
    </details>
  );
}

function renderHeroCopy() {
  return (
    <div className="brand-row">
      <img
        src="/creotech-logo.png"
        alt="株式会社クレオテック"
        className="brand-logo"
      />

      <div className="brand-copy">
        <p className="hero-kicker">RSJP Manual Assistant</p>
        <h1>RSJP業務マニュアルAI</h1>
        <p>Notionナレッジを参照し、回答・手順・チェックリストを整理します。</p>
      </div>
    </div>
  );
}

function renderWorkflowStrip() {
  return (
    <div className="workflow-strip">
      {WORKFLOW_STEPS.map((step, index) => (
        <div className="workflow-step" key={step}>
          <span>{index + 1}</span>
          <p>{step}</p>
        </div>
      ))}
    </div>
  );
}
function clearMessages() {
  if (messages.length > 0) {
    const ok = window.confirm("過去の質問・回答履歴を削除しますか？");

    if (!ok) return;
  }

  persistMessages([]);
  setError(null);
  setEditTargetId(null);
  setEditedAnswer("");
  setImageErrors({});
  setImageLoadingIds({});
  setGeneratedImageUrls({});
}

function renderManagerGate(managerGate?: ManagerGate) {
  const gate = normalizeManagerGate(managerGate);

  return (
    <section className="answer-section manager-gate-card">
      <div className="section-heading-row">
        <div>
          <h4>課長確認ゲート</h4>
          <p className="manager-gate-lead">
            新人が自分で進めてよい作業と、先方へ回答する前に課長確認が必要な判断を分けて確認します。
          </p>
        </div>
        <span className="section-badge manager-badge">安全確認</span>
      </div>

      <div className="manager-gate-grid">
        <div className="manager-gate-column manager-gate-ok">
          <p className="mini-label">自分で進めてよいこと</p>
          <ul>
            {gate.canProceedAlone.map((item, index) => (
              <li key={`alone-${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="manager-gate-column manager-gate-warning">
          <p className="mini-label">課長確認が必要なこと</p>
          <ul>
            {gate.needManagerApproval.map((item, index) => (
              <li key={`approval-${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="manager-gate-column manager-gate-timing">
          <p className="mini-label">確認するタイミング</p>
          <ul>
            {gate.approvalTiming.map((item, index) => (
              <li key={`timing-${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="manager-template-box">
        <p className="mini-label">課長への確認文例</p>
        <p>{gate.managerQuestionTemplate}</p>
      </div>
    </section>
  );
}

export default function App() {
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [imageLoadingIds, setImageLoadingIds] = useState<Record<string, boolean>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [generatedImageUrls, setGeneratedImageUrls] = useState<Record<string, string>>({});

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessagesFromStorage());
  const [revisions, setRevisions] = useState<RevisionRecord[]>(() => loadRevisionsFromStorage());
  const [settings, setSettings] = useState<Settings>(() => loadSettingsFromStorage());

  const [activeTab, setActiveTab] = useState<"chat" | "ops" | "guide">("chat");
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editedAnswer, setEditedAnswer] = useState("");

  const latestAssistantMessage = useMemo(
    () =>
      messages.find((message) => message.role === "assistant" && message.payload),
    [messages]
  );

  const assistantMessageCount = useMemo(
    () => messages.filter((message) => message.role === "assistant" && message.payload).length,
    [messages]
  );

  const latestQuestionText = useMemo(() => {
    const latestQuestion = messages.find((message) => message.role === "user" && message.rawText);

    return latestQuestion?.rawText ?? "まだ質問はありません。";
  }, [messages]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  function persistMessages(next: ChatMessage[]) {
    const normalized = normalizeChatMessages(next);
    setMessages(normalized);
    safeSetStorage(STORAGE_KEYS.messages, normalized);
  }

  function persistRevisions(next: RevisionRecord[]) {
    const normalized = normalizeRevisionRecords(next);
    setRevisions(normalized);
    safeSetStorage(STORAGE_KEYS.revisions, normalized);
  }

  function persistSettings(next: Settings) {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    safeSetStorage(STORAGE_KEYS.settings, normalized);
  }

  function clearMessages() {
    persistMessages([]);
    setError(null);
    setEditTargetId(null);
    setEditedAnswer("");
    setImageErrors({});
    setImageLoadingIds({});
    setGeneratedImageUrls({});
  }

  function loginAsDemoUser() {
    setError(null);
    setEmail("demo@rsjp.local");
    setPassword("");
    setMessages(loadMessagesFromStorage());
    setAuth({ email: "demo@rsjp.local", token: "local-demo-token" });
  }

  function applySampleQuestion(sample: string) {
    setQuestion(sample);
    setActiveTab("chat");
  }

  function printAnswer() {
    window.print();
  }

  async function login(e: FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError("メールとパスワードを入力してください。");
      return;
    }

    setError(null);

    if (!settings.authWebhookUrl.trim()) {
      setMessages(loadMessagesFromStorage());
      setAuth({ email: email.trim(), token: "local-dev-token" });
      setPassword("");
      return;
    }

    setIsLoggingIn(true);

    try {
      const response = await fetch(settings.authWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error("認証に失敗しました。");

      const data = (await response.json()) as Partial<AuthState>;

      if (!data.email || !data.token) {
        throw new Error("認証レスポンスが不正です。");
      }

      setMessages(loadMessagesFromStorage());
      setAuth({ email: data.email, token: data.token });
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function submitQuestion(e: FormEvent) {
    e.preventDefault();

    if (!auth) {
      setError("ログインしてください。");
      return;
    }

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setError("質問を入力してください。");
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      rawText: trimmedQuestion,
      createdAt: nowIso(),
    };

    setError(null);
    setQuestion("");
    setIsLoading(true);
    persistMessages([userMessage, ...messages]);

    const requestBody = buildAskRequest(trimmedQuestion, auth, settings);

    try {
      let payload: AnswerPayload;

      if (shouldUseLocalMock(settings.qaWebhookUrl)) {
        payload = await localAskMock(requestBody);
      } else {
        const response = await fetch(settings.qaWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`回答取得に失敗しました。${detail}`);
        }

        const raw = await response.json();
        payload = assistantFromRaw(trimmedQuestion, raw);
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        question: trimmedQuestion,
        payload,
        createdAt: nowIso(),
      };

      persistMessages([assistantMessage, userMessage, ...messages]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "回答取得中にエラーが発生しました。");
      persistMessages(messages);
    } finally {
      setIsLoading(false);
    }
  }

  async function generateImageForMessage(message: ChatMessage) {
    if (!message.payload) return;

    if (!ENABLE_IMAGE_GENERATION) {
      setImageErrors((current) => ({
        ...current,
        [message.id]: "画像生成は現在停止中です。必要になった段階で再開できます。",
      }));
      return;
    }

    setImageErrors((current) => ({ ...current, [message.id]: "" }));
    setImageLoadingIds((current) => ({ ...current, [message.id]: true }));

    try {
      const prompt = buildBackgroundImagePrompt(message.payload);

      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          size: "1536x1024",
          quality: "high",
        }),
      });

      const data = (await response.json()) as GenerateImageResponse;

      if (!response.ok || !data.ok || !data.imageUrl) {
        throw new Error(data.error || "画像生成に失敗しました。");
      }

      setGeneratedImageUrls((current) => ({ ...current, [message.id]: data.imageUrl || "" }));
    } catch (err) {
      setImageErrors((current) => ({
        ...current,
        [message.id]: err instanceof Error ? err.message : "画像生成に失敗しました。",
      }));
    } finally {
      setImageLoadingIds((current) => ({ ...current, [message.id]: false }));
    }
  }

  async function saveRevision(message: ChatMessage) {
    if (!message.payload || !editedAnswer.trim()) return;

    const record: RevisionRecord = {
      id: makeId(),
      question: message.question || "",
      originalAnswer: message.payload.answer,
      revisedAnswer: editedAnswer.trim(),
      revisedAt: nowIso(),
      note: "担当者が画面上で回答を修正しました。",
    };

    persistRevisions([record, ...revisions]);

    const updatedMessages = messages.map((item) => {
      if (item.id !== message.id || !item.payload) return item;

      return {
        ...item,
        payload: {
          ...item.payload,
          answer: editedAnswer.trim(),
          oldPolicyNote: `${item.payload.oldPolicyNote || ""}\n\n【担当者修正】${record.note}`,
        },
      };
    });

    persistMessages(updatedMessages);
    setEditTargetId(null);
    setEditedAnswer("");

    if (settings.revisionNotionWebhookUrl.trim()) {
      try {
        await fetch(settings.revisionNotionWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });
      } catch {
        setError("回答修正は保存しましたが、Notion Revision DBへの送信に失敗しました。");
      }
    }
  }

  function renderSlidePreview(payload: AnswerPayload) {
    const steps = payload.steps.slice(0, 6);

    if (steps.length === 0) return null;

    return (
      <div className="slide-preview-card">
        <div className="slide-preview-header">
          <h5>1枚スライド用 図解プレビュー</h5>
          <p>
            正確な日本語はHTML/CSSで表示しています。背景画像を生成する場合も、日本語文字は画像に描かせません。
          </p>
        </div>

        <div className="slide-flow-row">
          {steps.map((step, index) => (
            <div className="slide-step-wrap" key={`${step}-${index}`}>
              <div className="slide-step-card">
                <span className="slide-step-number">{index + 1}</span>
                <p className="slide-step-title">{makeSlideLabel(step, index)}</p>
              </div>
              {index < steps.length - 1 && <span className="slide-arrow">→</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderGeneratedImage(message: ChatMessage) {
    if (!message.payload) return null;

    const url = generatedImageUrls[message.id] || message.payload.imageUrl || "";
    const isGenerating = Boolean(imageLoadingIds[message.id]);
    const imageError = imageErrors[message.id];

    return (
      <section className="answer-section image-section no-print">
        <div className="section-heading-row">
          <div>
            <h4>図解フロー・背景画像</h4>
            <p className="meta">
              現在は画像生成を停止中です。必要になれば、ここから再開できます。
            </p>
          </div>
          <span className="section-badge">停止中</span>
        </div>

        {renderSlidePreview(message.payload)}

        <div className="generated-image-box">
          <button type="button" onClick={() => generateImageForMessage(message)} disabled={isGenerating}>
            {isGenerating ? "生成中..." : "図解背景画像を生成"}
          </button>

          {imageError && <p className="error">{imageError}</p>}

          {url && (
            <div className="generated-image-preview">
              <img src={url} alt="AI generated workflow background" />
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderAssistant(message: ChatMessage) {
    if (!message.payload) return null;

    const payload = message.payload;

    return (
      <article className="answer-card">
        <div className="answer-toolbar no-print">
          <button type="button" onClick={printAnswer}>
            印刷
          </button>
        </div>

        <section className="answer-section answer-section-main">
          <div className="section-heading-row">
            <div>
              <h3>回答</h3>
              <p className="meta">
                質問：{message.question || "不明"} / 更新確認：{formatDateTime(payload.updatedAt)}
              </p>
            </div>
            <span className="section-badge">回答</span>
          </div>
          <p className="answer-text">{payload.answer}</p>
        </section>

        {renderManagerGate(payload.managerGate)}

        <section className="answer-section">
          <div className="section-heading-row">
            <h4>手順</h4>
            <span className="section-badge">Step</span>
          </div>
          <ol className="step-list">
            {payload.steps.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="answer-section">
          <div className="section-heading-row">
            <h4>チェックリスト</h4>
            <span className="section-badge">Check</span>
          </div>
          <ul className="checklist">
            {payload.checklist.map((item, index) => (
              <li key={`${item.text}-${index}`}>
                <input type="checkbox" defaultChecked={item.done} />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {renderGeneratedImage(message)}

        <section className="answer-section">
          <h4>参照元</h4>
          <ul className="compact-list">
            {(payload.references || []).map((reference, index) => (
              <li key={`${reference}-${index}`}>{reference}</li>
            ))}
          </ul>
        </section>

        <section className="answer-section no-print">
          <h4>最新情報ポリシー</h4>
          <p className="meta">{payload.oldPolicyNote}</p>
        </section>

        {renderSearchDebug(payload.debug?.search)}

        <section className="revision-panel pro-revision-panel no-print">
          <h2>回答修正</h2>
          <p className="meta">
            回答を修正した場合、履歴として保存し、必要に応じてNotion Revision DBへ送信します。
          </p>

          {editTargetId === message.id ? (
            <div className="edit-box">
              <textarea
                value={editedAnswer}
                onChange={(event) => setEditedAnswer(event.target.value)}
                rows={8}
              />
              <div className="edit-actions">
                <button type="button" className="primary" onClick={() => saveRevision(message)}>
                  修正を保存
                </button>
                <button type="button" onClick={() => setEditTargetId(null)}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditTargetId(message.id);
                setEditedAnswer(payload.answer);
              }}
            >
              この回答を修正する
            </button>
          )}
        </section>
      </article>
    );
  }

  if (!auth) {
    return (
      <div className="app-shell pro-shell">
        <header className="top-header app-hero">
          <div className="hero-copy">{renderHeroCopy()}</div>
          <div className="hero-actions">
            <span className="status-pill">Internal Manual</span>
          </div>
        </header>

        <main className="login-modern-layout">
          <section className="product-panel">
            <p className="product-kicker">For RSJP / RWJP Operations</p>
            <h2>新人が迷わず動ける、業務ナビとしてのマニュアルAI</h2>
            <p className="product-lead">
              Notionの業務マニュアルを検索し、回答、作業手順、チェックリスト、課長確認ゲートをまとめて表示します。
            </p>

            <div className="product-badge-row">
              <span>Notion API</span>
              <span>Manager Gate</span>
              <span>Print Ready</span>
            </div>

            {renderWorkflowStrip()}

            <div className="feature-grid">
              {LOGIN_FEATURES.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <span className="feature-icon">{feature.icon}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>

            <div className="metric-row">
              {LOGIN_STATS.map((stat) => (
                <article className="metric-card" key={stat.label}>
                  <p>{stat.label}</p>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </div>
          </section>

          <aside className="login-stack">
            <section className="login-panel pro-login-card">
              <div className="login-card-header">
                <div>
                  <h2>ログイン</h2>
                  <p className="meta">担当者用の確認画面です。</p>
                </div>
                <span className="login-card-status">Secure</span>
              </div>

              <form onSubmit={login} className="question-form">
                <label>
                  メール
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                </label>

                <label>
                  パスワード
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                  />
                </label>

                <button className="primary" type="submit" disabled={isLoading}>
                {isLoading ? "検索・回答生成中..." : "質問する"}
              </button>

              <button type="button" onClick={clearMessages} disabled={isLoading || messages.length === 0}>
                過去の質問履歴を削除
              </button>
            </form>

              {error && <p className="error">{error}</p>}

              <p className="meta login-help-text">
                認証Webhook未設定時は、ローカル開発用ログインとして動作します。
              </p>
            </section>

            <section className="next-action-card">
              <h2>このアプリでできること</h2>
              <ul className="next-action-list">
                <li>
                  <span>01</span>
                  <p>業務マニュアルの該当箇所を確認する</p>
                </li>
                <li>
                  <span>02</span>
                  <p>新人向けの作業手順として整理する</p>
                </li>
                <li>
                  <span>03</span>
                  <p>課長確認が必要な判断を明確にする</p>
                </li>
              </ul>
            </section>
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell pro-shell">
      <header className="top-header app-hero no-print">
        <div className="hero-copy">{renderHeroCopy()}</div>
        <div className="hero-actions">
          <span className="status-pill date-pill">{formatHeaderDateTime(currentDateTime)}</span>
          <button type="button" onClick={() => setAuth(null)}>
            ログアウト
          </button>
        </div>
      </header>

      <section className="dashboard-overview no-print">
        <article className="overview-card overview-card-wide">
          <span>Latest Question</span>
          <strong>{latestQuestionText}</strong>
        </article>
        <article className="overview-card">
          <span>Answers</span>
          <strong>{assistantMessageCount}</strong>
        </article>
        <article className="overview-card">
          <span>Latest Update</span>
          <strong>
            {latestAssistantMessage?.payload?.updatedAt
              ? formatDateTime(latestAssistantMessage.payload.updatedAt)
              : "未取得"}
          </strong>
        </article>
        <article className="overview-card">
          <span>User</span>
          <strong>{auth.email}</strong>
        </article>
      </section>

      <nav className="tab-row pro-tab-row no-print">
        <button
          type="button"
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
        >
          質問
        </button>
        <button
          type="button"
          className={activeTab === "ops" ? "active" : ""}
          onClick={() => setActiveTab("ops")}
        >
          運用設定
        </button>
        <button
          type="button"
          className={activeTab === "guide" ? "active" : ""}
          onClick={() => setActiveTab("guide")}
        >
          使い方
        </button>
      </nav>

      {activeTab === "chat" && (
        <main className="chat-layout pro-chat-layout">
          <aside className="left-panel pro-side-panel no-print">
            <div className="side-panel-header">
              <div>
                <h2>質問する</h2>
                <p className="meta">Main Manual Databaseの内容に基づいて回答します。</p>
              </div>
            </div>

            <form onSubmit={submitQuestion} className="question-form">
              <label>
                質問
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={8}
                  placeholder="例：大型バスの発注方法を、見積依頼から請求書処理まで順番に教えてください。"
                />
              </label>

              <button className="primary" type="submit" disabled={isLoading}>
                {isLoading ? "検索・回答生成中..." : "質問する"}
              </button>
            </form>

            {isLoading && (
              <div className="side-loading-note">
                <span className="mini-spinner" />
                Main Manual Databaseを確認中です。
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <section className="quick-question-panel">
              <h2>サンプル質問</h2>
              <div className="quick-question-list">
                {QUICK_SAMPLE_QUESTIONS.map((sample) => (
                  <button type="button" key={sample} onClick={() => applySampleQuestion(sample)}>
                    {sample}
                  </button>
                ))}
              </div>
            </section>

            <section className="revision-panel pro-revision-panel">
              <h2>回答修正履歴</h2>
              {revisions.length === 0 ? (
                <p className="meta">まだ修正履歴はありません。</p>
              ) : (
                <ol className="compact-list">
                  {revisions.slice(0, 5).map((revision) => (
                    <li key={revision.id}>
                      {formatDateTime(revision.revisedAt)} / {revision.question}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>

          <section className="timeline pro-timeline">
            {isLoading && renderLoadingCard()}

            {messages.length === 0 && !isLoading ? (
              <div className="empty-state pro-empty-state">
                <h2>まだ質問はありません</h2>
                <p>
                  左の入力欄から業務に関する質問を入力してください。回答・手順・チェックリスト・課長確認ゲートをまとめて表示します。
                </p>
                <div className="empty-sample-grid">
                  {QUICK_SAMPLE_QUESTIONS.map((sample) => (
                    <button type="button" key={sample} onClick={() => applySampleQuestion(sample)}>
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div className="bubble user no-print" key={message.id}>
                      <p className="bubble-label">質問 / {formatDateTime(message.createdAt)}</p>
                      <p className="question-text">{message.rawText}</p>
                    </div>
                  );
                }

                return (
                  <div className="bubble assistant" key={message.id}>
                    {renderAssistant(message)}
                  </div>
                );
              })
            )}
          </section>
        </main>
      )}

      {activeTab === "ops" && (
        <section className="ops-panel">
          <h2>運用設定</h2>
          <p className="meta">
            まずは /api/ask を使う設定にしています。Notion DBとOpenAI APIはVercel Functions側で接続します。
          </p>

          <label>
            Q&A API URL
            <input
              value={settings.qaWebhookUrl}
              onChange={(event) =>
                persistSettings({ ...settings, qaWebhookUrl: event.target.value })
              }
            />
          </label>

          <label>
            認証Webhook URL
            <input
              value={settings.authWebhookUrl}
              onChange={(event) =>
                persistSettings({ ...settings, authWebhookUrl: event.target.value })
              }
            />
          </label>

          <label>
            NotionマニュアルDB URL
            <input
              value={settings.notionDatabaseUrl}
              onChange={(event) =>
                persistSettings({ ...settings, notionDatabaseUrl: event.target.value })
              }
            />
          </label>

          <label>
            回答修正送信用Webhook URL
            <input
              value={settings.revisionNotionWebhookUrl}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  revisionNotionWebhookUrl: event.target.value,
                })
              }
            />
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={settings.enforceLatestPolicy}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  enforceLatestPolicy: event.target.checked,
                })
              }
            />
            同名ページがある場合は最新更新版を優先する
          </label>

          <button type="button" onClick={clearMessages}>
            回答履歴をクリア
          </button>
        </section>
      )}

      {activeTab === "guide" && (
        <section className="guide-panel">
          <h2>使い方</h2>
          <p>
            RSJP業務マニュアルAIは、Notion上のマニュアルを参照し、新人職員が動きやすい形に整理するための補助ツールです。
          </p>

          <h3>基本の流れ</h3>
          <ol>
            <li>質問画面で、業務について具体的に質問します。</li>
            <li>AIがMain Manual Databaseを検索します。</li>
            <li>回答、手順、チェックリスト、課長確認ゲートを確認します。</li>
            <li>必要に応じて印刷し、新人説明や引き継ぎ資料として使います。</li>
            <li>必要に応じて回答修正を保存し、Notion Revision DBへ反映します。</li>
          </ol>

          <h3>この実装で固定した方針</h3>

          <ul>
            <li>NotionはAPI連携で取得（スクレイピング前提にしない）。</li>
            <li>新人が単独で進めてよい作業と、課長確認が必要な判断を分けて表示する。</li>
            <li>費用・契約・受入可否・例外対応・個人情報などは、先方回答前の確認対象にする。</li>
            <li>画像生成UIは現在停止中。将来再開できるようコードは残す。</li>
            <li>正確な日本語ラベル・手順・注意点はHTML/CSSで表示する。</li>
            <li>印刷時は操作ボタンや開発用情報を非表示にし、回答本文を中心に出力する。</li>
            <li>修正回答はNotion DBへ直接追記。</li>
            <li>社内利用の認証方式はメール/パスワード。</li>
          </ul>
        </section>
      )}
    </div>
  );
}