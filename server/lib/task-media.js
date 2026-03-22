import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { env } from './env.js'

const mediaDir = '/Users/wogbot/.openclaw/workspace/command-centre-app/public/task-media'

function extensionFromPath(filePath = '') {
  const ext = path.extname(filePath).toLowerCase()
  if (ext) return ext
  return '.jpg'
}

function publicBaseUrl() {
  return process.env.COMMAND_CENTRE_PUBLIC_URL || `http://127.0.0.1:${env.port}`
}

export async function persistRemoteMedia(url, sourcePath = '') {
  await mkdir(mediaDir, { recursive: true })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download media: ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const ext = extensionFromPath(sourcePath)
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
  const diskPath = path.join(mediaDir, fileName)
  await writeFile(diskPath, buffer)
  return `${publicBaseUrl()}/task-media/${fileName}`
}
