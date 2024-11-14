import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import detectPlatforms from './detectors.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const staticFolder = path.join(__dirname, '../static')

export default async ({ req, res, log }) => {
  req.path = req.path.replace(/\/$/, '')
  
  log(`Incoming request path: ${req.path}`)
  log(`Query params: ${JSON.stringify(req.query)}`)
  
  const config = JSON.parse(process.env.CONFIG ?? '[]')
  
  if (config.length === 0) {
    throw new Error('CONFIG environment variable must be set')
  }
  
  // Tìm config phù hợp với path cơ bản (không bao gồm query params)
  const basePath = req.path.split('?')[0]
  const routeConfig = config.find(({ path }) => path === basePath)
  
  if (!routeConfig) {
    log(`No targets for path ${basePath}`)
    return res.empty()
  }

  // Lấy query parameters từ request
  const { screen, login_id, company_id } = req.query
  
  // Clone targets để không ảnh hưởng đến config gốc
  const targets = JSON.parse(JSON.stringify(routeConfig.targets))
  
  // Cập nhật appPath với query parameters động
  const queryString = `screen=${screen}&login_id=${login_id}&company_id=${company_id}`
  
  // Cập nhật appPath cho từng platform
  Object.keys(targets).forEach(platform => {
    if (targets[platform] && typeof targets[platform] === 'object') {
      targets[platform].appPath = `deeplink?${queryString}`
    }
  })

  const platforms = detectPlatforms(req.headers['user-agent'])
  log(`Detected platforms: ${platforms.join(', ')}`)

  for (const platform of platforms) {
    const target = targets[platform]
    if (!target) {
      log(`No redirect for platform ${platform}`)
      continue
    }

    if (platform === 'default') {
      log(`Default redirect for platform ${platform}`)
      return res.redirect(targets.default)
    }

    if (typeof target === 'string') {
      log(`Simple redirect to ${target}`)
      return res.redirect(target)
    }

    if (typeof target === 'object' && target.appName) {
      log(`Deep link to app=${target.appName} path=${target.appPath}`)

      const template = readFileSync(
        path.join(staticFolder, 'deeplink.html')
      ).toString()

      const html = template
        .split('{{APP_NAME}}')
        .join(target.appName)
        .split('{{APP_PATH}}')
        .join(target.appPath)
        .split('{{APP_PACKAGE}}')
        .join(target.appPackage ?? '')
        .split('{{FALLBACK}}')
        .join(target.fallback ?? target.default ?? '')

      return res.send(html, 200, {
        'Content-Type': 'text/html; charset=utf-8',
      })
    }
  }

  log(`Out of ideas, returning empty response`)
  return res.empty()
}
