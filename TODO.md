# 残タスク / Backlog

`要求仕様書.md`・`企画書.md` と現コードベースの差分を整理。
分類は **マイルストーン（リリース単位）× 優先度（`P0..P3`）**。`(FR/NFR/§)` は要求仕様書の参照。

**現状**: FR-1〜FR-10 と主要 NFR は実装・テスト済み。CI（`ci.yml` / `self-test.yml`）も green。
残りは **リリース運用（M3/M4）**、セキュリティ強化系 CI、将来拡張・任意機能。

---

## マイルストーン `v1.0.0`（要求仕様書 §11 DoD）

### 実装・テスト済み（Done）

| 参照 | 内容 | 実装箇所 |
|---|---|---|
| FR-1 | バージョン解決（exact / range / latest, `v` 正規化, prerelease 除外） | `src/version.ts` |
| FR-2 | プラットフォーム判定 + `architecture` 上書き | `src/platform.ts` |
| FR-3 | 認証付き DL + content-type ガード | `src/download.ts` / `src/github.ts` |
| FR-4 | 指数バックオフ + 恒久エラー即 fail | `src/download.ts` / `src/errors.ts` |
| FR-5 | SHA256 検証（既定 ON, BSD `*name` 形式対応） | `src/checksum.ts` |
| FR-6〜FR-9 | 展開 / chmod / tool-cache / PATH / outputs | `src/main.ts` / `src/install.ts` |
| FR-10 | `arduino/setup-task` 互換 inputs | `action.yml` |
| NFR-1 | `repo-token` マスク + 取得ホスト/リダイレクト先検証 | `src/main.ts` / `src/url-guard.ts` / `src/github.ts` |
| NFR-3 | exact 指定時の一覧取得スキップ + cache 優先 | `src/version.ts` / `src/main.ts` |
| §10.1 | ユニットテスト（version / platform / github / download / checksum） | `tests/*.test.ts` |
| §10.2 | cache-hit 経路の self-test | `.github/workflows/self-test.yml` |
| §10.3 | checksum 改ざん検出テスト | `tests/checksum.test.ts` |

### 未対応・進行中

| # | 概要 | 優先度 | 参照 | 備考 |
|---|---|---|---|---|
| [#9](https://github.com/yk-lab/setup-task/issues/9) | `[chore]` lefthook で pre-push に `pnpm run all` を仕込む | `P3: low` | `ci` `chore` | stale dist / 未 lint コミット防止 |
| [#23](https://github.com/yk-lab/setup-task/issues/23) | `[ci]` ワークフロー静的解析（`actionlint` / `zizmor`）を CI に追加 | `P3: low` | `security` `ci` | 既存 WF のセキュリティ lint |

### 未対応・進行中（リリース運用 / M3・M4）

| # | 概要 | 優先度 | ラベル | 備考 |
|---|---|---|---|---|
| [#37](https://github.com/yk-lab/setup-task/issues/37) | `[release]` リリース自動化 + `v1` ムービングタグ + Marketplace 公開 | `P1: high` | `release` | **release-please + `JasonEtco/build-and-tag-action`（パターン A）** で実装。詳細は Issue 内コメント参照 |
| [#38](https://github.com/yk-lab/setup-task/issues/38) | `[docs]` README に arduino/setup-task からの移行ガイドを追加 | `P2: medium` | `documentation` | §11 DoD「代表ワークフローが通ることを保証」に対応 |

---

## マイルストーン `Backlog`（将来 / optional）

### 未対応・進行中

| # | 概要 | 優先度 | ラベル | 備考 |
|---|---|---|---|---|
| [#39](https://github.com/yk-lab/setup-task/issues/39) | `[enhancement]` ジョブサマリに導入結果を出力（NFR-5） | `P3: low` | `enhancement` |
| [#41](https://github.com/yk-lab/setup-task/issues/41) | `[test]` platform.test.ts を §9 全 os/arch 組合せに拡張 | `P3: low` | `test` |
| [#44](https://github.com/yk-lab/setup-task/issues/44) | `[enhancement]` フォールバックソースをサポート（FR-11） | `P3: low` | `enhancement` |
| [#45](https://github.com/yk-lab/setup-task/issues/45) | `[chore]` Biome 導入を評価 | `P3: low` | `chore` |

### 未 Issue 化

なし

---

## 備考: 既に解決した Issue

v1.0.0 実装中に作成・解決済みの Issue（参考）。

| # | 概要 | 解決 PR（推定） |
|---|---|---|
| [#8](https://github.com/yk-lab/setup-task/issues/8) | `[ci]` Codecov でカバレッジを PR 表示 | #46 / #47 |
| [#1](https://github.com/yk-lab/setup-task/issues/1) | `[security]` `repo-token` を `core.setSecret` で秘匿 | #24 |
| [#2](https://github.com/yk-lab/setup-task/issues/2) | `[test]` `withRetry` のユニットテスト | #25 |
| [#3](https://github.com/yk-lab/setup-task/issues/3) | `[test]` `fetchJson` content-type ガードのテスト | #26 |
| [#4](https://github.com/yk-lab/setup-task/issues/4) | `[test]` checksum 改ざん注入の self-test | #27 |
| [#5](https://github.com/yk-lab/setup-task/issues/5) | `[test]` cache-hit 経路の self-test | #29 |
| [#7](https://github.com/yk-lab/setup-task/issues/7) | `[bug]` レンジ指定時に tool-cache より先に GitHub 解決する | #30 |
| [#22](https://github.com/yk-lab/setup-task/issues/22) | dist/ freshness 管理 | #36（main から dist/ を外し、リリース時ビルド方式へ） |
| [#40](https://github.com/yk-lab/setup-task/issues/40) | `[enhancement]` リトライ回数・間隔を input 化（FR-4） | #51 |
| [#43](https://github.com/yk-lab/setup-task/issues/43) | `[chore]` checksum 改ざんテストの重複ファイルを統合 | #52 |
| [#42](https://github.com/yk-lab/setup-task/issues/42) | `[security]` ダウンロード先ホスト/リダイレクト先を検証（NFR-1） | #53 |
