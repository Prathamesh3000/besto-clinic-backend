import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';

export default function BlogCard({ post }) {
  return (
    <article className="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-lg hover:shadow-primary-100/50 hover:border-primary-200 transition-all duration-300 group">
      {/* Image placeholder */}
      <div className="h-48 bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center">
        <span className="text-4xl font-bold text-primary-200">BC</span>
      </div>

      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="px-2.5 py-1 bg-primary-50/80 text-primary-700 text-xs font-semibold rounded-full border border-primary-200/40">
            {post.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-neutral-900/40">
            <Clock className="w-3 h-3" />
            {post.readTime}
          </span>
        </div>

        <h3 className="text-lg font-semibold font-display text-neutral-900 mb-2 leading-snug group-hover:text-primary-600 transition-colors">
          <Link to={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>

        <p className="text-sm text-neutral-900/60 leading-relaxed mb-4">{post.excerpt}</p>

        <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
          <div className="text-xs text-neutral-900/50">
            <span className="font-medium text-neutral-900/70">{post.author}</span>
            <span className="mx-2">&middot;</span>
            {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <Link
            to={`/blog/${post.slug}`}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
          >
            Read <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
