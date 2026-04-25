# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
# RSJP Manual AI

RSJPの新人向け業務マニュアルをWeb上で質問できる、Notion API連携前提のWebアプリです。

## 固定仕様（今回確定）

- ナレッジ取得: **Notion API連携**
- 画像生成: **ChatGPT API (`gpt-image-1`)**
- 回答修正の保存先: **Notion DBへ直接追記**
- 社内認証: **メール / パスワード**

## この実装でできること

- 質問すると、**回答本文 / ステップ / チェックリスト / 図解用プロンプト**を同時表示
- 認証Webhook経由でメールPWログイン（未設定時はローカル開発ログイン）
- 回答修正を保存し、Notion Revision DB追記Webhookへ送信
- 「更新日が新しいページを採用」ポリシーをフロントから明示設定

## 画面構成

- ログイン画面: メール/パスワード
- 質問画面: 業務質問、回答閲覧、回答修正
- 運用設定: Webhook / Notion DB設定、修正履歴
- 使い方: 新人向け手順、運用方針

## 推奨バックエンド（n8n）

1. 認証Webhook（メールPW検証、JWT発行）
2. Notion APIでデータ収集（ページ本文、画像、表、DB項目、更新日）
3. 重複判定（同一テーマは `last_edited_time` 最大を採用）
4. RAG検索（質問と関連ページ抽出）
5. 回答生成（JSON固定フォーマット）
6. ChatGPT API画像生成（`gpt-image-1`）
7. 回答返却
8. 回答修正WebhookでNotion Revision DBへ追記

### 想定レスポンス

```json
{
  "answer": "文章回答",
  "steps": ["手順1", "手順2"],
  "checklist": [{ "text": "確認項目" }],
  "imagePrompt": "1枚スライド用の指示",
  "imageUrl": "https://...",
  "references": ["NotionページA"],
  "updatedAt": "2026-04-25T00:00:00.000Z",
  "oldPolicyNote": "過去運用との差分"
}
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'
## 起動

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```bash
npm install
npm run dev