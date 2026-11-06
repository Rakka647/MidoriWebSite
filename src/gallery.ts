import raw from "./content/gallery.json" with { type: "json" }
import { asset } from "./base"

export type GalleryItem = {
  id: string
  /** 序号，只用来在图片旁边显示 #032 这样的小标记 */
  no: number
  /** 点开后看的大图 */
  image: string
  /** 铺满页面的小图；没有就用大图 */
  thumb?: string
  author: string
  /** 2025.07.08 这样的文字 */
  date: string
  comment: string
  /** 用到的模型 id（对应 models.json） */
  models: string[]
}

export const galleryItems = (raw as GalleryItem[])
  .filter((item) => item && item.image)
  .map((item) => ({ ...item, image: asset(item.image), thumb: item.thumb ? asset(item.thumb) : item.thumb }))

export function galleryLabel(item: Pick<GalleryItem, "no">) {
  return `#${String(item.no).padStart(3, "0")}`
}
