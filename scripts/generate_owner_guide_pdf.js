const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

async function generatePdf() {
  const mdContent = fs.readFileSync(path.join(__dirname, '../docs/OWNER-GUIDE.md'), 'utf-8');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  // Read logo as base64
  const logoPath = path.join(__dirname, '../public/brand/edubridge-logo-color.svg');
  const logoSvg = fs.readFileSync(logoPath, 'utf-8');
  const logoBase64 = `data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`;

  // Convert basic markdown to clean HTML
  let htmlBody = mdContent
    .replace(/^# (.*$)/gim, '<h1 class="doc-title">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 class="section-title">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 class="sub-title">$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/^---$/gim, '<hr/>');

  // Convert tables
  const lines = htmlBody.split('\n');
  let inTable = false;
  let tableHtml = '';
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table class="guide-table"><thead>';
        const headers = line.split('|').slice(1, -1).map(h => `<th>${h.trim()}</th>`).join('');
        tableHtml += `<tr>${headers}</tr></thead><tbody>`;
        // skip separator line if next
        if (i + 1 < lines.length && lines[i + 1].includes('---')) {
          i++;
        }
      } else {
        const cells = line.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
        tableHtml += `<tr>${cells}</tr>`;
      }
    } else {
      if (inTable) {
        inTable = false;
        tableHtml += '</tbody></table>';
        newLines.push(tableHtml);
      }
      if (line.startsWith('- ')) {
        newLines.push(`<li class="list-item">${line.slice(2)}</li>`);
      } else if (/^\d+\.\s/.test(line)) {
        newLines.push(`<li class="ordered-item">${line.replace(/^\d+\.\s/, '')}</li>`);
      } else if (line.startsWith('> ')) {
        newLines.push(`<blockquote class="callout">${line.slice(2)}</blockquote>`);
      } else if (line.length > 0 && !line.startsWith('<h') && !line.startsWith('<hr')) {
        newLines.push(`<p class="guide-p">${line}</p>`);
      } else {
        newLines.push(line);
      }
    }
  }
  if (inTable) {
    tableHtml += '</tbody></table>';
    newLines.push(tableHtml);
  }

  htmlBody = newLines.join('\n');

  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>EduBridge Education — Owner Operating Guide</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
    
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-right {
        content: counter(page);
      }
    }

    body {
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0A0A0A;
      line-height: 1.6;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }

    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #00A57E;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }

    .header-logo {
      height: 48px;
    }

    .header-meta {
      text-align: right;
      font-size: 9pt;
      color: #6B7272;
    }

    .doc-title {
      font-size: 22pt;
      color: #0A0A0A;
      margin-top: 10px;
      margin-bottom: 6px;
      font-weight: 700;
    }

    .section-title {
      font-size: 14pt;
      color: #00A57E;
      margin-top: 24px;
      margin-bottom: 10px;
      border-left: 4px solid #00A57E;
      padding-left: 10px;
      font-weight: 600;
      page-break-after: avoid;
    }

    .sub-title {
      font-size: 11pt;
      color: #0A0A0A;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 600;
      page-break-after: avoid;
    }

    .guide-p {
      margin-top: 6px;
      margin-bottom: 10px;
      color: #2D3748;
    }

    .callout {
      border-left: 4px solid #00A57E;
      background: #E6F6F2;
      padding: 10px 14px;
      margin: 10px 0;
      border-radius: 0 8px 8px 0;
      color: #00805F;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }

    .guide-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }

    .guide-table th {
      background-color: #E6F6F2;
      color: #00805F;
      text-align: left;
      padding: 8px 12px;
      border: 1px solid #CCEDE5;
      font-weight: 600;
    }

    .guide-table td {
      padding: 8px 12px;
      border: 1px solid #E4E7E7;
      vertical-align: top;
    }

    code {
      font-family: monospace;
      background: #F5F6F6;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 9pt;
      color: #00805F;
    }

    .list-item, .ordered-item {
      margin-bottom: 4px;
      color: #2D3748;
    }

    hr {
      border: 0;
      border-top: 1px solid #E4E7E7;
      margin: 20px 0;
    }

    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #E4E7E7;
      font-size: 8.5pt;
      color: #6B7272;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <img src="${logoBase64}" class="header-logo" alt="EduBridge Logo" />
    <div class="header-meta">
      <strong>TRN: 105215478600003</strong><br/>
      Dubai, United Arab Emirates<br/>
      portal.edubridgeeducation.com
    </div>
  </div>

  ${htmlBody}

  <div class="footer">
    <span>EduBridge Education © 2026 — Official Operations Manual</span>
    <span>Keep receipt vouchers for future references</span>
  </div>
</body>
</html>
  `;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

  const outPdf = path.join(__dirname, '../docs/OWNER-GUIDE.pdf');
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15mm',
      bottom: '15mm',
      left: '15mm',
      right: '15mm',
    },
  });

  await browser.close();
  console.log('Successfully generated docs/OWNER-GUIDE.pdf');
}

generatePdf().catch(console.error);
