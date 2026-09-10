export type ChatPayload = {
  message: string;
  image_url?: string;
  thread_id: string;
};

export type PresignResponse = {
  uploadUrl: string;
  contentType: string;
  accessUrl: string;
};

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export function objectKeyFor(file: File): string {
  const original = file.name || "ingredient.jpg";
  const ext = original.includes(".")
    ? original.split(".").pop()!.toLowerCase()
    : "jpg";
  const safeExt = IMAGE_EXT.has(ext) ? ext : "jpg";
  const base = original
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fff.-]+/g, "_")
    .slice(0, 40);
  return `${crypto.randomUUID()}-${base}.${safeExt}`;
}

export async function presignUpload(filename: string): Promise<PresignResponse> {
  const url = `/api/v1/oss/presign?filename=${encodeURIComponent(filename)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`申请上传地址失败（${res.status}）。请确认 FastAPI 已在 8001 启动。`);
  }
  return (await res.json()) as PresignResponse;
}

export async function putObject(uploadUrl: string, file: File, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) {
    throw new Error(
      "图片没传到 OSS。请在 Bucket CORS 中允许当前页面来源的 PUT，并放行 Content-Type。",
    );
  }
}

export async function uploadIngredientImage(file: File): Promise<string> {
  const key = objectKeyFor(file);
  const signed = await presignUpload(key);
  await putObject(signed.uploadUrl, file, signed.contentType || file.type);
  return signed.accessUrl;
}

export async function streamChat(
  payload: ChatPayload,
  onDelta: (text: string) => void,
): Promise<void> {
  const res = await fetch("/api/v1/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`对话请求失败（${res.status}）。`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || !res.body) {
    const raw = await res.text();
    if (!raw || raw === "null") {
      throw new Error("对话接口还没接通：/api/v1/chat/stream 目前是空实现。");
    }
    onDelta(raw);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      received = true;
      onDelta(parseStreamChunk(chunk));
    }
  }
  if (!received) {
    throw new Error("对话接口还没接通：没有返回任何内容。");
  }
}

export type HistoryEntry = {
  role: "user" | "chef";
  text: string;
  imageUrl?: string;
};

/** 后端 content 可能是纯文本，也可能是多模态数组（图 + 文）。 */
function normalizeContent(content: unknown): { text: string; imageUrl?: string } {
  if (typeof content === "string") {
    return { text: content };
  }
  if (Array.isArray(content)) {
    let text = "";
    let imageUrl: string | undefined;
    for (const part of content) {
      if (part && typeof part === "object" && "type" in part) {
        const p = part as { type: string; text?: string; url?: string };
        if (p.type === "text") {
          text += p.text ?? "";
        } else if (p.type === "image" && p.url) {
          imageUrl = p.url;
        }
      }
    }
    return { text, imageUrl };
  }
  return { text: content == null ? "" : String(content) };
}

export async function fetchMessages(threadId: string): Promise<HistoryEntry[]> {
  const res = await fetch(
    `/api/v1/chat/messages?thread_id=${encodeURIComponent(threadId)}`,
  );
  if (!res.ok) {
    throw new Error(`历史消息加载失败（${res.status}）。`);
  }
  const data = (await res.json()) as {
    messages?: { role: string; content: unknown }[];
  } | null;
  const items = Array.isArray(data?.messages) ? data.messages : [];
  return items.map((item) => ({
    role: item.role === "user" ? ("user" as const) : ("chef" as const),
    ...normalizeContent(item.content),
  }));
}

export async function clearThreadOnServer(threadId: string): Promise<void> {
  await fetch(`/api/v1/chat/messages?thread_id=${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

function parseStreamChunk(chunk: string): string {
  if (!chunk.includes("data:")) {
    return chunk;
  }
  return chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((data) => data && data !== "[DONE]")
    .join("");
}
