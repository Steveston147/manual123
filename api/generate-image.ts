 // FILE: api/generate-image.ts
 // PATH: api/generate-image.ts
 
 type GenerateImageRequest = {
    imagePrompt?: string;
    prompt?: string;
    model?: string;
    size?: string;
    quality?: string;
  };
  
  type OpenAIImageResponse = {
    created?: number;
    data?: Array<{
      b64_json?: string;
      url?: string;
    }>;
    error?: {
      message?: string;
      type?: string;
      code?: string;
    };
  };
  
  function setCorsHeaders(res: any) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  
  async function readJsonBody(req: any): Promise<GenerateImageRequest> {
    if (req.body && typeof req.body === "object") {
      return req.body as GenerateImageRequest;
    }
  
    if (req.body && typeof req.body === "string") {
      try {
        return JSON.parse(req.body) as GenerateImageRequest;
      } catch {
        return {};
      }
    }
  
    const chunks: Uint8Array[] = [];
  
    for await (const chunk of req) {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      } else {
        chunks.push(chunk);
      }
    }
  
    const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
  
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
  
    const rawBody = new TextDecoder().decode(merged);
  
    if (!rawBody.trim()) {
      return {};
    }
  
    try {
      return JSON.parse(rawBody) as GenerateImageRequest;
    } catch {
      return {};
    }
  }
  
  function buildFinalPrompt(imagePrompt: string) {
    return `以下の内容をもとに、社内業務マニュアル用の1枚図解画像を作成してください。
  
  目的:
  新人職員や業務に不慣れな職員が、次に何をすればよいか一目で分かるようにする。
  
  画像の条件:
  - 16:9の横長
  - 日本語ラベル
  - 白背景
  - 青系の落ち着いたアクセント
  - 業務フロー図として見やすい構成
  - 大きめの文字
  - 小さすぎる文字は使わない
  - アイコン、矢印、番号を使う
  - 社内資料として使える落ち着いた見た目
  - 写真風ではなく、清潔なビジネス図解
  - 個人名や機密情報は入れない
  
  図解内容:
  ${imagePrompt}`;
  }
  
  export default async function handler(req: any, res: any) {
    setCorsHeaders(res);
  
    if (req.method === "OPTIONS") {
      return res.status(200).json({ ok: true });
    }
  
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "POSTメソッドでリクエストしてください。",
      });
    }
  
    const apiKey = process.env.OPENAI_API_KEY;
  
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY がVercel環境変数に設定されていません。",
      });
    }
  
    try {
      const body = await readJsonBody(req);
      const imagePrompt = (body.imagePrompt || body.prompt || "").trim();
  
      if (!imagePrompt) {
        return res.status(400).json({
          ok: false,
          error: "imagePrompt が空です。",
        });
      }
  
      const model = (
        body.model ||
        process.env.OPENAI_IMAGE_MODEL ||
        "gpt-image-1"
      ).trim();
  
      const size = (body.size || "1536x1024").trim();
      const quality = (body.quality || "medium").trim();
      const finalPrompt = buildFinalPrompt(imagePrompt);
  
      const openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: finalPrompt,
          size,
          quality,
          n: 1,
          output_format: "png",
        }),
      });
  
      const result = (await openaiResponse.json()) as OpenAIImageResponse;
  
      if (!openaiResponse.ok) {
        return res.status(openaiResponse.status).json({
          ok: false,
          error:
            result.error?.message ||
            `OpenAI Images APIでエラーが発生しました。HTTP ${openaiResponse.status}`,
          details: result.error ?? result,
        });
      }
  
      const firstImage = result.data?.[0];
  
      if (!firstImage?.b64_json && !firstImage?.url) {
        return res.status(500).json({
          ok: false,
          error: "画像データがOpenAIから返りませんでした。",
          details: result,
        });
      }
  
      const imageUrl = firstImage.b64_json
        ? `data:image/png;base64,${firstImage.b64_json}`
        : firstImage.url;
  
      return res.status(200).json({
        ok: true,
        imageUrl,
        b64Json: firstImage.b64_json ?? null,
        sourceUrl: firstImage.url ?? null,
        model,
        size,
        quality,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "画像生成APIで不明なエラーが発生しました。",
      });
    }
  }