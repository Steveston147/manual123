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

function fallbackPayload(message: string): AnswerPayload {
  return {
    answer: message,
    steps: [
      "VercelのEnvironment Variablesを確認する",
      "api/ask.tsの内容を確認する",
      "GitHubへcommit / pushする",
      "Vercelで再デプロイする",
      "もう一度質問を送信する",
    ],
    checklist: [
      { text: "OPENAI_API_KEYが設定されている" },
      { text: "OPENAI_MODELが設定されている" },
      { text: "Vercelの最新デプロイが成功している" },
    ],
    imagePrompt:
      "16:9横長スライド。日本語ラベル。API接続エラー時の確認手順を、Vercel、Environment Variables、OpenAI API、再デプロイの流れで示すシンプルな業務フロー図。白背景、青系アクセント、大きな文字、矢印とアイコンを使う。",
    imageUrl: "",
    references: ["OpenAI API接続確認"],
    updatedAt: new Date().toISOString(),
    oldPolicyNote:
      "この段階ではNotion APIにはまだ接続していないため、過去運用との差分確認は未実施です。",
  };
}

function normalizePayload(question: string, data: Partial<AnswerPayload>): AnswerPayload {
  const now = new Date().toISOString();

  return {
    answer:
      typeof data.answer === "string" && data.answer.trim()
        ? data.answer
        : `「${question}」について回答を生成しましたが、answerが空でした。`,
    steps:
      Array.isArray(data.steps) && data.steps.length > 0
        ? data.steps
        : ["質問内容を確認する", "最新の業務ルールを確認する", "必要な手続きを進める"],
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
        : ["OpenAI API生成回答"],
    updatedAt:
      typeof data.updatedAt === "string" && data.updatedAt.trim()
        ? data.updatedAt
        : now,
    oldPolicyNote:
      typeof data.oldPolicyNote === "string" && data.oldPolicyNote.trim()
        ? data.oldPolicyNote
        : "この段階ではNotion APIにはまだ接続していないため、過去運用との差分確認は未実施です。",
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

async function callOpenAI(question: string, requestedBy: string): Promise<AnswerPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  if (!apiKey) {
    return fallbackPayload(
      "OPENAI_API_KEY がVercelの環境変数に設定されていません。VercelのEnvironment Variablesに OPENAI_API_KEY を追加し、再デプロイしてください。"
    );
  }

  const prompt = `
あなたはRSJP業務マニュアルAIです。
社内業務を、初めて担当する職員にも分かるように説明してください。

質問者:
${requestedBy || "unknown"}

質問:
${question}

回答条件:
- 日本語で回答する
- 初心者向けに、やさしく具体的に説明する
- ただし、断定しすぎない
- 担当者個人に依存した表現を避ける
- 必要に応じて「最新の学内ルール・担当部署の指示を確認してください」と入れる
- この段階ではNotion API未接続のため、参照元は「OpenAI API生成回答」とする
- 画像そのものは生成しない
- imagePromptには、1枚スライド画像を作るための具体的なプロンプトを書く
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

${raw.slice(0, 1000)}

OPENAI_MODELに指定したモデルが使えない場合は、Vercelの環境変数 OPENAI_MODEL を利用可能なモデル名に変更して、再デプロイしてください。`
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
    return normalizePayload(question, parsed);
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

  const answerPayload = await callOpenAI(question, requestedBy);

  return response.status(200).json(answerPayload);
}