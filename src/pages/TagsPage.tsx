import { Link } from 'react-router-dom'
import PageHero from '../components/widgets/PageHero'
import Panel from '../components/widgets/Panel'
import { collectTags } from '../lib/posts'
import { usePostIndex } from '../lib/usePostIndex'

function TagsPage() {
  const { posts, loading, error } = usePostIndex()
  const tags = collectTags(posts)

  return (
    <>
      <PageHero title="TAGS" subtitle={`태그 ${tags.size}건`} />
      {loading && <div className="loading">LOADING</div>}
      {error && <div className="empty-note">{error}</div>}
      {!loading && !error && (
        <Panel title="TAG INDEX">
          <div className="post-card__tags">
            {[...tags.entries()].map(([tag, count]) => (
              <Link
                key={tag}
                to={`/tag/${encodeURIComponent(tag)}`}
                className="tag-chip"
              >
                #{tag} ({count})
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </>
  )
}

export default TagsPage
