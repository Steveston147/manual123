// FILE: ask.ts
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

export default function handler(request: ApiRequest, response: ApiResponse) {
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
  const now = new Date().toISOString();

  return response.status(200).json({
    answer: `これはVercel Functions の /api/ask から返しているテスト回答です。

質問内容：
${question}

この表示が出ていれば、フロント画面から自前APIへの接続は成功です。
現段階では、Notion APIやOpenAI APIにはまだ接続していません。
次のStepでOpenAI API、さらにその次でNotion APIを接続します。`,
    steps: [
      "React画面から質問を送信する",
      "/api/ask が質問を受け取る",
      "Vercel Functions が固定JSONを返す",
      "画面に回答・手順・チェックリスト・図解プロンプトが表示されることを確認する",
    ],
    checklist: [
      { text: "Q&A API URLが /api/ask になっている" },
      { text: "Vercelにデプロイできている" },
      { text: "画面に『Vercel Functions の /api/ask』と表示された" },
    ],
    imagePrompt:
      "16:9横長スライド。日本語ラベル。左から順に「質問入力」→「/api/ask」→「Vercel Functions」→「回答JSON」→「画面表示」の流れを青系アクセントのシンプルな業務フロー図で表現。白背景、大きな文字、初心者向け、アイコンと矢印を使う。",
    imageUrl: "",
    references: ["Vercel Functions テストレスポンス"],
    updatedAt: now,
    oldPolicyNote:
      "この段階ではNotionの過去運用との差分確認はまだ行っていません。Step 4以降でNotion APIに接続します。",
  });
}