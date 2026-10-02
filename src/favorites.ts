import { useCallback, useSyncExternalStore } from "react"

/** 保存在 localStorage 的「id 列表」，收藏和点赞共用。 */
function createListStore(key: string) {
  const listeners = new Set<() => void>()
  let cache: string[] | null = null

  function read(): string[] {
    if (cache) return cache
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]")
      cache = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
    } catch {
      cache = []
    }
    return cache
  }

  function write(next: string[]) {
    cache = next
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // 存储被禁用时仍保持本次会话内有效
    }
    listeners.forEach((listener) => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return
      cache = null
      listener()
    }
    window.addEventListener("storage", onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener("storage", onStorage)
    }
  }

  return function useStore() {
    const list = useSyncExternalStore(subscribe, read, read)
    const toggle = useCallback((id: string) => {
      const current = read()
      write(current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    }, [])
    const add = useCallback((id: string) => {
      const current = read()
      if (!current.includes(id)) write([...current, id])
    }, [])
    return { list, has: (id: string) => list.includes(id), toggle, add }
  }
}

/** 收藏列表（键：midori-favorites）。 */
export const useFavorites = createListStore("midori-favorites")

/** 点赞列表（键：midori-likes）。 */
export const useLikes = createListStore("midori-likes")

/**
 * 服务器上的点赞数。现在还没有后端，所以先全部是 0；
 * 以后接上接口时只要改这里，页面上显示的是「服务器数 + 自己点的那一次」。
 */
export function serverLikes(id: string) {
  void id
  return 0
}
