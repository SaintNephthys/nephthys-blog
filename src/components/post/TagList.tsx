import { Link } from 'react-router-dom'

interface TagListProps {
  tags: string[]
}

function TagList({ tags }: TagListProps) {
  if (tags.length === 0) return null
  return (
    <div className="post-card__tags">
      {tags.map((tag) => (
        <Link
          key={tag}
          to={`/tag/${encodeURIComponent(tag)}`}
          className="tag-chip"
          onClick={(e) => e.stopPropagation()}
        >
          #{tag}
        </Link>
      ))}
    </div>
  )
}

export default TagList
