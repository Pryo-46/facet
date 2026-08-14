import { describe, expect, it } from 'vitest'
import { appRegistry } from '@/modules'

describe('モジュール登録', () => {
  // 規約: 一覧に出す以上、全モジュールがアイコンを持つ（FileList が module.icon を読む）。
  // lucide-react のアイコンは forwardRef のオブジェクトなので typeof は 'function' ではなく
  // 'object' になる——ここでは「未設定でない」ことだけを見る（型はコンパイル時に保証済み）
  it('全モジュールがアイコンを持つ', () => {
    for (const module of appRegistry.list()) {
      expect(module.icon, `${module.type} に icon が無い`).toBeDefined()
    }
  })
})
