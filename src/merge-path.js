const fs = require('fs')
const paper = require('paper-jsdom')

const inputFile = process.argv[2] || 'simple.svg'
const svg = fs.readFileSync(inputFile, 'utf8')

// 從 SVG 的 width/height 或 viewBox 決定 scope 大小
const wMatch = svg.match(/\bwidth="([^"]+)"/)
const hMatch = svg.match(/\bheight="([^"]+)"/)
const vbMatch = svg.match(/\bviewBox="([^"]+)"/)
let svgW = 1000, svgH = 1000
if (wMatch && hMatch) {
  svgW = parseFloat(wMatch[1])
  svgH = parseFloat(hMatch[1])
} else if (vbMatch) {
  const [, , vbW, vbH] = vbMatch[1].split(/[\s,]+/).map(Number)
  svgW = vbW; svgH = vbH
}

const scope = new paper.PaperScope()
scope.setup(new scope.Size(svgW, svgH))
scope.project.importSVG(svg, { expandShapes: true })

// ── 工具：沿 parent chain 取 resolved fillColor ──────────────────────────────
function resolvedFill(item) {
  let cur = item
  while (cur) {
    if (cur.fillColor !== null) return cur.fillColor
    cur = cur.parent
  }
  return null
}

// ── Step 1：取出 root group 的直接子項（PathItem 或 CompoundPath）─────────────
// 使用直接 children 而非 getItems({ class: Path })：
//   getItems 會遞迴進入 CompoundPath 把子路徑拆出，造成數量暴增、
//   且破壞 CompoundPath 整體語義（evenodd fill rule 等）。
const rootGroup = scope.project.activeLayer.children[0]
const allItems = Array.from(rootGroup.children).filter(
  c => c instanceof scope.Path || c instanceof scope.CompoundPath
)

// ── Step 2：展平 + 繼承 fill ──────────────────────────────────────────────────
// simple.svg 的 group 沒有 transform，搬移後座標不變。
const layer = scope.project.activeLayer
for (const item of allItems) {
  const fill = resolvedFill(item)
  if (fill) item.fillColor = fill   // 確保 fill 寫到 item 本身（不靠繼承）
  layer.addChild(item)              // 移至 activeLayer（保留文件 z-order）
}

// ── Step 3：只對 simple Path（非 CompoundPath）做合併 ─────────────────────────
// CompoundPath 本身的拓撲（洞、evenodd）有意義，整體保留不動。
const simplePaths = allItems.filter(c => c instanceof scope.Path)

// 依 fillColor 分組
const groups = {}
for (const path of simplePaths) {
  const key = path.fillColor ? path.fillColor.toCSS(true) : 'none'
  if (!groups[key]) groups[key] = []
  groups[key].push(path)
}

/**
 * 嘗試合併 a 與 b：
 * - unite() 結果須是 Path（非 CompoundPath）
 * - 合併後面積須顯著大於兩者中較大者（排除「A 包含 B」的情況）
 */
function tryMerge(a, b) {
  const aArea = Math.abs(a.area)
  const bArea = Math.abs(b.area)
  const maxArea = Math.max(aArea, bArea)

  const united = a.unite(b)

  if (!(united instanceof scope.Path)) {
    united.remove()
    return null
  }

  const unitedArea = Math.abs(united.area)
  // grow ≈ 0  → 包含關係，不合併（z-order 敏感）
  // grow > 0  → 共邊相鄰，合併後面積有實質增加
  const grow = maxArea > 0 ? (unitedArea - maxArea) / maxArea : 0
  if (grow < 1e-4) {
    united.remove()
    return null
  }

  united.fillColor = a.fillColor
  return united
}

for (const members of Object.values(groups)) {
  let changed = true
  while (changed) {
    changed = false
    outer:
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i]
        const b = members[j]

        // 快速預篩：bounding box 擴 1px 後不相交，必定不相鄰
        if (!a.bounds.expand(1).intersects(b.bounds)) continue

        const united = tryMerge(a, b)
        if (!united) continue

        // ─── 保留 z-order ─────────────────────────────────────────────────
        // 所有 item 已在同一 parent（activeLayer），insertBelow 可正確運作。
        const lower = a.index < b.index ? a : b
        united.insertBelow(lower)

        a.remove()
        b.remove()
        members.splice(j, 1)
        members.splice(i, 1, united)
        changed = true
        break outer
      }
    }
  }
}

process.stdout.write(scope.project.exportSVG({ asString: true }))
