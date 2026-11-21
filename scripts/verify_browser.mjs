import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const outDir = path.resolve('docs/screenshots')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

async function run() {
  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    const page = await browser.newPage()

    // 1. Logged out redirect
    console.log('Testing logged out redirect...')
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto('http://localhost:3000/students', { waitUntil: 'networkidle0' })
    const urlAfterRedirect = page.url()
    console.log('URL after accessing /students logged out:', urlAfterRedirect)
    await page.screenshot({ path: path.join(outDir, '01-logged-out-redirect.png') })

    // 2. Login page at 1280px
    console.log('Capturing login page at 1280px...')
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' })
    await page.screenshot({ path: path.join(outDir, '02-login-desktop-1280.png') })

    // 3. Login page at 375px
    console.log('Capturing login page at 375px...')
    await page.setViewport({ width: 375, height: 812, isMobile: true })
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' })
    await page.screenshot({ path: path.join(outDir, '03-login-mobile-375.png') })

    // 4. Owner Login (sales@edubridgeeducation.com)
    console.log('Logging in as Owner...')
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' })
    
    await page.type('input[name="email"]', 'sales@edubridgeeducation.com')
    await page.type('input[name="password"]', 'EduOwner2026!')
    await page.click('button[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
    await new Promise(r => setTimeout(r, 2000))
    console.log('URL after owner login:', page.url())

    // Capture desktop owner sidebar (Admin visible)
    await page.screenshot({ path: path.join(outDir, '04-owner-desktop-sidebar-admin.png') })

    // Capture mobile owner bottom nav at 375px (Admin visible)
    await page.setViewport({ width: 375, height: 812, isMobile: true })
    await new Promise(r => setTimeout(r, 1000))
    await page.screenshot({ path: path.join(outDir, '05-owner-mobile-bottomnav-admin.png') })

    // 5. Staff Login (staff@edubridgeeducation.com)
    console.log('Logging out / clearing session for staff test...')
    const client = await page.target().createCDPSession()
    await client.send('Network.clearBrowserCookies')
    await client.send('Network.clearBrowserCache')

    console.log('Logging in as Staff...')
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' })
    await page.type('input[name="email"]', 'staff@edubridgeeducation.com')
    await page.type('input[name="password"]', 'EduStaff2026!')
    await page.click('button[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
    await new Promise(r => setTimeout(r, 2000))
    console.log('URL after staff login:', page.url())

    // Capture desktop staff sidebar (No Admin visible)
    await page.screenshot({ path: path.join(outDir, '06-staff-desktop-no-admin.png') })

    // Navigate to /admin directly as staff -> expect 404
    console.log('Accessing /admin as staff...')
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' })
    console.log('URL for /admin:', page.url())
    await page.screenshot({ path: path.join(outDir, '07-staff-admin-404.png') })

    // 6. Reset password page
    console.log('Capturing reset password page...')
    await page.goto('http://localhost:3000/reset-password', { waitUntil: 'networkidle0' })
    await page.screenshot({ path: path.join(outDir, '08-reset-password-page.png') })

    console.log('All screenshots captured successfully!')
  } finally {
    await browser.close()
  }
}

run().catch(err => {
  console.error('Browser QA failed:', err)
  process.exit(1)
})
