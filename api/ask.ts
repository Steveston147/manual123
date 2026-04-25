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

type AnswerPayload = {
  answer: string;
  steps: string[];
  checklist: ChecklistItem[];
  imagePrompt: string;
  imageUrl: string;
  references: string[];
  updatedAt: string;
  oldPolicyNote: string;
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

type NotionContextPage = {
  id: string;
  title: string;
  url?: string;
  lastEditedTime?: string;
  content: string;
  score: number;
};

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

  if (type === "divider") {
    return "---";
  }

  if (type === "to_do") {
    const checked = value.checked ? "[x]" : "[ ]";
    return `${checked} ${extractPlainText(value.rich_text)}`;
  }

  if (Array.isArray(value.rich_text)) {
    return extractPlainText(value.rich_text);
  }

  if (Array.isArray(value.caption)) {
    return extractPlainText(value.caption);
  }

  return "";
}

function buildSearchTerms(question: string): string[] {
  const cleaned = question
    .replace(/[、。！？!?,.()[\]【】「」『』]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const roughTerms = cleaned
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const importantTerms = [
    "バス",
    "大型バス",
    "発注",
    "申請",
    "支払",
    "経理",
    "請求",
    "見積",
    "ホテル",
    "宿舎",
    "参加者",
    "募集",
    "フォーム",
    "Convera",
    "COUPA",
    "精算",
    "報告",
    "ガイド",
    "講師",
    "謝金",
  ].filter((term) => question.includes(term));

  return Array.from(new Set([...importantTerms, ...roughTerms]));
}

function scorePage(question: string, page: NotionContextPage): number {
  const terms = buildSearchTerms(question);
  const title = page.title.toLowerCase();
  const content = page.content.toLowerCase();
  const q = question.toLowerCase();

  let score = 0;

  if (title.includes(q)) score += 20;
  if (content.includes(q)) score += 12;

  for (const term of terms) {
    const t = term.toLowerCase();

    if (title.includes(t)) score += 8;
    if (content.includes(t)) score += 3;
  }

  if (page.lastEditedTime) {
    score += 0.5;
  }

  return score;
}

function fallbackPayload(message: string): AnswerPayload {
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
      "16:9横長スライド。日本語ラベル。Notion API接続エラー時の確認手順を、Vercel、Environment Variables、Notion共有設定、再デプロイの流れで示すシンプルな業務フロー図。白背景、青系アクセント、大きな文字、矢印とアイコンを使う。",
    imageUrl: "",
    references: ["Notion / OpenAI API接続確認"],
    updatedAt: new Date().toISOString(),
    oldPolicyNote:
      "Notion APIまたはOpenAI APIの接続確認中のため、過去運用との差分確認は未実施です。",
  };
}

