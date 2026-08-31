#!/usr/bin/env node
/**
 * Regenerates the screenshots used in README.md.
 *
 * Boots the Expo web dev server (unless `--url` points at a running one), drives a
 * phone-sized Chromium through each route, pours a rosetta on the simulator canvas,
 * and writes one PNG per screen into `docs/screenshots/`.
 *
 * Usage:
 *   yarn screenshots                              # boots its own dev server
 *   yarn screenshots --url http://localhost:8081  # use an already-running `yarn web`
 *   yarn screenshots --headed                     # real GPU (fallback if WebGL is blank)
 *   yarn screenshots --out some/dir               # alternate output directory
 */

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Parse `--flag value` / `--flag` style arguments. */
function parseArgs(argv) {
  const args = { url: null, out: 'docs/screenshots', headed: false, port: 8082 }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--port') args.port = Number(argv[++i])
    else if (arg === '--headed') args.headed = true
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: yarn screenshots [--url <base>] [--out <dir>] [--port <n>] [--headed]')
      process.exit(0)
    } else {
      console.error(`unknown argument: ${arg}`)
      process.exit(1)
    }
  }
  return args
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Resolve once the dev server answers on `url`, or reject after `timeoutMs`. */
async function waitForServer(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (response.ok) return
    } catch {
      // server not up yet
    }
    await sleep(1_000)
  }
  throw new Error(`dev server did not start at ${url} within ${timeoutMs / 1000}s`)
}

/** Start `expo start --web` on `port`. Returns the child process. */
function startDevServer(port) {
  console.log(`> starting expo web dev server on port ${port}`)
  const child = spawn('npx', ['expo', 'start', '--web', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`  expo | ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`  expo | ${chunk}`))
  return child
}

/**
 * Pour latte art on the simulator canvas with a few pull-through strokes:
 * wiggle side to side while walking down the cup, then draw the stem back up.
 */
async function pourRosetta(page, { width, height }) {
  const centerX = width / 2
  const topY = height * 0.3
  const bottomY = height * 0.72
  const wiggle = width * 0.16

  await page.mouse.move(centerX, topY)
  await page.mouse.down()
  const strokes = 14
  for (let i = 1; i <= strokes; i++) {
    const t = i / strokes
    const x = centerX + Math.sin(t * Math.PI * 5) * wiggle * (1 - t * 0.35)
    const y = topY + (bottomY - topY) * t
    await page.mouse.move(x, y, { steps: 6 })
    await sleep(45)
  }
  // Pull the stem back through the middle of the pattern.
  await page.mouse.move(centerX, bottomY, { steps: 4 })
  await page.mouse.move(centerX, topY * 0.85, { steps: 24 })
  await page.mouse.up()
}

/** Navigate to `path`, wait for it to settle, and write `<out>/<name>.png`. */
async function capture(page, { baseUrl, path, name, settleMs, outDir, before }) {
  const url = `${baseUrl}${path}`
  console.log(`> ${name}: ${url}`)
  await page.goto(url, { waitUntil: 'load' })
  await sleep(settleMs)
  if (before) await before(page)
  const file = resolve(outDir, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  wrote ${file}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = resolve(ROOT, args.out)
  await mkdir(outDir, { recursive: true })

  let server = null
  let browser = null
  try {
    let baseUrl = args.url
    if (!baseUrl) {
      server = startDevServer(args.port)
      baseUrl = `http://localhost:${args.port}`
    }
    await waitForServer(baseUrl)

    browser = await chromium.launch({
      headless: !args.headed,
      // expo-gl needs a real WebGL2 context; SwiftShader provides one headlessly.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    })
    const phone = devices['iPhone 14 Pro']
    const context = await browser.newContext({
      ...phone,
      // The fluid simulator is driven by PanResponder, which needs mouse events on web.
      hasTouch: false,
      isMobile: false,
    })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') console.warn(`  page error | ${message.text()}`)
    })
    const viewport = page.viewportSize()

    // The splash screen auto-advances to /home after 2.5s — capture it mid milk-fill.
    await capture(page, { baseUrl, path: '/', name: 'splash', settleMs: 1_200, outDir })
    await capture(page, { baseUrl, path: '/home', name: 'home', settleMs: 2_400, outDir })
    await capture(page, {
      baseUrl,
      path: '/rosetta',
      name: 'rosetta',
      settleMs: 2_500,
      outDir,
      before: async (activePage) => {
        await pourRosetta(activePage, viewport)
        await sleep(1_500)
      },
    })

    // Still on /rosetta with milk in the cup — open the settings modal over it.
    console.log('> settings: rosetta settings modal')
    await page.getByText('⚙').click()
    await sleep(1_000)
    const settingsFile = resolve(outDir, 'settings.png')
    await page.screenshot({ path: settingsFile })
    console.log(`  wrote ${settingsFile}`)

    await capture(page, { baseUrl, path: '/about', name: 'about', settleMs: 1_200, outDir })

    console.log('\nDone. Check that rosetta.png shows poured milk — if the cup is empty,')
    console.log('rerun with `yarn screenshots --headed` to use the real GPU.')
  } finally {
    if (browser) await browser.close()
    if (server) {
      server.kill('SIGTERM')
      // Give expo a moment to shut down before the process exits.
      await sleep(500)
      if (!server.killed) server.kill('SIGKILL')
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
