import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import path from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
for (const name of ['.env.development.local', '.env.local', '.env.development', '.env']) {
  const file = path.join(root, name)
  if (existsSync(file)) process.loadEnvFile(file)
}

const frontendArgs = process.argv.slice(2)
const { values } = parseArgs({ args: frontendArgs, options: { port: { type: 'string', short: 'p' } }, strict: false, allowPositionals: true })
process.env.PORT ??= process.env.DEV_PORT || '3000'
const backendPort = Number(values.port ?? process.env.PORT) === 8000 ? '8001' : '8000'
const externalBackend = Boolean(process.env.LANDSIGHT_BACKEND_URL)
process.env.LANDSIGHT_BACKEND_URL ||= `http://127.0.0.1:${backendPort}`

const children = new Set()
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill('SIGTERM')
  const timeout = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL')
  }, 5000)
  timeout.unref()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop())

function start(command, args, cwd = root, stdio = 'inherit') {
  const child = spawn(command, args, { cwd, stdio, env: process.env })
  children.add(child)
  child.on('error', error => {
    console.error(`Could not start ${path.basename(command)}: ${error.code ?? 'unknown error'}`)
    children.delete(child)
    stop(1)
  })
  child.on('exit', code => {
    children.delete(child)
    if (!stopping) stop(code ?? 1)
  })
  return child
}

function prepare(args) {
  const result = spawnSync('uv', args, { cwd: root, stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    throw new Error('Python setup failed. The preview requires uv and the hash-locked Python 3.13 environment.')
  }
}

async function backendReady() {
  try {
    const response = await fetch(new URL('/health', process.env.LANDSIGHT_BACKEND_URL), { signal: AbortSignal.timeout(1000) })
    const health = await response.json()
    return response.ok && typeof health.predictionMode === 'string'
  } catch {
    return false
  }
}

async function startFrontend() {
  // Preview discovery must see Next.js before the private FastAPI listener.
  const frontend = start(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...frontendArgs], root, ['inherit', 'pipe', 'inherit'])
  frontend.stdout.pipe(process.stdout)
  await new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => finish(new Error('Next.js did not become ready; check the frontend startup output.')), 30_000)
    function finish(error) {
      clearTimeout(timeout)
      frontend.stdout.off('data', onData)
      frontend.off('exit', onExit)
      frontend.off('error', finish)
      if (error) reject(error)
      else resolve()
    }
    function onData(chunk) {
      output = (output + chunk.toString()).slice(-4096)
      if (output.includes('Ready in')) finish()
    }
    function onExit() { finish(new Error('Next.js exited before becoming ready.')) }
    frontend.stdout.on('data', onData)
    frontend.once('exit', onExit)
    frontend.once('error', finish)
  })
}

try {
  await startFrontend()
  if (!stopping && !externalBackend && !await backendReady()) {
    const backend = path.join(root, 'backend')
    const environment = path.join(backend, '.venv')
    const python = path.join(environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    if (!existsSync(python)) prepare(['venv', '--python', '3.13', environment])
    prepare(['pip', 'install', '--python', python, '--require-hashes', '-r', path.join(backend, 'requirements.lock')])
    // Keep warnings/errors, but do not advertise the internal API as the preview URL.
    start(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', backendPort, '--log-level', 'warning'], backend)
    const deadline = Date.now() + 30_000
    while (!await backendReady()) {
      if (stopping || Date.now() > deadline) throw new Error('FastAPI did not become ready; check the backend startup output.')
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
} catch (error) {
  console.error(error.message)
  stop(1)
}
