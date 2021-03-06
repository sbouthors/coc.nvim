import { DidChangeTextDocumentParams, Disposable, Position } from 'vscode-languageserver-protocol'
import events from '../events'
import * as types from '../types'
import workspace from '../workspace'
import { SnippetSession } from './session'
import * as Snippets from "./parser"
import { SnippetVariableResolver } from './variableResolve'
const logger = require('../util/logger')('snippets-manager')

export class SnippetManager implements types.SnippetManager {
  private sessionMap: Map<number, SnippetSession> = new Map()
  private disposables: Disposable[] = []
  private statusItem: types.StatusBarItem

  constructor() {
    // tslint:disable-next-line:no-floating-promises
    workspace.ready.then(() => {
      let config = workspace.getConfiguration('coc.preferences')
      this.statusItem = workspace.createStatusBarItem(0)
      this.statusItem.text = config.get<string>('snippetStatusText', 'SNIP')
    })

    workspace.onDidChangeTextDocument(async (e: DidChangeTextDocumentParams) => {
      let { uri } = e.textDocument
      let doc = workspace.getDocument(uri)
      if (!doc) return
      let session = this.getSession(doc.bufnr)
      if (session && session.isActive) {
        await session.synchronizeUpdatedPlaceholders(e.contentChanges[0])
      }
    }, null, this.disposables)

    workspace.onDidCloseTextDocument(textDocument => {
      let doc = workspace.getDocument(textDocument.uri)
      if (!doc) return
      let session = this.getSession(doc.bufnr)
      if (session) this.sessionMap.delete(session.bufnr)
    }, null, this.disposables)

    events.on('BufEnter', async bufnr => {
      let session = this.getSession(bufnr)
      if (!this.statusItem) return
      if (session && session.isActive) {
        this.statusItem.show()
      } else {
        this.statusItem.hide()
      }
    }, null, this.disposables)

    events.on('InsertEnter', async () => {
      let { session } = this
      if (!session) return
      await session.checkPosition()
    }, null, this.disposables)
  }

  /**
   * Insert snippet at current cursor position
   */
  public async insertSnippet(snippet: string, select = true, position?: Position): Promise<boolean> {
    let bufnr = await workspace.nvim.call('bufnr', '%')
    let session = this.getSession(bufnr)
    let disposable: Disposable
    if (!session) {
      session = new SnippetSession(workspace.nvim, bufnr)
      disposable = session.onCancel(() => {
        this.sessionMap.delete(bufnr)
        if (workspace.bufnr == bufnr) {
          this.statusItem.hide()
        }
      })
    }
    let isActive = await session.start(snippet, select, position)
    if (isActive) {
      this.sessionMap.set(bufnr, session)
      this.statusItem.show()
    } else if (disposable) {
      disposable.dispose()
    }
    return isActive
  }

  public async selectCurrentPlaceholder(): Promise<void> {
    let { session } = this
    if (session) return await session.selectCurrentPlaceholder()
  }

  public async nextPlaceholder(): Promise<void> {
    let { session } = this
    if (session) return await session.nextPlaceholder()
    workspace.nvim.call('coc#snippet#disable', [], true)
    this.statusItem.hide()
  }

  public async previousPlaceholder(): Promise<void> {
    let { session } = this
    if (session) return await session.previousPlaceholder()
    workspace.nvim.call('coc#snippet#disable', [], true)
    this.statusItem.hide()
  }

  public cancel(): void {
    let session = this.getSession(workspace.bufnr)
    if (session) return session.deactivate()
    workspace.nvim.call('coc#snippet#disable', [], true)
    if (this.statusItem) this.statusItem.hide()
  }

  public get session(): SnippetSession {
    let session = this.getSession(workspace.bufnr)
    return session && session.isActive ? session : null
  }

  public getSession(bufnr: number): SnippetSession {
    return this.sessionMap.get(bufnr)
  }

  public async resolveSnippet(body: string): Promise<Snippets.TextmateSnippet> {
    let parser = new Snippets.SnippetParser()
    const snippet = parser.parse(body, true)
    const resolver = new SnippetVariableResolver()
    snippet.resolveVariables(resolver)
    return snippet
  }

  public dispose(): void {
    this.cancel()
    for (let d of this.disposables) {
      d.dispose()
    }
  }
}

export default new SnippetManager()
