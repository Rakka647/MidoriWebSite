import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// 网站只负责展示。模型内容由 ../MIDORIadmin 后台直接写入 src/content/models.json 和 public/models。
// SITE_BASE 用于部署到子路径（GitHub Pages 项目站点 = /MidoriWebSite/）；不设时是根路径，
// 也就是现在香港服务器用的那种。src/base.ts 会把它拼到内容 JSON 里的图片路径前面。
export default defineConfig({
  base: process.env.SITE_BASE || "/",
  plugins: [react()],
})
