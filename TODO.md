# 残タスク / Backlog

要求仕様書（`要求仕様書.md`）・企画書（`企画書.md`）と実装の差分。
分類は **マイルストーン（リリース単位）× 優先度ラベル（`P0..P3`）** の2軸。進捗トラッカーは
GitHub の各マイルストーンページ。`(FR/NFR/§)` は要求仕様書の参照。

実装済み: FR-1〜FR-10 と主要 NFR。未達は主に「仕様で必須のテスト（§10）」と「リリース運用（M3/M4）」。

---

## マイルストーン `v1.0.0`（要求仕様書 §11 DoD・期日 2026-09-15）

### Issue 化済み（詳細は各 Issue / 進捗は milestone を参照）

| # | 概要 | 優先度 | 参照 |
|---|---|---|---|
| [#1](https://github.com/yk-lab/setup-task/issues/1) | `[security]` `repo-token` を `core.setSecret` で秘匿 | `P1: high` | NFR-1 |
| [#2](https://github.com/yk-lab/setup-task/issues/2) | `[test]` `withRetry` のユニットテスト | `P1: high` | §10.1 |
| [#3](https://github.com/yk-lab/setup-task/issues/3) | `[test]` `fetchJson` content-type ガードのテスト | `P1: high` | §10.1 / 企画 §1.1-3 |
| [#4](https://github.com/yk-lab/setup-task/issues/4) | `[test]` checksum 改ざん注入の self-test | `P1: high` | §10.3 |
| [#5](https://github.com/yk-lab/setup-task/issues/5) | `[test]` cache-hit 経路の self-test | `P2: medium` | §10.2 |

### 未 Issue 化（リリース運用 / M3・M4）

- **リリース自動化 + `v1` ムービングタグ + Marketplace 公開**（`release`）
  タグ push 時に `dist/` を検証して Release 発行 → `v1` を追従 → Marketplace 掲載。DoD §11 必須。
- **ローカルコードを `yk-lab/setup-task` へ push（remote 設定）**（`chore`）
  現状 remote 未設定・リモートは空。`git remote add origin … && git push` で CI/self-test が初回実行。

---

## マイルストーン `Backlog`（任意 / 将来・仕様上 optional）

- **フォールバックソース（FR-11）** — npm `@go-task/cli` 等の代替取得元。v1 必須ではない。
- **ジョブサマリ出力（NFR-5・任意）** — `core.summary` に解決版/取得元/cache/検証結果を記録。
- **リトライ回数の input 化（FR-4「必要なら」）** — `DEFAULT_RETRIES`/`DEFAULT_RETRY_BASE_MS`（`src/constants.ts`）を input 化。
- **`platform.test.ts` を §9 全 os/arch 組合せに拡張（§10.1）** — 現在は代表ケースのみ。全組合せ + 各 OS の非対応 arch 拒否を網羅。
- **ダウンロード先ホスト/リダイレクト検証（NFR-1）** — 取得 URL を go-task 公式に固定し、リダイレクト先を検証。

---

## 参考: 実装済みで確認済みの要求

- FR-1 バージョン解決（exact/range/latest, `v` 正規化, prerelease 除外）— `src/version.ts`
- FR-2 プラットフォーム判定 + `architecture` 上書き — `src/platform.ts`
- FR-3 認証付き DL + content-type ガード — `src/download.ts` / `src/github.ts`
- FR-4 指数バックオフ + 恒久エラー即 fail — `src/download.ts` / `src/errors.ts`
- FR-5 SHA256 検証（既定 ON, BSD `*name` 形式対応）— `src/checksum.ts`
- FR-6〜FR-9 展開 / chmod / tool-cache / PATH / outputs — `src/main.ts` / `src/install.ts`
- FR-10 inputs（`arduino/setup-task` 互換）— `action.yml`
- NFR-3 exact 指定時の一覧取得スキップ — `src/version.ts`
