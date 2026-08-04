import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collectCategories } from '../../lib/posts'
import { usePostIndex } from '../../lib/usePostIndex'

interface FilterBarProps {
  /** 활성 알약 — 'ALL'(홈) 또는 카테고리 이름. 생략 시 활성 없음(태그·검색 페이지) */
  active?: string
  /** 검색 인풋 초깃값 (검색 결과 페이지에서 질의어 유지) */
  initialQuery?: string
}

/**
 * 목록 상단 스티키 필터 바 — 검색 인풋 + 카테고리 알약(카운트, 0건 포함).
 * 구 사이드바 CATEGORIES 접이식 목록의 새 거처: 분류 체계를 첫 화면에 상시 노출한다.
 * 알약은 라우트 이동(HashRouter 유지)이라 URL이 공유 가능하다.
 */
function FilterBar({ active, initialQuery = '' }: FilterBarProps) {
  const { posts, categories: allNames } = usePostIndex()
  const categories = collectCategories(posts, allNames)
  const [query, setQuery] = useState(initialQuery)
  const navigate = useNavigate()

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate(`/search/${encodeURIComponent(q)}`)
  }

  return (
    <div className="filter-bar">
      <form className="filter-bar__search" onSubmit={submitSearch} role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목·태그·헤더로 검색…"
          aria-label="게시물 검색"
        />
      </form>
      <nav className="filter-bar__cats" aria-label="카테고리 필터">
        <Link className={`filter-pill${active === 'ALL' ? ' active' : ''}`} to="/posts">
          ALL <span className="count">{posts.length}</span>
        </Link>
        {[...categories.entries()].map(([name, count]) => (
          <Link
            key={name}
            className={`filter-pill${active === name ? ' active' : ''}${
              count === 0 ? ' filter-pill--empty' : ''
            }`}
            to={`/category/${encodeURIComponent(name)}`}
          >
            {name} <span className="count">{count}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}

export default FilterBar
