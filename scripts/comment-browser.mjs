import fs from 'fs'

let content = fs.readFileSync('src/styles/main-theme-redesign.css', 'utf8')

const lines = content.split('\n')
const result = []
let inBrowserBlock = false
let braceDepth = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  
  if (!inBrowserBlock && (
    line.includes('.browser-shell') ||
    line.includes('.browser-tabs') ||
    line.includes('.browser-tree') ||
    line.includes('.tree-folder') ||
    line.includes('.tree-item') ||
    line.includes('.plugin-item') ||
    line.includes('.browser-hint') ||
    line.includes('.browser-rescan')
  ) && line.includes('{')) {
    inBrowserBlock = true
    braceDepth = 1
    result.push('/* MIGRATED to browser.css: ' + line.trim() + ' */')
    continue
  }
  
  if (inBrowserBlock) {
    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') braceDepth--
    }
    result.push('/* ' + line + ' */')
    if (braceDepth === 0) {
      inBrowserBlock = false
    }
    continue
  }
  
  result.push(line)
}

fs.writeFileSync('src/styles/main-theme-redesign.css', result.join('\n'))
console.log('Done commenting browser blocks')
