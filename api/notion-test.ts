// FILE: notion-test.ts
// PATH: api/notion-test.ts

type ApiRequest = {
    method?: string;
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
  
      if (property?.type === "rich_text") {
        const text = extractPlainText(property.rich_text);
        if (text) return text;
      }
    }
  
    return "タイトル未取得";
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
  
  export default async function handler(request: ApiRequest, response: ApiResponse) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
  
    if (request.method !== "GET" && request.method !== "POST") {
      return response.status(405).json({
        ok: false,
        message: "GETまたはPOSTでアクセスしてください。",
      });
    }
  
    const databaseId = process.env.NOTION_DATABASE_ID;
  
    if (!databaseId) {
      return response.status(500).json({
        ok: false,
        message:
          "NOTION_DATABASE_ID がVercelのEnvironment Variablesに設定されていません。",
      });
    }
  
    try {
      const notionResponse = await notionRequest(`/v1/databases/${databaseId}/query`, {
        method: "POST",
        body: JSON.stringify({
          page_size: 10,
        }),
      });
  
      const rawText = await notionResponse.text();
  
      if (!notionResponse.ok) {
        return response.status(500).json({
          ok: false,
          message: "Notion APIへの接続に失敗しました。",
          status: notionResponse.status,
          detail: rawText.slice(0, 1200),
          hint:
            "404の場合は、Database IDが正しいか、Notion DBをRSJP Manual AIインテグレーションに共有しているか確認してください。",
        });
      }
  
      const data = JSON.parse(rawText) as {
        results?: NotionPage[];
        has_more?: boolean;
        next_cursor?: string | null;
      };
  
      const pages = (data.results ?? []).map((page) => ({
        id: page.id,
        title: extractPageTitle(page),
        lastEditedTime: page.last_edited_time,
        url: page.url,
      }));
  
      return response.status(200).json({
        ok: true,
        message: "Notion API接続テストに成功しました。",
        databaseId,
        count: pages.length,
        hasMore: data.has_more ?? false,
        pages,
        nextStep:
          "この結果が表示されれば、次はapi/ask.tsにNotion検索を組み込みます。",
      });
    } catch (error) {
      return response.status(500).json({
        ok: false,
        message: "Notion接続テスト中にエラーが発生しました。",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }