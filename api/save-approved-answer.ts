// FILE: api/save-approved-answer.ts
// PATH: api/save-approved-answer.ts

declare const process: {
    env: Record<string, string | undefined>;
  };
  
  export const config = {
    maxDuration: 30,
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
  
  type SaveApprovedAnswerRequest = {
    question?: string;
    originalAnswer?: string;
    revisedAnswer?: string;
    note?: string;
    revisedBy?: string;
    approvedBy?: string;
    relatedManual?: string;
    status?: "Draft" | "Review" | "Approved" | "Rejected" | string;
    approved?: boolean;
  };
  
  const NOTION_VERSION = "2022-06-28";
  const MAX_RICH_TEXT_CHUNK_LENGTH = 1800;
  
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
        name: "RSJP Approved Answer Save API",
        endpoint: "/api/save-approved-answer",
        message: "API Function is available. Please send POST data.",
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
  
    const notionApiKey = getEnv("NOTION_API_KEY");
    const approvedAnswerDatabaseId = getEnv("NOTION_APPROVED_ANSWER_DATABASE_ID");
  
    if (!notionApiKey) {
      sendJson(res, 500, {
        ok: false,
        error: "NOTION_API_KEY がVercel環境変数に設定されていません。",
      });
      return;
    }
  
    if (!approvedAnswerDatabaseId) {
      sendJson(res, 500, {
        ok: false,
        error:
          "NOTION_APPROVED_ANSWER_DATABASE_ID がVercel環境変数に設定されていません。",
      });
      return;
    }
  
    const body = parseBody(req.body) as SaveApprovedAnswerRequest | null;
  
    const question = normalizeString(body?.question);
    const revisedAnswer = normalizeString(body?.revisedAnswer);
    const originalAnswer = normalizeString(body?.originalAnswer);
    const note = normalizeString(body?.note);
    const revisedBy = normalizeString(body?.revisedBy);
    const approvedBy = normalizeString(body?.approvedBy);
    const relatedManual = normalizeString(body?.relatedManual);
  
    const status = normalizeStatus(body?.status);
    const approved =
      typeof body?.approved === "boolean" ? body.approved : status === "Approved";
  
    if (!question) {
      sendJson(res, 400, {
        ok: false,
        error: "Question が空です。",
      });
      return;
    }
  
    if (!revisedAnswer) {
      sendJson(res, 400, {
        ok: false,
        error: "Revised Answer が空です。",
      });
      return;
    }
  
    try {
      const notionResult = await createApprovedAnswerPage({
        databaseId: approvedAnswerDatabaseId,
        question,
        originalAnswer,
        revisedAnswer,
        note,
        revisedBy,
        approvedBy,
        relatedManual,
        status,
        approved,
      });
  
      sendJson(res, 200, {
        ok: true,
        message: "修正済み回答をNotionへ保存しました。",
        notionPageId: notionResult.id,
        notionUrl: notionResult.url,
        status,
        approved,
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Notionへの保存中に不明なエラーが発生しました。",
      });
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
  
  function parseBody(body: unknown): Record<string, unknown> | null {
    if (!body) {
      return null;
    }
  
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
  
    if (typeof body === "object") {
      return body as Record<string, unknown>;
    }
  
    return null;
  }
  
  function getEnv(name: string): string {
    return process.env[name]?.trim() || "";
  }
  
  function cleanNotionId(value: string): string {
    return value.replace(/-/g, "").trim();
  }
  
  function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }
  
  function normalizeStatus(value: unknown): string {
    const status = normalizeString(value);
  
    if (["Draft", "Review", "Approved", "Rejected"].includes(status)) {
      return status;
    }
  
    return "Review";
  }
  
  function makeRichText(value: string): Array<{
    type: "text";
    text: {
      content: string;
    };
  }> {
    const text = value.trim();
  
    if (!text) {
      return [];
    }
  
    const chunks: string[] = [];
  
    for (let index = 0; index < text.length; index += MAX_RICH_TEXT_CHUNK_LENGTH) {
      chunks.push(text.slice(index, index + MAX_RICH_TEXT_CHUNK_LENGTH));
    }
  
    return chunks.map((chunk) => ({
      type: "text",
      text: {
        content: chunk,
      },
    }));
  }
  
  function makeTitle(value: string): Array<{
    type: "text";
    text: {
      content: string;
    };
  }> {
    const title = value.trim().slice(0, MAX_RICH_TEXT_CHUNK_LENGTH);
  
    return [
      {
        type: "text",
        text: {
          content: title || "Untitled Question",
        },
      },
    ];
  }
  
  async function createApprovedAnswerPage(params: {
    databaseId: string;
    question: string;
    originalAnswer: string;
    revisedAnswer: string;
    note: string;
    revisedBy: string;
    approvedBy: string;
    relatedManual: string;
    status: string;
    approved: boolean;
  }): Promise<{
    id: string;
    url?: string;
  }> {
    const properties: Record<string, unknown> = {
      Question: {
        title: makeTitle(params.question),
      },
      "Revised Answer": {
        rich_text: makeRichText(params.revisedAnswer),
      },
      "Original Answer": {
        rich_text: makeRichText(params.originalAnswer),
      },
      Status: {
        multi_select: [
          {
            name: params.status,
          },
        ],
      },
      Approved: {
        checkbox: params.approved,
      },
      Note: {
        rich_text: makeRichText(params.note),
      },
      "Revised By": {
        rich_text: makeRichText(params.revisedBy),
      },
      "Approved By": {
        rich_text: makeRichText(params.approvedBy),
      },
      "Related Manual": {
        rich_text: makeRichText(params.relatedManual),
      },
      "Updated At": {
        date: {
          start: new Date().toISOString(),
        },
      },
    };
  
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getEnv("NOTION_API_KEY")}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        parent: {
          database_id: cleanNotionId(params.databaseId),
        },
        properties,
      }),
    });
  
    const result = (await response.json()) as {
      id?: string;
      url?: string;
      message?: string;
      code?: string;
      object?: string;
    };
  
    if (!response.ok) {
      throw new Error(
        result.message ||
          `Notion APIで保存エラーが発生しました。HTTP ${response.status}`
      );
    }
  
    return {
      id: result.id || "",
      url: result.url,
    };
  }