/**
 * 站点可能被部署到子路径（例如 GitHub Pages 的 /MidoriWebSite/）。
 * 内容 JSON 里的图片路径都写成 /models/... 这种根路径，这里统一补上 base 前缀。
 *
 * BASE_URL 默认是 "/"，此时 asset() 原样返回，服务器部署行为不变。
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "")

export function asset(path: string) {
  if (!path) return path
  // 外链、data: / blob: 不动
  if (!path.startsWith("/") || path.startsWith("//")) return path
  return `${BASE}${path}`
}
