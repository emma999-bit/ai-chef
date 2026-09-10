"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  clearThreadOnServer,
  fetchMessages,
  streamChat,
  uploadIngredientImage,
} from "@/lib/api";
import {
  ThreadMeta,
  formatRelative,
  loadThreads,
  startFreshThreadId,
  removeThread,
  setActiveThreadId,
  upsertThread,
} from "@/lib/thread";
import { formatChefMarkdown } from "@/lib/chefMarkdown";
import styles from "./ChefChat.module.css";

type Role = "user" | "chef" | "system";

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  imageUrl?: string;
};

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

export function ChefChat() {
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuFor) {
      return;
    }
    const close = () => setMenuFor(null);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuFor]);

  useEffect(() => {
    setThreads(loadThreads());
    setActiveId(startFreshThreadId());
    setMessages([]);
  }, []);

  useEffect(() => {
    if (!activeId) {
      return;
    }
    // 空白新对话不拉历史；只有点侧栏已有会话才加载
    if (!loadThreads().some((item) => item.id === activeId)) {
      return;
    }
    let cancelled = false;
    fetchMessages(activeId)
      .then((history) => {
        if (!cancelled) {
          setMessages(
            history.map((item) => ({
              id: crypto.randomUUID(),
              role: item.role,
              text: item.text,
              imageUrl: item.imageUrl,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  function onPickFile(next: File | null) {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  function switchThread(id: string) {
    if (busy || id === activeId) {
      return;
    }
    setActiveId(id);
    setActiveThreadId(id);
  }

  function newThread() {
    if (busy) {
      return;
    }
    if (messages.length === 0 && !threads.some((t) => t.id === activeId)) {
      return; // 当前就是空白新对话
    }
    const id = crypto.randomUUID();
    setMessages([]);
    setActiveId(id);
    setActiveThreadId(id);
  }

  function deleteThread(id: string) {
    if (busy) {
      return;
    }
    setMenuFor(null);
    // 服务端删除失败不阻断本地移除
    void clearThreadOnServer(id).catch(() => undefined);
    setThreads(removeThread(id));
    if (id === activeId) {
      const next = crypto.randomUUID();
      setMessages([]);
      setActiveId(next);
      setActiveThreadId(next);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !file) || busy || !activeId) {
      return;
    }

    setBusy(true);
    let imageUrl: string | undefined;
    try {
      if (file) {
        imageUrl = await uploadIngredientImage(file);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: error instanceof Error ? error.message : "上传失败",
        },
      ]);
      setBusy(false);
      return;
    }

    const userText = text || "看看这些食材能做什么。";
    const chefId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: userText, imageUrl },
      { id: chefId, role: "chef", text: "" },
    ]);
    setDraft("");
    onPickFile(null);
    setThreads(upsertThread(activeId, userText.slice(0, 16)));

    try {
      await streamChat(
        { message: userText, image_url: imageUrl, thread_id: activeId },
        (delta) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === chefId ? { ...item, text: item.text + delta } : item,
            ),
          );
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "对话失败";
      setMessages((current) =>
        current.map((item) =>
          item.id === chefId ? { ...item, role: "system", text: message } : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h1 className={styles.brand}>AI私厨</h1>
        <button
          type="button"
          className={styles.newChat}
          onClick={newThread}
          disabled={busy}
        >
          <PlusIcon />
          新对话
        </button>
        {threads.length > 0 && <p className={styles.sectionLabel}>历史对话</p>}
        <ul className={styles.history}>
          {threads.map((thread) => (
            <li key={thread.id} className={styles.threadItem}>
              <button
                type="button"
                className={
                  thread.id === activeId
                    ? `${styles.threadBtn} ${styles.threadActive}`
                    : styles.threadBtn
                }
                onClick={() => switchThread(thread.id)}
              >
                <BubbleIcon />
                <span className={styles.threadTitle}>{thread.title}</span>
                <span className={styles.threadTime}>
                  {formatRelative(thread.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                className={styles.menuBtn}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() =>
                  setMenuFor(menuFor === thread.id ? null : thread.id)
                }
                aria-label={`对话选项：${thread.title}`}
                aria-expanded={menuFor === thread.id}
              >
                <DotsIcon />
              </button>
              {menuFor === thread.id && (
                <div
                  className={styles.menuPop}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => deleteThread(thread.id)}
                    disabled={busy}
                  >
                    <TrashIcon />
                    删除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.main}>
        <div className={styles.board} ref={scroller}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <ChefHatArt />
              <h2 className={styles.emptyTitle}>有什么我能帮您的吗</h2>
              <p className={styles.emptySub}>上传食材图片，获取个性化食谱推荐</p>
            </div>
          ) : (
            <div className={styles.thread}>
              {messages.map((item) => (
                <article
                  key={item.id}
                  className={
                    item.role === "user"
                      ? styles.turnUser
                      : item.role === "system"
                        ? styles.turnSystem
                        : styles.turnChef
                  }
                >
                  {item.imageUrl && (
                    // OSS 域名不固定，用原生 img 避免 next/image 远程白名单
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.shot} src={item.imageUrl} alt="食材" />
                  )}
                  {item.text ? (
                    item.role === "chef" ? (
                      <div className={styles.bubbleChef}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // eslint-disable-next-line @next/next/no-img-element
                            img: (props) => (
                              // OSS/外站图片域名不固定，用原生 img
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={props.src}
                                alt={props.alt ?? "食谱配图"}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ),
                          }}
                        >
                          {formatChefMarkdown(item.text)}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className={styles.bubbleUser}>{item.text}</p>
                    )
                  ) : null}
                  {item.role === "chef" && !item.text && busy ? (
                    <p className={styles.pending}>正在看食材…</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className={styles.inputWrap}>
          <form className={styles.inputBar} onSubmit={onSubmit}>
            <input
              ref={fileInput}
              className={styles.hidden}
              type="file"
              accept={ACCEPT}
              onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
            />
            {preview && (
              <div className={styles.previewRow}>
                <span className={styles.previewThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="待上传的食材" />
                  <button
                    type="button"
                    onClick={() => onPickFile(null)}
                    aria-label="取下这张图"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
            <input
              className={styles.field}
              value={draft}
              placeholder={'输入你的问题，比如"番茄和鸡蛋怎么做好吃？"'}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.imageBtn}
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                aria-label="上传食材图片"
              >
                <ImageIcon />
              </button>
              <button
                className={styles.sendBtn}
                type="submit"
                disabled={busy || (!draft.trim() && !file)}
                aria-label="发送"
              >
                <SendIcon />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2 3.5h12v7H8l-3 3v-3H2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="3" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M2.5 4h11M6.5 2h3M4 4l.8 10h6.4L12 4M6.5 7v4M9.5 7v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <rect x="1.5" y="2.5" width="15" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.2" cy="7" r="1.4" fill="currentColor" />
      <path d="M3 13.5l4-4 3 3 2.5-2.5 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <path d="M2 9l14-6.5L11.5 16l-2.3-5.2L2 9z" fill="currentColor" />
      <path d="M9.2 10.8L16 2.5" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

function ChefHatArt() {
  return (
    <svg
      className={styles.hatArt}
      width="200"
      height="120"
      viewBox="0 0 200 120"
      role="img"
      aria-label="厨师帽"
    >
      {/* 打蛋器 */}
      <g stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M40 46l12 22" />
        <path d="M52 68c-6 4-6 12-1 14M52 68c6 4 8 12 3 14M52 68c0 5 1 12 1 14" />
      </g>
      {/* 帽子 */}
      <g>
        <path
          d="M78 62c-9 0-15-8-12-16 2-6 9-9 14-7 1-8 9-14 20-14s19 6 20 14c5-2 12 1 14 7 3 8-3 16-12 16v14H78V62z"
          fill="#fff"
          stroke="var(--ink)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <rect x="78" y="80" width="44" height="10" rx="3" fill="#fff" stroke="var(--ink)" strokeWidth="2.5" />
        <path d="M92 68l3 6M108 68l-3 6" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* 叶子 */}
      <g stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M156 52c4 10 2 20-4 28" />
        <path d="M156 60c5-2 9-7 9-12-6 0-10 3-9 12zM153 72c-5-1-8-5-9-10 6-1 10 3 9 10z" fill="var(--cream-side)" />
      </g>
      {/* 星光 */}
      <g fill="var(--accent)">
        <path d="M62 22l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" />
        <path d="M142 26l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" />
        <circle cx="150" cy="14" r="1.6" />
        <circle cx="52" cy="36" r="1.4" />
      </g>
    </svg>
  );
}
