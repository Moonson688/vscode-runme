import {
  CancellationToken,
  CodeLens,
  CodeLensProvider,
  Disposable,
  Event,
  EventEmitter,
  NotebookCellKind,
  TextDocument,
  Range,
  languages,
  commands,
  workspace,
  window
} from 'vscode'

// import { Kernel } from '../kernel'
import { SerializerBase } from '../serializer'
import { Serializer } from '../../types'
import type { runCLICommand } from '../commands'

const ActionCommand = 'runme.codelens.action' as const

const ActionTypes = [
  'run',
  'open',
] as const satisfies readonly string[]

type ActionType = (typeof ActionTypes)[number]

type ActionArguments = [
  document: TextDocument,
  token: CancellationToken,
  cell: Serializer.Cell,
  index: number,
  action: ActionType
]

type ActionCallback = (...arg: ActionArguments) => void

export class RunmeCodeLensProvider implements CodeLensProvider, Disposable {
  private disposables: Disposable[] = []

  private _onDidChangeCodeLenses: EventEmitter<void> = this.register(new EventEmitter<void>())
	public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event

  constructor(
    protected serializer: SerializerBase,
    protected runCLI: ReturnType<typeof runCLICommand>
  ) {
    this.register(
      languages.registerCodeLensProvider('*', this)
    )

    const cmd: ActionCallback = this.codeLensActionCallback.bind(this)

    this.register(
      commands.registerCommand('runme.codelens.action', cmd),
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
    const contentBytes = Buffer.from(document.getText())
    const { cells } = await this.serializer['reviveNotebook'](contentBytes, token)

    return cells.flatMap((cell, i) => {
      if (cell.kind !== NotebookCellKind.Code || !cell.textRange) { return [] }

      let start = document.positionAt(cell.textRange.start)
      let end = document.positionAt(cell.textRange.end)

      start = start.with(start.line - 1)
      end = end.with(end.line - 1)

      const range = new Range(
        start, end
      )

      return ActionTypes.map((v) => {
        const args: ActionArguments = [document, token, cell, i, v]

        switch (v) {
          case 'run': {
            return new CodeLens(range, {
                title: '$(play) Run Block',
                tooltip: 'Test Tooltip',
                command: ActionCommand,
                arguments: args,
              })
          } break

          case 'open': {
            return new CodeLens(range, {
                title: '$(notebook) Open in Notebook',
                tooltip: 'Test Tooltip',
                command: ActionCommand,
                arguments: args,
              })
          } break
        }
      })
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
    return codeLens
  }

  protected register<T extends Disposable>(d: T) {
    this.disposables.push(d)
    return d
  }

  dispose() {
    this.disposables.forEach(({ dispose }) => dispose())
  }

  protected async codeLensActionCallback(
    document: TextDocument,
    token: CancellationToken,
    cell: Serializer.Cell,
    index: number,
    action: ActionType
  ) {
    switch (action) {
      case 'open': {
        const notebook = await workspace.openNotebookDocument(document.uri)

        await window.showNotebookDocument(notebook)

        // TODO(mxs): surely there's a better way to do this
        // probably we need to bring this logic to `workspace.onDidOpenNotebookDocument`
        await new Promise(cb => setTimeout(cb, 200))

        await commands.executeCommand('notebook.focusTop')

        await Promise.all(
          Array.from(
            {length: index}, () => commands.executeCommand('notebook.focusNextEditor')
          )
        )

        // await commands.executeCommand('notebook.cell.execute')
        // await commands.executeCommand('notebook.cell.focusInOutput')
      } break

      case 'run': {
        await this.runCLI({ metadata: cell.metadata, document })
      } break
    }
  }
}
