# Google Colab で PLaMo 3 Translate を動かす手順

自分用・使うときだけ手動起動する前提で、Colab 上に OpenAI 互換の翻訳サーバー(vLLM)を立て、Talklate4u から利用する手順です。

- ノートブック: [plamo3_translate_server.ipynb](./plamo3_translate_server.ipynb)
- 構成: Colab(vLLM + PLaMo 3 Translate 8B) → `cloudflared` クイックトンネル → Talklate4u(`openai` プロバイダー)

> [!NOTE]
> 通常運用は Groq で足ります。これは Groq にないモデルを試したいとき、またはレート制限を避けたいときの手段です。

## 事前準備(初回のみ)

1. **Colab のプラン**: Google AI Pro(Colab Pro 相当)を推奨します。L4 などの GPU を選べる場合があります。
2. **Hugging Face(不要)**
   - `pfnet/plamo-3-translate-8b` はゲートなし(`gated: false`、2026-11-21 時点で Hugging Face API にて確認)のため、トークンなしでダウンロードできます。
   - 将来ゲート付きに変わって 401/403 になった場合のみ、Colab の鍵アイコンで `HF_TOKEN` を追加し、「ノートブックからのアクセス」をオンにします。未登録でもノートブックは止まりません。

## 起動手順

1. [Colab](https://colab.research.google.com/) で `plamo3_translate_server.ipynb` を開きます(アップロードまたは GitHub から)。
2. メニューの「ランタイム → ランタイムのタイプを変更」で GPU を選びます。
   - **L4 推奨**(BF16 で動作)。
   - **T4 の場合**は、設定セルで `DTYPE = 'float16'` に変更します。
3. セルを上から順に実行します。
   - 設定 → GPU 確認 → 依存関係インストール → 認証情報 → vLLM 起動 → トンネル起動。
   - 初回はモデルのダウンロードで数分かかります。
4. 最後のトンネルセルに、次の情報が表示されます。

   ```text
   プロバイダー : openai
   モデル名     : plamo-3-translate-8b
   Base URL     : https://xxxx.trycloudflare.com/v1
   API キー     : tk-xxxxxxxx
   ```

5. (任意)動作テストのセルを実行し、翻訳結果が返ることを確認します。

## Talklate4u の設定

設定画面で LLM を次のとおり設定します。

| 項目         | 値                                             |
| ------------ | ---------------------------------------------- |
| プロバイダー | `openai`                                       |
| モデル名     | `plamo-3-translate-8b`(`plamo` を含めること)   |
| Base URL     | 表示された `https://xxxx.trycloudflare.com/v1` |
| API キー     | 表示された `tk-...`                            |

モデル名に `plamo` を含めると、`PlamoAdapter` が自動で選ばれます。

## 終了手順

1. 「停止」セルを実行します。
2. 「ランタイム → セッションを終了」でランタイムを切断します。切断しないとコンピュートユニットを消費し続けます。

## 注意事項

- **URL は毎回変わります。** 起動のたびに Base URL と API キーを設定し直してください。
- **API キーは公開しないでください。** 公開 URL は誰でも到達できるため、API キーが唯一の防御です。スクリーンショットにも注意してください。
- **規約**: Colab でのトンネル利用はグレーな領域です。自分用の短時間利用に留めてください。
- **遅延**: トンネル経由で往復の遅延が加わります。体感は Groq より遅くなります。
- **セッション制限**: アイドルや最大稼働時間で切断されることがあります。

## トラブルシューティング

| 症状                           | 対処                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| vLLM が起動しない              | `/content/vllm.log` を確認します。`plamo3` が未対応と出る場合は、vLLM のバージョンを更新します                   |
| モデルのダウンロードで 401/403 | ゲート付きの可能性があります。ライセンス同意と `HF_TOKEN` の登録(ノートブックからのアクセス許可を含む)を行います |
| モデル ID が見つからない       | 設定セルの `MODEL_ID` を、Hugging Face 上の正しい ID に直します                                                  |
| GPU メモリ不足                 | `MAX_MODEL_LEN` を下げるか、T4 なら `DTYPE = 'float16'` にします。量子化版や GGUF 版も検討します                 |
| トンネル URL が取得できない    | `/content/cloudflared.log` を確認し、トンネルのセルを再実行します                                                |
| 翻訳結果の形式がおかしい       | vLLM のチャットテンプレートと `PlamoAdapter` の出力形式が合っているか確認します                                  |

## 未確認事項

- モデル ID `pfnet/plamo-3-translate-8b` は実在を確認済みです(BF16 約 17GB、`Plamo3ForCausalLM`)。
- 公式チャットテンプレートは **system メッセージを受け付けません**。`PlamoAdapter` はリモート(`openai` プロバイダー)のとき user メッセージのみを送り、`target_lang` などを `chat_template_kwargs` で渡すように対応済みです。実機(vLLM)での動作は未検証です。
