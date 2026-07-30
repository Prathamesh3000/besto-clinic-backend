import { useParams, Link } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { blogPosts } from '../data/blog';
import { ArrowLeft, Clock, Calendar } from 'lucide-react';

export default function BlogPost() {
  const { slug } = useParams();
  const post = blogPosts.find((p) => p.slug === slug);

  if (!post) {
    return (
      <section className="pt-36 lg:pt-44 pb-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold font-display text-neutral-900 mb-4">Post Not Found</h1>
          <Link to="/blog" className="text-primary-600 hover:text-primary-700 font-medium">
            &larr; Back to Blog
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <SEO title={post.title} description={post.excerpt} />

      <article className="pt-36 lg:pt-44 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>

          <span className="inline-block px-4 py-1.5 bg-primary-50/80 text-primary-700 text-sm font-semibold rounded-full mb-4 border border-primary-200/40">
            {post.category}
          </span>

          <h1 className="text-3xl lg:text-4xl font-bold font-display text-neutral-900 mb-4 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-4 text-sm text-neutral-500 mb-8 pb-8 border-b border-neutral-200">
            <span className="font-medium text-neutral-700">{post.author}</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {post.readTime}
            </span>
          </div>

          <div className="prose max-w-none">
            <p className="text-lg text-neutral-600 leading-relaxed mb-6">{post.excerpt}</p>
            <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-8 text-center text-neutral-400">
              <p className="text-sm">Full blog content would be loaded from your CMS or API.</p>
              <p className="text-sm mt-1">Connect this page to your backend content management system.</p>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
