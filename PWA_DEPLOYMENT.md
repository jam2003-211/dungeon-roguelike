# PWAと公開準備

Node.js 24.21.0、`npm ci`、`npm test`、`npm run build` を使用します。
`vite-plugin-pwa` の通知方式でSWを生成し、必要な静的リソースを事前キャッシュします。
最初の読み込みとキャッシュ完了までは通信が必要です。素材原本ZIPはキャッシュ対象外です。

## 設定とローカル確認

- 暫定名称・色・Manifest・キャッシュ設定：`pwa.config.ts`。ブラウザのページ名は `index.html`。
- アイコン：`public/pwa/`。提供ZIPのPNGを無加工で配置しています。
- 通常の開発：`npm run dev`（SWは無効）。
- 本番動作：`npm run build` → `npm run preview`。
- PWA検証：`npm run test:pwa`（ルートとサブパスの本番ビルドをローカル配信して検証）。
- サブパス指定例（PowerShell）：`$env:VITE_BASE_PATH='/example.game/'; npm.cmd run build`。
  指定を終了したら `Remove-Item Env:VITE_BASE_PATH` を実行してください。

更新通知は小さく表示し、探索中・保存中・保存失敗時は更新操作を無効にします。
町またはタイトルで、保存完了後に「更新する」を押すと切り替えます。
SWはIndexedDBに触れません。保存形式とDB名は第6-B段階のままです。
セーブは端末・ブラウザ内に保存され、ブラウザデータ削除等で失われる場合があります。
別のブラウザ・公開先オリジン・インストール形態で保存領域が常に共有されるとは限りません。

## GitHub Pagesを実際に公開するとき

この段階ではリモート登録・push・公開・GitHubの設定変更を行いません。
現在はリモート未設定です。ユーザーが公開先を決めた後に以下を行います。

1. 公開先リポジトリとリモートを設定します。
2. GitHubの Settings → Pages → Source を **GitHub Actions** にします。
3. 公開を承認したうえで `main` をpush、またはActionsからPagesワークフローを実行します。
4. Actionsの成功と公開URLで、インストール・オフライン・更新・保存を確認します。

`.github/workflows/pages.yml` はGitHub公式Actionsを使用し、
`configure-pages` が返す公開パスから `VITE_BASE_PATH` を設定します。
ユーザー名・リポジトリ名はソース内に固定していません。

iPhone Safari・Android Chromeでの実機インストールとノッチ領域の確認は、
PCブラウザの検証とは別に実施してください。