function normalizePayload(
  question: string,
  data: Partial<AnswerPayload>,
  references: string[]
): AnswerPayload {
  const now = new Date().toISOString();

  return {
    answer:
      typeof data.answer === "string" && data.answer.trim()
        ? data.answer
        : `「${question}」について回答を生成しましたが、answerが空でした。`,
    steps:
      Array.isArray(data.steps) && data.steps.length > 0
        ? data.steps
        : ["質問内容を確認する", "Notion上の関連ページを確認する", "必要な手続きを進める"],
    checklist:
      Array.isArray(data.checklist) && data.checklist.length > 0
        ? data.checklist.map((item) => ({
            text: typeof item.text === "string" ? item.text : String(item),
          }))
        : [{ text: "回答内容を確認した" }, { text: "必要な次の作業を確認した" }],
    imagePrompt:
      typeof data.imagePrompt === "string" && data.imagePrompt.trim()
        ? data.imagePrompt
        : "16:9横長スライド。日本語ラベル。業務手順を初心者向けに説明するシンプルな1枚スライド。白背景、青系アクセント、大きな文字、矢印とアイコンを使う。",
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    references:
      Array.isArray(data.references) && data.references.length > 0
        ? data.references
        : references.length > 0
          ? references
          : ["Notion検索結果"],
    updatedAt:
      typeof data.updatedAt === "string" && data.updatedAt.trim()
        ? data.updatedAt
        : now,
    oldPolicyNote:
      typeof data.oldPolicyNote === "string" && data.oldPolicyNote.trim()
        ? data.oldPolicyNote
        : "Notionの関連ページを参照しています。過去運用との差分は、Notion上の更新日と内容を確認してください。",
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

async function getBlockChildren(blockId: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < 3; i += 1) {
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

async function getPageContent(pageId: string): Promise<string> {
  const blocks = await getBlockChildren(pageId);
  const lines: string[] = [];

  for (const block of blocks) {
    const text = extractBlockText(block);

    if (text) {
      lines.push(text);
    }

    if (block?.has_children && lines.join("\n").length < 2500) {
      const children = await getBlockChildren(block.id);

      for (const child of children) {
        const childText = extractBlockText(child);

        if (childText) {
          lines.push(`- ${childText}`);
        }

        if (lines.join("\n").length >= 2500) {
          break;
        }
      }
    }

    if (lines.join("\n").length >= 2500) {
      break;
    }
  }

  return lines.join("\n").slice(0, 2500);
}

async function getNotionContext(question: string): Promise<NotionContextPage[]> {
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!databaseId) {
    throw new Error("NOTION_DATABASE_ID is not set.");
  }

  const response = await notionRequest(`/v1/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 25,
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Notion database query failed: HTTP ${response.status} ${rawText.slice(0, 800)}`);
  }

  const data = JSON.parse(rawText) as {
    results?: NotionPage[];
  };

  const pages = data.results ?? [];
  const contextPages: NotionContextPage[] = [];

  for (const page of pages.slice(0, 18)) {
    const title = extractPageTitle(page);
    const content = await getPageContent(page.id);

    const contextPage: NotionContextPage = {
      id: page.id,
      title,
      url: page.url,
      lastEditedTime: page.last_edited_time,
      content,
      score: 0,
    };

    contextPage.score = scorePage(question, contextPage);
    contextPages.push(contextPage);
  }

  return contextPages
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildContextText(pages: NotionContextPage[]): string {
  if (pages.length === 0) {
    return "Notionから関連ページを取得できませんでした。";
  }

  return pages
    .map((page, index) => {
      return `【参照${index + 1}】
タイトル: ${page.title}
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
  contextPages: NotionContextPage[]
): Promise<AnswerPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  if (!apiKey) {
    return fallbackPayload(
      "OPENAI_API_KEY がVercelの環境変数に設定されていません。VercelのEnvironment Variablesに OPENAI_API_KEY を追加し、再デプロイしてください。"
    );
  }

  const contextText = buildContextText(contextPages);
  const referenceTitles = contextPages.map((page) => page.title).filter(Boolean);

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
- Notionマニュアル情報に書かれている内容を優先する
- Notionマニュアル情報にない内容は推測で断定しない
- 情報が不足している場合は「Notion上では確認できませんでした」と明記する
- 担当者個人に依存した表現を避ける
- 必要に応じて「最新の学内ルール・担当部署の指示を確認してください」と入れる
- referencesには実際に使ったNotionページタイトルを入れる
- imageUrlは空文字にする
- imagePromptには、1枚スライド画像を作るための具体的な日本語プロンプトを書く
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

${raw.slice(0, 1000)}`
    );
  }

  let responseJson: any;

  try {
    responseJson = JSON.parse(raw);
  } catch {
    return fallbackPayload(
      `OpenAI APIからJSONではない応答が返りました。

${raw.slice(0, 1000)}`
    );
  }

  const outputText = extractOutputText(responseJson);

  if (!outputText) {
    return fallbackPayload(
      `OpenAI APIの応答から本文を取り出せませんでした。

${raw.slice(0, 1000)}`
    );
  }

  try {
    const parsed = JSON.parse(outputText) as Partial<AnswerPayload>;
    return normalizePayload(question, parsed, referenceTitles);
  } catch {
    return fallbackPayload(
      `OpenAI APIの応答をJSONとして読み取れませんでした。

${outputText.slice(0, 1000)}`
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
    const contextPages = await getNotionContext(question);
    const answerPayload = await callOpenAI(question, requestedBy, contextPages);

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