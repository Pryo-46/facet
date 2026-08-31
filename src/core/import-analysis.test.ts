import { describe, expect, it } from 'vitest'
import { isValueImportStatement } from './import-analysis'

/**
 * **`src/modules/sequence/skill-copy.test.ts` から移した。**
 * あちらは同梱コピーのバイト一致を見るテストで、m30 でコピー自体が
 * 生成物になったため役目を終えた。**混在ケースの回帰はここで見つかった
 * ものなので、ケースは1つも減らさずに持ってきている**——判定関数と
 * 同居させることで、次に触る人が実装の隣でケースを読める
 */
describe('isValueImportStatement', () => {
  const cases: [name: string, statement: string, expected: boolean][] = [
    ['単純な named import', "import { foo } from './bar'", true],
    ['複数行の named import', "import {\n  foo,\n} from './bar'", true],
    ['type 修飾と値 specifier の混在（回帰ケース）', "import { type Foo, bar } from './bar'", true],
    ['import type 節', "import type { Foo } from './bar'", false],
    ['単一の type 修飾 specifier', "import { type Foo } from './bar'", false],
    ['全て type 修飾された複数 specifier', "import { type Foo, type Bar } from './bar'", false],
    ['副作用 import（引用符のみ）', "import './side-effect'", true],
    ['副作用 import（セミコロン付き）', 'import "./side-effect";', true],
  ]

  it.each(cases)('%s → %s', (_name, statement, expected) => {
    expect(isValueImportStatement(statement)).toBe(expected)
  })
})
