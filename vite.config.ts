import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// 网站只负责展示。模型内容由 ../MIDORIadmin 后台直接写入 src/content/models.json 和 public/models。
export default defineConfig({
  plugins: [react()],
})
