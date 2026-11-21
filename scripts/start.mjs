import { spawn } from 'child_process'

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = ['run', process.platform === 'win32' ? 'dev:browser' : 'dev:mac']

const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

child.on('exit', code => process.exit(code ?? 0))
