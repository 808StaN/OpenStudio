import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function runRefreshDrumkits() {
  const scriptPath = path.resolve(
    __dirname,
    'scripts',
    'generate-drumkits-manifest.mjs',
  )

  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', function (chunk) {
      stdout += String(chunk)
    })
    child.stderr.on('data', function (chunk) {
      stderr += String(chunk)
    })

    child.on('error', function (error) {
      reject(error)
    })

    child.on('close', function (code) {
      if (code === 0) {
        resolve({ stdout })
        return
      }

      const message =
        stderr.trim() || stdout.trim() || 'refresh:drumkits failed'
      reject(new Error(message))
    })
  })
}

function drumkitsRescanPlugin() {
  return {
    name: 'openstudio-drumkits-rescan',
    configureServer(server) {
      server.middlewares.use(async function (req, res, next) {
        if (
          req.url !== '/__openstudio/refresh-drumkits' ||
          req.method !== 'POST'
        ) {
          next()
          return
        }

        try {
          await runRefreshDrumkits()
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              error: String(error?.message || 'rescan failed'),
            }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), drumkitsRescanPlugin()],
})
