import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`)
  }
}

const envExample = path.join(root, '.env.example')
const envFile = path.join(root, '.env')
if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envFile)
  console.log('Created .env from .env.example')
}

console.log('Installing Node.js dependencies...')
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'])

const venvDir = path.join(root, 'services', 'ai', 'venv')
const python = process.platform === 'win32'
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python')

if (!fs.existsSync(python)) {
  console.log('Creating the Python virtual environment...')
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3'
  run(pythonCommand, ['-m', 'venv', venvDir])
}

console.log('Installing Python dependencies...')
run(python, ['-m', 'pip', 'install', '--upgrade', 'pip'])
run(python, ['-m', 'pip', 'install', '-r', path.join(root, 'services', 'ai', 'requirements.txt')])

console.log('\nSetup complete. Add your Gemini API key to .env, then run: npm start')
