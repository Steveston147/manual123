// FILE: src/App.tsx
// PATH: src/App.tsx
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type ChecklistItem = {
  text: string;
  done?: boolean;
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
  imageUrl?: string;
  references?: string[];
  updatedAt?: string;
  oldPolicyNote?: string;
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
  };
};

function nowIso() {
  return new Date().toISOString();
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
    steps: [
      "運用設定でQ&A API URLが /api/ask になっていることを確認する",
      "質問画面でテスト質問を送信する",
      "開発環境ではローカルモック回答を表示する",
      "Vercelデプロイ後は /api/ask の本物のAPIに接続する",
    ],
    checklist: [
      { text: "Q&A API URLが /api/ask になっている" },
      { text: "HTTP 404ではなくテスト回答が表示された" },
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
      },
    },
  };
}

function assistantFromRaw(question: string, raw: unknown): AnswerPayload {
  if (typeof raw === "string") {
    return {
      answer: raw,
      steps: ["回答本文を確認し、不足部分を追質問してください。"],
      checklist: [
        { text: "回答に具体的な作業手順がある" },
        { text: "担当者依存の表現がない" },
      ],
      imagePrompt:
        "Background image only. No text, no letters, no numbers, no labels. Friendly flat illustration for an administrative workflow manual.",
      references: ["Notion API 最新ページ", "社内ルール"],
      updatedAt: nowIso(),
      oldPolicyNote:
        "過去版との差分情報は取得できませんでした。必要なら更新日を指定して再質問してください。",
    };
  }

  const anyData = raw as Partial<AnswerPayload> & { text?: string };

  return {
    answer:
      anyData.answer ??
      anyData.text ??
      `「${question}」への回答データが不足していたため、再実行してください。`,
    steps:
      anyData.steps && anyData.steps.length > 0
        ? anyData.steps
        : [
            "質問の目的を確認する",
            "Notion APIで最新更新日を確認する",
            "業務手順を順番に実行する",
          ],
    checklist:
      anyData.checklist && anyData.checklist.length > 0
        ? anyData.checklist
        : [{ text: "対象手順を最後まで実施した" }, { text: "記録を保存した" }],
    imagePrompt:
      anyData.imagePrompt ??
      "Background image only. No text, no letters, no numbers, no labels. Friendly flat illustration for an administrative workflow manual.",
    imageUrl: anyData.imageUrl,
    references: anyData.references ?? ["Notion API 最新版"],
    updatedAt: anyData.updatedAt ?? nowIso(),
    oldPolicyNote:
      anyData.oldPolicyNote ??
      "過去運用との差分は、更新履歴の要約を確認してください。",
    debug: anyData.debug,
  };
}

