---
name: release-check
description: >-
  Talklate4u のコミット・リリース前チェック手順。フォーマット、Lint、型チェック、
  Vitest 単体テスト、CHANGELOG.md 更新、非公開辞書データの混入チェックを一括で確認する。
---

# Release Check (Talklate4u)

コミットやリリース前の品質確認を以下の手順で実行する。

## 1. 変更内容と OSS ポリシーの確認

- `git status` と `git diff --stat` で変更ファイルを確認する。
- **OSS ポリシー**: 非公開・個人用の辞書 TSV/ZIP ファイルがステージングや作業ツリーに含まれていないことを確認する。

## 2. フォーマット・Lint・型チェック・単体テスト

以下を順に実行し、すべてエラーゼロで通過することを確認する：

```powershell
npm run format
npm run lint
npx tsc --noEmit -p .
npm run test:unit
```

- テストや Lint が失敗した場合は、原因を修正してから再実行する。

## 3. CHANGELOG.md の確認

- `CHANGELOG.md` の `## [Unreleased]` セクションに、今回の変更内容が Keep a Changelog 形式で記載されていることを確認する。
- 未記載の場合は、コミット前に追記する。

## 4. コミット & プッシュ安全ルール

- 変更内容が揃ったら、ユーザーに差分サマリーとコミットメッセージ案を提示する。
- **`git push` はユーザーから明示的な指示があった場合のみ実行する。**
