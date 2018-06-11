import workspace from '../workspace'
import {
  Diagnostic,
} from 'vscode-languageserver-protocol'
import languages from '../languages'
import {
  Disposable,
  Uri,
  disposeAll,
} from '../util'
import {
  DiagnosticKind,
  ServiceStat,
} from '../types'
import {basename} from 'path'
// import { DiagnosticsManager } from './features/diagnostics';
import TypeScriptServiceClient from './typescriptServiceClient'
import BufferSyncSupport from './features/bufferSyncSupport'
import TypingsStatus from './utils/typingsStatus'
import FileConfigurationManager from './features/fileConfigurationManager'
import {LanguageDescription} from './utils/languageDescription'
const logger = require('../util/logger')('typescript-langauge-provider')

export default class LanguageProvider {
  private readonly bufferSyncSupport: BufferSyncSupport
  private readonly fileConfigurationManager: FileConfigurationManager // tslint:disable-line

  private _validate = true
  private _enableSuggestionDiagnostics = true

  private readonly disposables: Disposable[] = []
  private readonly versionDependentDisposables: Disposable[] = []

  constructor(
    public client: TypeScriptServiceClient,
    private description: LanguageDescription,
    typingsStatus: TypingsStatus
  ) {
    this.fileConfigurationManager = new FileConfigurationManager(client)
    this.bufferSyncSupport = new BufferSyncSupport(
      client,
      description.modeIds,
      {
        delete: resource => {
          // this.diagnosticsManager.delete(resource)
        }
      },
      this._validate
    )
    // this.diagnosticsManager = new DiagnosticsManager(description.diagnosticOwner);

    workspace.onDidEnterTextDocument(info => {
      let {state} = client
      let cb = () => {
        let {languageId, expandtab, tabstop} = info
        this.fileConfigurationManager.ensureConfigurationOptions(languageId, expandtab, tabstop) // tslint:disable-line
      }
      if (state == ServiceStat.Running) {
        cb()
      } else {
        client.onTsServerStarted(cb)
      }
    })

    client.onTsServerStarted(async () => { // tslint:disable-line
      await this.registerProviders(client, typingsStatus)
      this.bufferSyncSupport.listen()
    })
  }

  public dispose(): void {
    disposeAll(this.disposables)
    disposeAll(this.versionDependentDisposables)
    this.bufferSyncSupport.dispose()
  }

  private async registerProviders(
    client: TypeScriptServiceClient,
    typingsStatus: TypingsStatus
  ): Promise<void> {
    const TypeScriptCompletionItemProvider = (await import('./features/completionItemProvider')).default // tslint:disable-line
    this.disposables.push(
      languages.registerCompletionItemProvider(
        'tsserver',
        'TSC',
        this.description.modeIds,
        new TypeScriptCompletionItemProvider(
          client,
          typingsStatus,
          this.fileConfigurationManager
        ),
        TypeScriptCompletionItemProvider.triggerCharacters
      )
    )
  }

  public handles(resource: Uri): boolean {
    let fsPath = resource.fsPath
    if (this.id === 'typescript' && /ts(x)?$/.test(fsPath)) {
      return true
    }
    if (this.id === 'javascript' && /js(x)?$/.test(fsPath)) {
      return true
    }

    if (this.bufferSyncSupport.handles(resource)) {
      return true
    }

    const base = basename(resource.fsPath)
    return !!base && base === this.description.configFile
  }

  private get id(): string { // tslint:disable-line
    return this.description.id
  }

  public get diagnosticSource(): string {
    return this.description.diagnosticSource
  }

  // private updateValidate(value: boolean):void {
  //   if (this._validate === value) {
  //     return
  //   }
  //   this._validate = value
  //   this.bufferSyncSupport.validate = value
  //   this.diagnosticsManager.validate = value
  //   if (value) {
  //     this.triggerAllDiagnostics()
  //   }
  // }

  // private updateSuggestionDiagnostics(value: boolean):void {
  //   if (this._enableSuggestionDiagnostics === value) {
  //     return
  //   }
  //
  //   this._enableSuggestionDiagnostics = value
  //   this.diagnosticsManager.enableSuggestions = value
  //   if (value) {
  //     this.triggerAllDiagnostics()
  //   }
  // }

  public reInitialize(): void {
    // this.diagnosticsManager.reInitialize()
    this.bufferSyncSupport.reOpenDocuments()
    this.bufferSyncSupport.requestAllDiagnostics()
  }

  public triggerAllDiagnostics(): void {
    this.bufferSyncSupport.requestAllDiagnostics()
  }

  public diagnosticsReceived(
    diagnosticsKind: DiagnosticKind,
    file: Uri,
    syntaxDiagnostics: Diagnostic[]
  ): void {
    // logger.debug('diagnostics: ', diagnosticsKind, syntaxDiagnostics)
    // this.diagnosticsManager.diagnosticsReceived(
    //   diagnosticsKind,
    //   file,
    //   syntaxDiagnostics
    // )
  }
}