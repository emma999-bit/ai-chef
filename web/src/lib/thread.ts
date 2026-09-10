export type ThreadMeta = {
  id: string;
  title: string;
  updatedAt: number;
};

const LIST_KEY = "personal-chef-threads";
const ACTIVE_KEY = "personal-chef-thread-id";

export function loadThreads(): ThreadMeta[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    const list = raw ? (JSON.parse(raw) as ThreadMeta[]) : [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveThreads(list: ThreadMeta[]): void {
  window.localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

/** 每次打开页面都开一条空白对话，不恢复上次正在看的会话。 */
export function startFreshThreadId(): string {
  const id = crypto.randomUUID();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_KEY, id);
  }
  return id;
}

export function setActiveThreadId(id: string): void {
  window.localStorage.setItem(ACTIVE_KEY, id);
}

/** 首条消息发出后把会话记入侧栏；已存在则刷新时间。 */
export function upsertThread(id: string, title: string): ThreadMeta[] {
  const list = loadThreads();
  const found = list.find((item) => item.id === id);
  if (found) {
    found.updatedAt = Date.now();
  } else {
    list.unshift({ id, title: title || "新对话", updatedAt: Date.now() });
  }
  saveThreads(list);
  return loadThreads();
}

export function removeThread(id: string): ThreadMeta[] {
  const list = loadThreads().filter((item) => item.id !== id);
  saveThreads(list);
  return list;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 2 * day) return "昨天";
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}周前`;
  return `${Math.floor(diff / (30 * day))}月前`;
}
