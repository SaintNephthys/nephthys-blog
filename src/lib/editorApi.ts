/**
 * 로컬 dev 서버의 에디터 API 클라이언트.
 * 배포된 정적 사이트에는 /api 엔드포인트가 없으므로 항상 실패한다 —
 * EditorPage는 DEV 모드가 아니면 이 모듈을 호출하지 않는다.
 */

export interface EditorPostMeta {
  slug: string
  title: string
  date: string
  tags: string[]
  summary: string
  draft: boolean
}

export interface EditorPost extends EditorPostMeta {
  content: string
}

export interface DeployPreview {
  publish: string[]
  unpublish: string[]
  update: string[]
  drafts: string[]
  hasChanges: boolean
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`)
  return data
}

export function listPosts(): Promise<{ posts: EditorPostMeta[] }> {
  return request('/api/posts')
}

export function getPost(slug: string): Promise<EditorPost> {
  return request(`/api/posts/${encodeURIComponent(slug)}`)
}

export function savePost(post: EditorPost): Promise<{ ok: boolean }> {
  return request(`/api/posts/${encodeURIComponent(post.slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(post),
  })
}

export function deletePost(slug: string): Promise<{ ok: boolean }> {
  return request(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' })
}

export function fetchDeployPreview(): Promise<DeployPreview> {
  return request('/api/deploy/preview')
}

export function deploy(message: string): Promise<{ log: string[] }> {
  return request('/api/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}
