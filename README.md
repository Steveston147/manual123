<!-- FILE: README.md -->
<!-- PATH: /README.md -->

# RSJP Manual AI Stable v1.1

RSJP Manual AI は、RSJP 業務マニュアルを参照し、短期受入プログラム業務に関する質問へ回答するための業務支援アプリです。

新人担当者や引継ぎ担当者が、業務判断・手順確認・注意点確認をしやすくすることを目的としています。

---

## 1. このアプリの位置づけ

この repository は、RSJP Manual AI の安定版として管理します。

現在の運用方針は以下のとおりです。

- Main Manual Database 専用アプリとして運用する
- 複数の Notion Database を同時参照しない
- FAQ や短期プログラム全般の Q&A は、このアプリには追加しない
- 別用途のナレッジベースは、別 repository / 別 Vercel project の派生アプリとして作成する
- 回答精度と業務判断の安定性を優先する

---

## 2. 主な目的

- RSJP 業務マニュアルの内容をもとに、担当者の質問に回答する
- 新人・異動者・応援者が迷いやすい業務を整理する
- 手順、確認事項、注意点を分かりやすく表示する
- 危ない判断や例外対応では、課長確認が必要であることを明示する
- 担当者が修正した回答を、承認済み回答として蓄積する
- 次回以降、類似質問では承認済み回答を優先して参照する

---

## 3. 現在できていること

- 業務質問の入力
- Notion Main Manual Database の参照
- AI による回答生成
- 回答本文の表示
- 手順の表示
- チェックリストの表示
- 課長確認が必要な可能性の表示
- 回答修正機能
- 承認済み回答DBへの保存
- 保存前確認UI
- 承認済み回答DBの優先参照
- 承認済み回答カードの表示
- 検索中・回答生成中の表示
- 印刷しやすい画面構成

---

## 4. 主な技術構成

- Frontend: React / TypeScript / Vite
- Hosting: Vercel
- Serverless Functions: Vercel Functions
- Knowledge Base: Notion API
- AI Response: OpenAI API
- Data Storage: Notion Database
- Styling: CSS

---

## 5. 主なファイル

- `src/App.tsx`
  - アプリ本体
  - ログイン画面、質問画面、回答表示、回答修正、保存前確認UIなど

- `src/App.css`
  - 画面デザイン
  - ローディング表示、回答カード、印刷表示など

- `api/ask.ts`
  - Notion DB検索
  - 承認済み回答DB検索
  - AI回答生成
  - 回答形式の制御

- `api/save-approved-answer.ts`
  - 修正済み回答を Notion Approved Answer Database に保存

- `api/notion-test.ts`
  - Notion API接続確認用

- `api/generate-image.ts`
  - 画像生成関連の試作・補助機能
  - 現在の中心機能ではない

---

## 6. 使用する Notion Database

### Main Manual Database

RSJP業務マニュアルの主たる参照元です。

このアプリでは、基本的にこの Database を中心に回答を生成します。

### RSJP Approved Answer Database

スタッフが修正・確認した回答を保存するための Database です。

次回以降、類似する質問があった場合は、Main Manual Database よりも承認済み回答を優先して表示します。

---

## 7. 承認済み回答DBの考え方

このアプリでは、AIに自動学習させるのではなく、人が確認・修正した回答を Notion に保存し、次回以降の回答品質を高めます。

運用の流れは以下のとおりです。

1. 担当者が質問する
2. AIがMain Manual Databaseを参照して回答する
3. 担当者が必要に応じて回答を修正する
4. 保存前確認画面で内容を確認する
5. 承認済み回答DBへ保存する
6. 次回以降、類似質問では承認済み回答を優先表示する

---

## 8. 課長確認ゲート

以下のような内容では、担当者だけで判断せず、課長確認が必要であることを表示します。

- 参加資格に関わる判断
- 費用・返金・キャンセルに関わる判断
- ビザ・在留資格に関わる判断
- 成績・修了証明・単位に関わる判断
- 例外対応
- 学生の個人情報に関わる対応
- 大学間合意・契約に関わる対応
- マニュアル上の記載が曖昧な場合

---

## 9. 運用ルール

- このアプリは Main Manual Database 専用として運用する
- RSJP FAQ や ShortTermPrograms QA など、別用途の Database は追加しない
- 別用途のAIアプリは、この repository をコピーして別 repository として作成する
- 修正時は、現在動いている実ファイルを確認してから作業する
- 推測でファイルを修正しない
- 本番 Vercel に接続されているため、安易に main branch を変更しない
- 大きな変更を行う場合は、事前に変更内容を整理する

---

## 10. 派生アプリの予定

### RSJP FAQ AI

RSJP / RWJP に関するFAQを参照し、問い合わせ回答、メール案、注意点を整理するアプリ。

想定用途:

- 海外大学からの問い合わせ対応
- 学生からの問い合わせ対応
- 参加資格、費用、宿泊、ビザ、提出書類、送迎等のFAQ対応
- 英文メール案の作成

### ShortTermPrograms QA AI

短期受入プログラム全般のQ&Aを参照し、実務判断、確認先、手順を整理するアプリ。

想定用途:

- 短期受入プログラム全般の業務判断
- 準備・運用・費用・宿泊・保険・参加条件の確認
- 担当者の判断補助
- 課長確認が必要な点の整理

---

## 11. 今後の改良予定

- READMEと実装内容の継続的な整理
- 承認済み回答の検索精度向上
- 回答履歴の見やすさ改善
- 印刷表示の改善
- 参照元表示の改善
- FAQ AIへの派生
- ShortTermPrograms QA AIへの派生
- 業務フロー別の質問テンプレート追加
- 課長確認が必要な判断の分類強化

---

## 12. 開発・修正時の注意

この repository は、本番環境と接続されている可能性があります。

修正時は以下を守ります。

- まず現在のファイル内容を確認する
- 思い込みで修正しない
- 必要な場合は全文置換で安全に差し替える
- `src/App.tsx`、`src/App.css`、`api/ask.ts`、`api/save-approved-answer.ts` は特に慎重に扱う
- 環境変数の値は README やコードに書かない
- APIキーや Notion Token は絶対に公開しない

---

## 13. ローカル起動

```bash
npm install
npm run dev
