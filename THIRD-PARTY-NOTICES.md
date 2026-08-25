# サードパーティのライセンス表示

facet 本体は MIT ライセンス（[`LICENSE`](LICENSE)）で配布している。
配布物（インストーラ・アプリバンドル）には以下の第三者ソフトウェアが含まれており、
それぞれのライセンスがそのまま適用される。各ライセンスの全文は、npm パッケージなら
`node_modules/<パッケージ名>/`、Rust クレートなら crates.io の各ページにある。

## フォント

| 名称 | ライセンス | 備考 |
| --- | --- | --- |
| IBM Plex Sans Variable（`@fontsource-variable/ibm-plex-sans`） | **OFL-1.1** | アプリへの埋め込みは許諾されている。**フォントファイル単体の販売は禁止**。改変して再配布する場合は予約名（Reserved Font Name）を使えない。ライセンス全文は各パッケージ同梱の `LICENSE` |
| IBM Plex Sans JP（`@fontsource/ibm-plex-sans-jp`） | **OFL-1.1** | 同上。static 400/500/600 のみ同梱 |
| IBM Plex Mono（`@fontsource/ibm-plex-mono`） | **OFL-1.1** | 同上。static 400/700 のみ同梱（700 は端末の ANSI 太字用） |

## npm（実行時依存）

| パッケージ | ライセンス |
| --- | --- |
| `@tailwindcss/vite` | MIT |
| `@tauri-apps/api` | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-clipboard-manager` | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-dialog` | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-fs` | MIT OR Apache-2.0 |
| `@xterm/addon-fit` | MIT |
| `@xterm/xterm` | MIT |
| `ajv` | MIT |
| `class-variance-authority` | **Apache-2.0** |
| `clsx` | MIT |
| `d3-selection` | ISC |
| `d3-zoom` | ISC |
| `lucide-react` | ISC |
| `radix-ui` | MIT |
| `react` / `react-dom` | MIT |
| `shadcn` | MIT |
| `tailwind-merge` | MIT |
| `tailwindcss` | MIT |
| `tw-animate-css` | MIT |

`src/components/ui/` の3ファイル（`alert-dialog.tsx` / `button.tsx` / `dropdown-menu.tsx`）は
[shadcn/ui](https://ui.shadcn.com)（MIT）から取り込んで改変したもの。

## Rust クレート（直接依存）

| クレート | ライセンス |
| --- | --- |
| `base64` | MIT OR Apache-2.0 |
| `log` | MIT OR Apache-2.0 |
| `portable-pty` | **MIT** |
| `serde` / `serde_json` | MIT OR Apache-2.0 |
| `tauri` | Apache-2.0 OR MIT |
| `tauri-plugin-clipboard-manager` | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | Apache-2.0 OR MIT |
| `tauri-plugin-fs` | Apache-2.0 OR MIT |
| `tauri-plugin-log` | Apache-2.0 OR MIT |
| `trash` | **MIT** |

推移的な依存も含めた完全な一覧は `package-lock.json` と `src-tauri/Cargo.lock` にある。

## 配色の由来

`src/styles/palette.css` の色値は [Morphos](https://morphos.ameyanagi.com) の
`morphous-basalt` を下敷きに、コントラスト要件を満たすよう明度を調整したもの。