function renderSearchDebug(debug?: SearchDebug) {
  if (!debug) return null;

  return (
    <details className="debug-panel no-print">
      <summary>検索デバッグ（開発確認用）</summary>

      <div className="debug-content">
        <section className="debug-section">
          <h4>検索サマリー</h4>

          <div className="debug-grid">
            <p className="meta">DBページ数: {debug.databasePageCount}</p>
            <p className="meta">候補ページ数: {debug.seedPageCount}</p>
            <p className="meta">探索ページ数: {debug.discoveredPageCount}</p>
            <p className="meta">採用ページ数: {debug.selectedPageCount}</p>
            <p className="meta">最高スコア: {debug.maxScore}</p>
            <p className="meta">採用基準: {debug.minimumScore}</p>
          </div>
        </section>

        <section className="debug-section">
          <h4>検索語</h4>

          {debug.searchTerms.length > 0 ? (
            <div className="tag-row">
              {debug.searchTerms.map((term) => (
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

          {debug.searchQueries.length > 0 ? (
            <ol className="compact-list">
              {debug.searchQueries.map((query) => (
                <li key={query}>{query}</li>
              ))}
            </ol>
          ) : (
            <p className="meta">検索クエリなし</p>
          )}
        </section>

        <section className="debug-section">
          <h4>採用されたNotionページ</h4>

          {debug.selectedPages.length > 0 ? (
            <div className="source-card-list">
              {debug.selectedPages.map((page, index) => (
                <article className="source-card" key={`${page.title}-${index}`}>
                  <p className="source-title">
                    {index + 1}. {page.title}
                  </p>

                  <p className="meta">
                    score: {page.score}
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

export default function App() {
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoadingIds, setImageLoadingIds] = useState<Record<string, boolean>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [generatedImageUrls, setGeneratedImageUrls] = useState<Record<string, string>>({});

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    safeParse<ChatMessage[]>(localStorage.getItem(STORAGE_KEYS.messages), [])
  );

  const [revisions, setRevisions] = useState<RevisionRecord[]>(() =>
    safeParse<RevisionRecord[]>(localStorage.getItem(STORAGE_KEYS.revisions), [])
  );

  const [settings, setSettings] = useState<Settings>(() =>
    safeParse<Settings>(localStorage.getItem(STORAGE_KEYS.settings), DEFAULT_SETTINGS)
  );

  const [activeTab, setActiveTab] = useState<"chat" | "ops" | "guide">("chat");
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editedAnswer, setEditedAnswer] = useState("");

  const latestAssistantMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.payload),
    [messages]
  );

  function persistMessages(next: ChatMessage[]) {
    setMessages(next);
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(next));
  }

  function persistRevisions(next: RevisionRecord[]) {
    setRevisions(next);
    localStorage.setItem(STORAGE_KEYS.revisions, JSON.stringify(next));
  }

  function persistSettings(next: Settings) {
    setSettings(next);
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
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
    setAuth({ email: "demo@rsjp.local", token: "local-demo-token" });
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
      setAuth({ email: email.trim(), token: "local-dev-token" });
      setPassword("");
      return;
    }

    setIsLoggingIn(true);

    try {
      const response = await fetch(settings.authWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      let parsed: { token?: string } = {};

      try {
        parsed = JSON.parse(text) as { token?: string };
      } catch {
        // plain text response fallback
      }

      setAuth({
        email: email.trim(),
        token: parsed.token ?? "token-from-auth-webhook",
      });
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function submitQuestion(e: FormEvent) {
    e.preventDefault();

    const trimmed = question.trim();

    if (!trimmed || isLoading || !auth) return;

    setError(null);
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      rawText: trimmed,
      createdAt: nowIso(),
    };

    const pendingAssistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      question: trimmed,
      payload: {
        answer: "回答を生成中です…",
        steps: [],
        checklist: [],
        imagePrompt: "",
      },
      createdAt: nowIso(),
    };

    const base = [...messages, userMessage, pendingAssistant];

    persistMessages(base);
    setQuestion("");

    const requestBody = buildAskRequest(trimmed, auth, settings);

    try {
      let nextPayload: AnswerPayload;

      if (shouldUseLocalMock(settings.qaWebhookUrl)) {
        nextPayload = await localAskMock(requestBody);
      } else {
        const response = await fetch(settings.qaWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify(requestBody),
        });

        const rawText = await response.text();

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 200)}`);
        }

        let parsed: unknown = rawText;

        try {
          parsed = JSON.parse(rawText);
        } catch {
          // plain text fallback
        }

        nextPayload = assistantFromRaw(trimmed, parsed);
      }

      persistMessages(
        base.map((message) =>
          message.id === pendingAssistant.id
            ? { ...message, payload: nextPayload }
            : message
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラーです。");

      persistMessages(
        base.map((message) =>
          message.id === pendingAssistant.id
            ? {
                ...message,
                payload: {
                  answer:
                    "回答取得に失敗しました。送信先URL、API実行状態、またはCORS設定を確認してください。",
                  steps: [
                    "運用設定のQ&A API URLを確認する",
                    "開発中は /api/ask を指定する",
                    "Vercelデプロイ後は /api/ask の本物のAPIが動くか確認する",
                    "再度同じ質問で実行する",
                  ],
                  checklist: [{ text: "接続設定を確認した" }],
                  imagePrompt: "",
                },
              }
            : message
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function generateImage(messageId: string, payload: AnswerPayload) {
    if (!auth) return;

    const imagePrompt = buildBackgroundImagePrompt(payload).trim();

    if (!imagePrompt) {
      setImageErrors((current) => ({
        ...current,
        [messageId]: "背景画像プロンプトが空のため、画像を生成できません。",
      }));
      return;
    }

    setImageLoadingIds((current) => ({ ...current, [messageId]: true }));
    setImageErrors((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          imagePrompt,
          model: settings.imageModel,
          size: "1536x1024",
          quality: "medium",
        }),
      });

      const parsed = (await response.json()) as GenerateImageResponse;

      if (!response.ok || !parsed.ok || !parsed.imageUrl) {
        throw new Error(
          parsed.error ||
            `画像生成に失敗しました。HTTP ${response.status}`
        );
      }

      setGeneratedImageUrls((current) => ({
        ...current,
        [messageId]: parsed.imageUrl!,
      }));
    } catch (err) {
      setImageErrors((current) => ({
        ...current,
        [messageId]:
          err instanceof Error
            ? err.message
            : "画像生成で不明なエラーが発生しました。",
      }));
    } finally {
      setImageLoadingIds((current) => ({ ...current, [messageId]: false }));
    }
  }

  async function saveRevision() {
    if (!editTargetId || !editedAnswer.trim() || !auth) return;

    if (
      !settings.revisionNotionWebhookUrl.trim() ||
      !settings.notionRevisionDatabaseId.trim()
    ) {
      setError("Notion追記用API URLとRevision DB IDを設定してください。");
      return;
    }

    const target = messages.find((message) => message.id === editTargetId);

    if (!target?.payload || !target.question) return;

    const record: RevisionRecord = {
      id: crypto.randomUUID(),
      question: target.question,
      originalAnswer: target.payload.answer,
      revisedAnswer: editedAnswer.trim(),
      revisedAt: nowIso(),
      note: "ユーザーが画面上で回答を修正",
    };

    persistRevisions([record, ...revisions]);

    persistMessages(
      messages.map((message) =>
        message.id === editTargetId
          ? {
              ...message,
              payload: {
                ...message.payload!,
                answer: editedAnswer.trim(),
                updatedAt: nowIso(),
              },
            }
          : message
      )
    );

    try {
      await fetch(settings.revisionNotionWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          destination: {
            provider: "notion-api",
            databaseId: settings.notionRevisionDatabaseId,
          },
          revisedBy: auth.email,
          ...record,
        }),
      });
    } catch {
      setError("Notion追記に失敗しました。API実行ログを確認してください。");
    }

    setEditTargetId(null);
    setEditedAnswer("");
  }

  function renderLoadingCard() {
    return (
      <div className="loading-card" aria-live="polite">
        <div className="loading-header">
          <div className="loading-spinner" />
          <div>
            <p className="loading-title">生成中です</p>
            <p className="loading-subtitle">Notionを確認しながら回答を組み立てています。もう少しお待ちください。</p>
          </div>
        </div>
        <div className="loading-progress">
          <span />
        </div>
        <div className="loading-steps">
          <span>検索</span>
          <span>整理</span>
          <span>回答作成</span>
        </div>
      </div>
    );
  }

  function renderSlidePreview(payload: AnswerPayload) {
    const slideSteps = payload.steps.slice(0, 6);
    const slideNotes = payload.checklist.slice(0, 3).map((item) => item.text);

    return (
      <div className="slide-preview-card">
        <div className="slide-preview-header">
          <p className="mini-label">文字崩れ対策版</p>
          <h5>業務フロー図解</h5>
          <p>
            図解の正確な日本語は、画像生成AIではなくこの画面上のHTML/CSSで表示します。
          </p>
        </div>

        <div className="slide-flow-row">
          {slideSteps.length > 0 ? (
            slideSteps.map((step, index) => (
              <div className="slide-step-wrap" key={`${step}-${index}`}>
                <div className="slide-step-card">
                  <span className="slide-step-number">{index + 1}</span>
                  <p className="slide-step-title">{makeSlideLabel(step, index)}</p>
                </div>

                {index < slideSteps.length - 1 && (
                  <span className="slide-arrow">→</span>
                )}
              </div>
            ))
          ) : (
            <p className="meta">手順が生成されると、ここに図解カードを表示します。</p>
          )}
        </div>

        {slideSteps.length > 0 && (
          <div className="slide-detail-list">
            <p className="mini-label">ステップ詳細</p>

            {slideSteps.map((step, index) => (
              <div className="slide-detail-item" key={`detail-${step}-${index}`}>
                <span className="slide-detail-number">{index + 1}</span>
                <p className="slide-detail-text">{stripListPrefixForUi(step)}</p>
              </div>
            ))}
          </div>
        )}

        {slideNotes.length > 0 && (
          <div className="slide-note-box">
            <p className="mini-label">注意点</p>
            <ul>
              {slideNotes.map((note, index) => (
                <li key={`${note}-${index}`}>{stripListPrefixForUi(note)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  function renderAssistant(messageId: string, payload: AnswerPayload) {
    const isGeneratingImage = Boolean(imageLoadingIds[messageId]);
    const imageError = imageErrors[messageId];
    const displayImageUrl = generatedImageUrls[messageId] || payload.imageUrl;
    const backgroundPrompt = buildBackgroundImagePrompt(payload);
    const isPendingAnswer = payload.answer === "回答を生成中です…" && payload.steps.length === 0;

    if (isPendingAnswer) {
      return renderLoadingCard();
    }

    return (
      <article className="answer-card printable-answer">
        <div className="answer-toolbar no-print">
          <button type="button" onClick={printAnswer}>
            この回答を印刷
          </button>
        </div>

        <section className="answer-section answer-section-main">
          <div className="section-heading-row">
            <h3>回答（初心者向け）</h3>
            <span className="section-badge">まず読む</span>
          </div>

          <p className="answer-text">{payload.answer}</p>
        </section>

        <section className="answer-section">
          <div className="section-heading-row">
            <h4>手順（この順番で実施）</h4>
            <span className="section-badge">実行順</span>
          </div>

          {payload.steps.length > 0 ? (
            <ol className="step-list">
              {payload.steps.map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="meta">手順はまだ生成中です。</p>
          )}
        </section>

        <section className="answer-section">
          <div className="section-heading-row">
            <h4>チェックリスト</h4>
            <span className="section-badge">抜け漏れ確認</span>
          </div>

          {payload.checklist.length > 0 ? (
            <ul className="checklist">
              {payload.checklist.map((item, index) => (
                <li key={`${item.text}-${index}`}>
                  <input type="checkbox" checked={Boolean(item.done)} readOnly />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">チェックリストはまだ生成中です。</p>
          )}
        </section>

        <section className="answer-section image-section">
          <div className="section-heading-row">
            <h4>1枚スライド用の図解</h4>
            <span className="section-badge">文字はUI表示</span>
          </div>

          {renderSlidePreview(payload)}

          <details className="image-prompt-box no-print">
            <summary>背景画像プロンプト（画像生成に使う内容）</summary>
            <p>{backgroundPrompt}</p>
          </details>

          {payload.imagePrompt && (
            <details className="debug-panel raw-prompt-panel no-print">
              <summary>AIが返した元の図解プロンプト（参考・画像生成には使いません）</summary>
              <p className="meta">{payload.imagePrompt}</p>
            </details>
          )}

          <div className="generated-image-box no-print">
            <button
              type="button"
              className="primary"
              onClick={() => void generateImage(messageId, payload)}
              disabled={isGeneratingImage || !backgroundPrompt.trim()}
            >
              {isGeneratingImage
                ? "背景画像を生成中..."
                : displayImageUrl
                  ? "背景画像を再生成"
                  : "背景画像を生成"}
            </button>
          </div>

          {isGeneratingImage && (
            <div className="mini-loading-row no-print">
              <span className="mini-spinner" />
              <span>背景画像を生成しています。少し時間がかかります。</span>
            </div>
          )}

          {imageError && <p className="error no-print">{imageError}</p>}

          {displayImageUrl ? (
            <div className="generated-image-box">
              <a
                href={displayImageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-link no-print"
              >
                画像を開く
              </a>

              <img
                src={displayImageUrl}
                alt="生成された背景画像"
                className="generated-image"
              />
            </div>
          ) : (
            <div className="image-empty-box no-print">
              <p className="image-empty-title">背景画像はまだ生成されていません。</p>
              <p className="meta">
                日本語は上の図解カードで表示します。画像生成は背景・雰囲気用です。
              </p>
            </div>
          )}
        </section>

        <section className="answer-section">
          <div className="section-heading-row">
            <h4>最新情報ポリシー</h4>
            <span className="section-badge">確認用</span>
          </div>

          <div className="info-grid">
            <div>
              <p className="mini-label">最新更新日時</p>
              <p className="meta">{formatDateTime(payload.updatedAt)}</p>
            </div>

            <div>
              <p className="mini-label">過去運用メモ</p>
              <p className="meta">{payload.oldPolicyNote ?? "未取得"}</p>
            </div>
          </div>
        </section>

        {payload.references && payload.references.length > 0 && (
          <section className="answer-section">
            <div className="section-heading-row">
              <h4>参照元</h4>
              <span className="section-badge">根拠</span>
            </div>

            <ul className="reference-list">
              {payload.references.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
          </section>
        )}

        {renderSearchDebug(payload.debug?.search)}
      </article>
    );
  }

  if (!auth) {
    return (
      <div className="app-shell">
        <header className="top-header app-hero">
          <div className="hero-copy">{renderHeroCopy()}</div>
        </header>

        <section className="left-panel login-panel">
          <h2>ログイン</h2>

          <form onSubmit={login} className="question-form">
            <label>
              メールアドレス
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
              />
            </label>

            <label>
              パスワード
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
            </label>

            <button className="primary" type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? "ログイン中..." : "ログイン"}
            </button>

            <button type="button" onClick={loginAsDemoUser}>
              デモユーザーでログイン
            </button>

            {error && <p className="error">{error}</p>}
          </form>

          <p className="meta">
            認証API未設定時はローカル開発モードとしてログインできます。
          </p>

          <section className="revision-panel">
            <h2>次にやること</h2>

            <ol>
              <li>デモユーザーでログインして画面の動きを確認します。</li>
              <li>運用設定でQ&A API URLを確認します。</li>
              <li>NotionナレッジDB URLを確認します。</li>
              <li>質問画面でテスト質問を送信します。</li>
              <li>回答修正機能はRevision API設定後に確認します。</li>
            </ol>
          </section>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-header app-hero no-print">
        <div className="hero-copy">{renderHeroCopy()}</div>

        <div className="hero-actions">
          <span className="status-pill">Ready</span>
          <button
            type="button"
            onClick={() => {
              setAuth(null);
              setPassword("");
              setError(null);
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      <nav className="tab-row no-print">
        <button
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
        >
          質問画面
        </button>

        <button
          className={activeTab === "ops" ? "active" : ""}
          onClick={() => setActiveTab("ops")}
        >
          運用設定
        </button>

        <button
          className={activeTab === "guide" ? "active" : ""}
          onClick={() => setActiveTab("guide")}
        >
          使い方
        </button>
      </nav>

      {activeTab === "chat" && (
        <section className="chat-layout">
          <aside className="left-panel no-print">
            <form onSubmit={submitQuestion} className="question-form">
              <label htmlFor="question">質問</label>

              <textarea
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="例）大型バスの発注方法を、見積依頼から請求書処理まで順番に教えてください。"
                rows={6}
              />

              <button
                type="submit"
                className="primary"
                disabled={isLoading || question.trim().length === 0}
              >
                {isLoading ? "生成中..." : "回答を生成"}
              </button>

              {isLoading && (
                <div className="side-loading-note">
                  <span className="mini-spinner" />
                  <span>生成中です。回答欄に進行表示が出ています。</span>
                </div>
              )}

              <p className="meta">
                現在の送信先: <strong>{settings.qaWebhookUrl || "未設定"}</strong>
              </p>

              {shouldUseLocalMock(settings.qaWebhookUrl) && (
                <p className="meta">
                  開発画面では /api/ask をローカル確認用モックとして動かします。
                </p>
              )}

              <button type="button" onClick={clearMessages}>
                履歴をクリア
              </button>

              {error && <p className="error">{error}</p>}
            </form>

            <section className="revision-panel">
              <h2>回答修正（Notion DBへ直接追記）</h2>
              <p>
                最新回答を編集し、修正履歴をNotion Revision DBに保存します。
              </p>

              <button
                type="button"
                onClick={() => {
                  if (!latestAssistantMessage?.payload) return;

                  setEditTargetId(latestAssistantMessage.id);
                  setEditedAnswer(latestAssistantMessage.payload.answer);
                }}
                disabled={!latestAssistantMessage?.payload}
              >
                最新回答を編集
              </button>

              {editTargetId && (
                <div className="edit-box">
                  <textarea
                    rows={6}
                    value={editedAnswer}
                    onChange={(event) => setEditedAnswer(event.target.value)}
                  />

                  <div className="edit-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void saveRevision()}
                    >
                      修正を保存
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditTargetId(null);
                        setEditedAnswer("");
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </section>
          </aside>

          <main className="timeline print-area">
            {messages.length === 0 && (
              <div className="empty-state">
                <h2>まずは業務を1つ質問してください</h2>
                <p>
                  例：大型バスの発注方法を、見積依頼から請求書処理まで順番に教えてください。
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div className={`bubble ${message.role}`} key={message.id}>
                <p className="bubble-label">
                  {message.role === "user" ? "質問" : "回答"} /{" "}
                  {formatDateTime(message.createdAt)}
                </p>

                {message.role === "user" ? (
                  <p className="question-text">{message.rawText}</p>
                ) : (
                  message.payload && renderAssistant(message.id, message.payload)
                )}
              </div>
            ))}
          </main>
        </section>
      )}

      {activeTab === "ops" && (
        <section className="ops-panel">
          <h2>運用設定</h2>

          <label>
            認証 API URL（メール/パスワード認証）
            <input
              value={settings.authWebhookUrl}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  authWebhookUrl: event.target.value,
                })
              }
            />
          </label>

          <label>
            Q&A API URL
            <input
              value={settings.qaWebhookUrl}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  qaWebhookUrl: event.target.value,
                })
              }
            />
          </label>

          <label>
            Notion Revision追記 API URL
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

          <label>
            NotionナレッジDB URL
            <input
              value={settings.notionDatabaseUrl}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  notionDatabaseUrl: event.target.value,
                })
              }
            />
          </label>

          <label>
            Notion Revision DB ID
            <input
              value={settings.notionRevisionDatabaseId}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  notionRevisionDatabaseId: event.target.value,
                })
              }
            />
          </label>

          <label>
            画像モデル（ChatGPT API）
            <input
              value={settings.imageModel}
              onChange={(event) =>
                persistSettings({
                  ...settings,
                  imageModel: event.target.value,
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
            更新日が新しいページを優先採用する
          </label>

          <h3>修正履歴（直近10件）</h3>

          <ul className="revision-list">
            {revisions.slice(0, 10).map((item) => (
              <li key={item.id}>
                <strong>{formatDateTime(item.revisedAt)}</strong>
                <p>Q: {item.question}</p>
                <p>修正: {item.revisedAnswer}</p>
              </li>
            ))}

            {revisions.length === 0 && <li>履歴なし</li>}
          </ul>
        </section>
      )}

      {activeTab === "guide" && (
        <section className="guide-panel">
          <h2>使い方（新人向け）</h2>

          <ol>
            <li>メール/パスワードでログインします。</li>
            <li>「質問画面」で業務内容を1つだけ入力します。</li>
            <li>回答に表示された「手順」を上から順番に実施します。</li>
            <li>作業後に「チェックリスト」で抜け漏れを確認します。</li>
            <li>必要に応じて回答修正を保存し、Notion Revision DBへ反映します。</li>
          </ol>

          <h3>この実装で固定した方針</h3>

          <ul>
            <li>NotionはAPI連携で取得（スクレイピング前提にしない）。</li>
            <li>画像生成AIには文字を描かせず、背景画像だけを生成する。</li>
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
