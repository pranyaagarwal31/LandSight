import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
for (const name of ['.env.development.local', '.env.local', '.env.development', '.env']) {
  const file = path.join(root, name)
  if (existsSync(file)) process.loadEnvFile(file)
}

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

function start(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env })
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
    const response = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(1000) })
    const health = await response.json()
    return response.ok && typeof health.predictionMode === 'string'
  } catch {
    return false
  }
}

try {
  if (!process.env.LANDSIGHT_BACKEND_URL && !await backendReady()) {
    const backend = path.join(root, 'backend')
    const environment = path.join(backend, '.venv')
    const python = path.join(environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    if (!existsSync(python)) prepare(['venv', '--python', '3.13', environment])
    prepare(['pip', 'install', '--python', python, '--require-hashes', '-r', path.join(backend, 'requirements.lock')])
    start(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], backend)
    const deadline = Date.now() + 30_000
    while (!await backendReady()) {
      if (stopping || Date.now() > deadline) throw new Error('FastAPI did not become ready; check the backend startup output.')
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!stopping) start(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...process.argv.slice(2)])
} catch (error) {
  console.error(error.message)
  stop(1)
}
