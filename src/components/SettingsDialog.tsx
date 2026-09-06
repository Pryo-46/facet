import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeneralSettings } from './settings/GeneralSettings'
import { InputSettings } from './settings/InputSettings'
import type { SettingsPanelProps } from './settings/types'
import type { AppSettings } from '@/core/settings'

/**
 * 設定のカテゴリ。**足すときはパネルを1本書いてここへ1行足す。**
 * ダイアログ本体はこの配列を回すだけなので触らない
 */
const SETTINGS_TABS = [
  { id: 'general', label: '一般', Panel: GeneralSettings },
  { id: 'input', label: '操作', Panel: InputSettings },
] as const satisfies readonly {
  id: string
  label: string
  Panel: (props: SettingsPanelProps) => ReactNode
}[]

export interface SettingsDialogProps {
  open: boolean
  settings: AppSettings
  /** 値が変わるたび呼ぶ。保存は呼び手の担当 */
  onChange: (next: AppSettings) => void
  onClose: () => void
}

/**
 * 設定画面。
 *
 * **モーダルキューには積まない。** キューはアプリが出す要求を並べる器で、
 * 利用者が能動的に開く画面は性質が違う。**開いている間は呼び出し側が
 * `KeyContext.modalOpen` を true にすること**（rev 10章の境界規則）。
 *
 * **OK とキャンセルを置かない。** 5つとも独立したトグルなので、まとめて確定する
 * 意味がない。切り替えた時点で効き、そのまま保存される。
 *
 * タブの選択は覚えず、開くたび先頭から始める
 */
export function SettingsDialog({ open, settings, onChange, onClose }: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={SETTINGS_TABS[0].id}>
          <TabsList>
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SETTINGS_TABS.map(({ id, Panel }) => (
            <TabsContent key={id} value={id}>
              <Panel settings={settings} onChange={onChange} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
