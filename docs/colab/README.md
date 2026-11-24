# Google Colab で PLaMo 3 Translate を動かす手順

自分用・使うときだけ起動する前提で、Colab 上に OpenAI 互換の翻訳サーバー（`vLLM`）を立て、Talklate4u から利用する手順です。

- **推奨（CLI 方式）**: [start_colab_plamo.sh](./start_colab_plamo.sh) + [serve_plamo.py](./serve_plamo.py)
  - `google-colab-cli` と OpenSSH の `ProxyCommand` を使い、`http://127.0.0.1:8000/v1` へ安全・低遅延で直結します。
  - `cloudflared` による外部公開や、起動ごとの URL・API キー書き換えが不要です。
- **代替（ブラウザ手動方式）**: [plamo3_translate_server.ipynb](./plamo3_translate_server.ipynb)
  - CLI 環境を用意せずブラウザだけで完結させたい場合のフォールバックです。

> [!NOTE]
> 通常運用は Groq で足ります。これは Groq にないモデルを試したいとき、またはレート制限を避けたいときの手段です。

---

## 方法 A: Colab CLI を使う手順（推奨）

`google-colab-cli` は Linux / macOS 対応のため、Windows 環境では **WSL2** 上で実行します（WSL2 の標準設定 `localhostForwarding=true` により、Windows 側の Talklate4u からも `http://127.0.0.1:8000/v1` でそのまま接続できます）。

### 1. 事前準備（初回のみ・WSL2 側）

1. **Colab のプラン**: Google AI Pro（Colab Pro 相当）または従量課金プランを推奨します。
2. **`google-colab-cli` のインストールと認証、SSH 鍵の準備**:

   ```bash
   # uv でインストール（Linux/WSL2 でのキーリングエラー回避のため keyrings.alt を同梱）
   uv tool install google-colab-cli --with keyrings.alt

   # 初回 OAuth2 認証（ブラウザで Google アカウントを認証）
   colab --auth=oauth2 sessions

   # Colab SSH 用の鍵作成（RSA は拒否されるため ed25519 を使用）
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

   # 起動スクリプトへの実行権限付与
   chmod +x docs/colab/start_colab_plamo.sh
   ```

3. **Hugging Face（原則不要）**:
   - `pfnet/plamo-3-translate-8b` および `pfnet/plamo-3-translate-8b-W4A16` はゲートなし（`gated: false`）のためトークン不要です。
   - 将来ゲート付きになった場合のみ、Colab のシークレットに `HF_TOKEN` を登録してください。

### 2. 起動手順

WSL2 で起動スクリプトを実行します。

```bash
./docs/colab/start_colab_plamo.sh
```

デフォルトでは、コンピュートユニット消費が最安で確保もしやすい **T4 GPU ＋ `pfnet/plamo-3-translate-8b-W4A16`**（4bit 重み / FP16 計算、VRAM 約 5.6GB）を使用し、以下が全自動で実行されます（Google Drive 認証なしで放置起動可能、ダウンロード込みで約 2〜3 分）。

1. Colab 上に T4 GPU ランタイムを確保（`colab new`）
2. `vllm>=0.12.0` をインストール
3. `serve_plamo.py` をアップロードして起動（ログをリアルタイム表示）
4. OpenSSH `ProxyCommand`（`colab ssh --proxy-mode`）でローカルの `127.0.0.1:8000` へ SSH ポートフォワードを開通

ログに `Application startup complete.` が表示されたら準備完了です。

> [!TIP]
> 環境変数でオプション変更が可能です。
>
> - L4 GPU（無量子化 BF16）を使う場合: `COLAB_GPU=L4 ./docs/colab/start_colab_plamo.sh`
> - 2B モデルを T4 で使う場合: `PLAMO_MODEL_ID=pfnet/plamo-3-translate-2b ./docs/colab/start_colab_plamo.sh`
> - Google Drive キャッシュを使う場合（起動時に毎回ブラウザでの Drive 認証＋Enter が必要）: `USE_DRIVE_CACHE=1 ./docs/colab/start_colab_plamo.sh`

### 3. Talklate4u の設定（初回のみ固定設定）

CLI 方式では URL と API キーが毎回変わらないため、一度設定すれば書き換え不要です。

| 項目         | 値                                             |
| ------------ | ---------------------------------------------- |
| プロバイダー | `openai`                                       |
| モデル名     | `plamo-3-translate-8b`（`plamo` を含めること） |
| Base URL     | `http://127.0.0.1:8000/v1`                     |
| API キー     | `dummy`（任意の文字列で可）                    |

モデル名に `plamo` を含めると、`PlamoAdapter` が自動で選ばれます。

### 4. 終了手順

起動中のターミナルで `Ctrl+C` を押します。

スクリプトの終了処理（`trap`）が走り、自動的に `colab stop` を実行して Colab ランタイムを破棄したあと、`colab sessions` でセッションが停止したことを確認します（処理中に `Ctrl+C` を連打しても停止確認まで中断されないよう保護されています）。

念のため手動で課金停止を確認したい場合は、以下を実行してください：

```bash
colab sessions && colab usage
```

`No active sessions found on server.` および `Usage rate: 0.00/hr` / `Active assignments: 0` であれば停止済みです。

---

## 方法 B: ブラウザから手動起動する手順（フォールバック）

1. [Colab](https://colab.research.google.com/) で [plamo3_translate_server.ipynb](./plamo3_translate_server.ipynb) を開きます。
2. メニューの「ランタイム → ランタイムのタイプを変更」で GPU（L4 推奨、T4 の場合は `MODEL_ID = 'pfnet/plamo-3-translate-8b-W4A16'` および `DTYPE = 'float16'`）を選びます。
3. セルを上から順に実行し、最後のトンネルセルに表示される `https://xxxx.trycloudflare.com/v1` と `tk-xxxxxxxx` を Talklate4u に設定します。
4. 使い終わったら「停止」セルを実行し、「ランタイム → セッションを終了」で必ず切断してください。

---

## 注意事項・制限

- **セッション制限**: Colab のアイドル制限や最大稼働時間に達するとセッションが切断されます。また、短時間に作成・破棄を繰り返すと一時的に `Service Unavailable` (503) になることがあります。
- **公式チャットテンプレートの仕様**: `pfnet/plamo-3-translate-8b` 系の公式チャットテンプレートは **system メッセージを受け付けません**。`PlamoAdapter` はリモート（`openai` プロバイダー）のとき `user` メッセージのみを送り、`target_lang` などを `chat_template_kwargs` で渡すように対応済みです（Colab T4 + `W4A16` + vLLM 0.34.0 で実機動作確認済み）。

## トラブルシューティング

| 症状                                   | 対処                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `colab ssh` で鍵認証エラーが出る       | RSA 鍵は Colab 側で拒否されるため、`ssh-keygen -t ed25519` で作成した鍵があるか確認します              |
| `L4` / `A100` が `Service Unavailable` | 混雑時間帯は空きがないことがあります。デフォルトの `T4` のまま利用するか時間を置いて再実行してください |
| vLLM が起動しない                      | ターミナルに流れるエラーを確認します（OOM の場合は `PLAMO_MAX_MODEL_LEN` を下げるか `2B` を検討）      |
| 終了後にセッションが残った場合         | `colab stop -s plamo-server` を手動実行し、`colab sessions && colab usage` で確認してください          |
