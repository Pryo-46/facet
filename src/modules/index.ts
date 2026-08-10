import { createRegistry } from '@/core/registry'
import { errorCatalogModule } from './error-catalog/module'
import { glossaryModule } from './glossary/module'
import { logicTreeModule } from './logic-tree/module'
import { sequenceModule } from './sequence/module'

/** アプリ全体で使うレジストリ。新ツールはここに register を1行足す（rev 6章）。 */
export const appRegistry = createRegistry()
appRegistry.register(glossaryModule)
appRegistry.register(errorCatalogModule)
appRegistry.register(logicTreeModule)
appRegistry.register(sequenceModule)
