import { spawn } from 'node:child_process'

import { NotebookCellOutput, NotebookCellOutputItem, NotebookCellExecution } from 'vscode'

import { OutputType } from '../../constants'
import type { CellOutputPayload } from '../../types'
import type { Kernel } from '../kernel'
import { getAnnotations, replaceOutput } from '../utils'

import { handleVercelOutput, isVercelScript } from './vercel'

const MIME_TYPES_WITH_CUSTOM_RENDERERS = ['text/plain']

async function shellExecutor(
  this: Kernel,
  exec: NotebookCellExecution,
  script: string,
  cwd: string,
  env: Record<string, string>
): Promise<boolean> {
  let postScript = script
  let prod = false
  if (process.env['vercelProd'] === 'true') {
    prod = true
    postScript = `${postScript} --prod`
    process.env['vercelProd'] = 'false'
  }
  const outputItems: Buffer[] = []
  const child = spawn(postScript, { cwd, shell: true, env })
  console.log(`[Runme] Started process on pid ${child.pid}`)
  /**
   * this needs more work / specification
   */
  const annotations = getAnnotations(exec.cell)
  const mime = annotations?.mimeType || 'text/plain' as const
  const index = exec.cell.index

  /**
   * handle output for stdout and stderr
   */
  async function handleOutput(data: Buffer) {
    outputItems.push(data)
    let item = new NotebookCellOutputItem(Buffer.concat(outputItems), mime)

    // hacky for now, maybe inheritence is a fitting pattern
    if (isVercelScript(script)) {
      item = await handleVercelOutput(outputItems, index, prod, (key) => env[key])
    } else if (MIME_TYPES_WITH_CUSTOM_RENDERERS.includes(mime)) {
      item = NotebookCellOutputItem.json(<CellOutputPayload<OutputType.outputItems>>{
        type: OutputType.outputItems,
        output: {
          content: Buffer.concat(outputItems).toString('base64'),
          mime
        }
      }, OutputType.outputItems)
    }

    replaceOutput(exec, [ new NotebookCellOutput([ item ]) ])
  }

  child.stdout.on('data', handleOutput)
  child.stderr.on('data', handleOutput)
  return !Boolean(await new Promise<number>((resolve) => {
    /**
     * register cancellation handler
     * ToDo(Christian): maybe better to kill with SIGINT signal but that doesn't stop the
     * prcoess afterall
     */
    exec.token.onCancellationRequested(() => {
      child.stdin.destroy()
      child.stdout.off('data', handleOutput)
      child.stderr.off('data', handleOutput)

      if (child.pid) {
        process.kill(child.pid, 'SIGHUP')
      }
      resolve(child.kill('SIGHUP') ? 0 : 1)
    })

    child.on('exit', resolve)
  }))
}

export const sh = shellExecutor
export const bash = shellExecutor
