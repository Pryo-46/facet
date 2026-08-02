import { createRegistry } from '@/core/registry'
import { glossaryModule } from './glossary/module'

/** アプリ全体で使うレジストリ。新ツールはここに register を1行足す（rev 6章）。 */
export const appRegistry = createRegistry()
appRegistry.register(glossaryModule)
