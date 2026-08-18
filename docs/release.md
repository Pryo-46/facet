# リリース手順（Windows）

facet は GitHub Releases から配布する。M19 で Windows 版（NSIS の x64 インストーラ）に
自動アップデートを足したため、リリースのたびに `latest.json` を作って asset として
上げる必要がある。**この手順は CI 化していない**（手元ビルドのまま）。v1.0.0 も
手でビルドして手で上げた。

対象は Windows のみ。mac の dmg は同じリリースに足すが、自動アップデートの対象外
（`latest.json` には載せない）。

## 1. 署名鍵の生成（初回のみ）

Tauri の updater は成果物への署名を要る。鍵は初回だけ生成する。

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\facet.key"
```

**秘密鍵とパスワードをパスワードマネージャへバックアップすること。** 失うと
以後どのバージョンからも自動更新できなくなる——インストール済みの利用者全員が
手動での再インストールに戻る。

## 2. 版番号を3箇所そろえて上げる

以下の3ファイルの `version` を、リリースする版に手作業で揃える。

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`（`[package]` セクション）

`scripts/make-latest-json.mjs` はこの3箇所が揃っているかを検査するだけで、
揃えにはいかない。揃っていなければ実行時に落ちる。

揃えたら `npm install` を走らせ、`package-lock.json` を追従させること。
`package-lock.json` は `lock.version` と `lock.packages[""].version` の2箇所に
版を持つが、`resolveVersion()` はそこを検査しない（`latest.json` に影響しない
ので正しい）。それでも `npm install` を忘れると、古い版のまま public リポジトリに
commit されるのを止めるものが何も無くなる。

## 3. 署名用の環境変数を置く

PowerShell で、鍵のパスとパスワードを環境変数に置く。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\facet.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<パスワード>"
```

**`.env` には書かないこと。** リポジトリに入りうる。

## 4. ビルド

```powershell
npm run tauri build
```

`src-tauri/target/release/bundle/nsis/` に `facet_<v>_x64-setup.exe` と、
署名済みの `facet_<v>_x64-setup.exe.sig` ができる。

## 5. `latest.json` を作る

```powershell
node scripts/make-latest-json.mjs
```

リポジトリ直下に `latest.json` が書き出される（`.gitignore` 済み。git に
コミットするものではなく、GitHub Releases の asset として上げるもの）。

## 6. リリースを作る

PowerShell で（バッククォートが行継続。手順3〜5と同じセッションに貼れる形にしてある）:

```powershell
gh release create v<v> --title "v<v>" --notes-file <リリースノート> `
  "src-tauri/target/release/bundle/nsis/facet_<v>_x64-setup.exe" `
  latest.json
```

**`latest.json` を上げ忘れると更新経路が止まる。** インストーラだけ上げても、
updater が参照する `latest.json` が古い版のまま（または存在しないまま）なので、
既存ユーザーには新版が見えない。

## 7. mac の dmg を足す

mac の dmg は mac 実機で別に作り、同じリリースへ足す。

**mac のビルドでは updater 成果物を切ってビルドすること。** `createUpdaterArtifacts`
は `src-tauri/tauri.conf.json` の bundle 全体に効くフラグなので、素の
`npm run tauri build` は mac のビルド機にも minisign の秘密鍵（`TAURI_SIGNING_PRIVATE_KEY`）
を要求してしまう——これは「秘密鍵を2台に置かない」という M19 の判断（`docs/history/m19-core-auto-update.md`）を崩す。
以下の上書きで、秘密鍵を Windows の1台だけに留められる。

```
npm run tauri build -- --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

できた dmg をリリースへ足す（PowerShell）:

```powershell
gh release upload v<v> <dmg のパス>
```

**mac は自動アップデートの対象外**なので `latest.json` には載せない。

## 8. インストーラの種類について

インストーラの種類は一致していなければならない（NSIS で入れたなら NSIS で
更新する）。MSI は `bundle.targets` から外してある（理由は `docs/open-issues.md`
を参照）。
