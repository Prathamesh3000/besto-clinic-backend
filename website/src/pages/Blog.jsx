import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Calendar, Clock } from 'lucide-react';
import SEO from '../components/common/SEO';
import Btn from '../components/common/Btn';
import BlogCard from '../components/blog/BlogCard';
import { EASE, VP } from '../components/common/designSystem';
import { blogPosts, categories } from '../data/blog';

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState('All');
  const featured = blogPosts[0];

  const nonFeatured = blogPosts.slice(1);
  const realCategories = categories.filter((c) => c !== 'All');

  const filtered = activeCategory === 'All'
    ? nonFeatured
    : nonFeatured.filter((p) => p.category === activeCategory);

  return (
    <>
      <SEO
        title="Blog"
        description="Insights, guides, and best practices for dental practice management."
        keywords="dental blog, practice management tips, dental industry insights"
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-20 lg:pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="inline-block px-4 py-1.5 bg-white/10 text-white text-sm font-semibold rounded-full mb-6 tracking-wide uppercase border border-white/20">
              Blog
            </span>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold font-display text-white leading-tight mb-6">
              Insights for modern dental practices
            </h1>
            <p className="text-lg text-primary-100/80 leading-relaxed max-w-2xl mx-auto">
              Practical guides, industry trends, and expert advice to help you grow your practice.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Featured Article */}
      {featured && (
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <Link
                to={`/blog/${featured.slug}`}
                className="grid lg:grid-cols-2 gap-0 bg-white rounded-3xl border border-neutral-200 overflow-hidden hover:border-primary-200 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-12 lg:p-16 min-h-[240px]">
                  <span className="text-6xl font-bold font-display text-primary-200/60">Featured</span>
                </div>
                <div className="p-8 lg:p-12 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="inline-block px-3 py-1 bg-primary-50/80 text-primary-700 text-xs font-semibold rounded-full border border-primary-200/40">
                      {featured.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                      <Clock className="w-3 h-3" /> {featured.readTime}
                    </span>
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold font-display text-neutral-900 mb-4 leading-tight group-hover:text-primary-700 transition-colors">
                    {featured.title}
                  </h2>
                  <p className="text-neutral-600 leading-relaxed mb-6">{featured.excerpt}</p>
                  <div className="flex items-center gap-3 text-sm text-neutral-500">
                    <span className="font-medium text-neutral-700">{featured.author}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(featured.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>
        </section>
      )}

      {/* Category Pills */}
      <section className="py-8 bg-white border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {activeCategory === 'All' ? (
            /* Per-category sections */
            realCategories.map((category) => {
              const catPosts = nonFeatured.filter((p) => p.category === category);
              if (catPosts.length === 0) return null;
              return (
                <div key={category} className="mb-16 last:mb-0">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-bold font-display text-neutral-900">{category}</h3>
                    <button
                      onClick={() => setActiveCategory(category)}
                      className="text-sm font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 cursor-pointer"
                    >
                      View All <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {catPosts.slice(0, 3).map((post) => (
                      <BlogCard key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            /* Filtered grid */
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                {filtered.length > 0 ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map((post) => (
                      <BlogCard key={post.id} post={post} />
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-neutral-500 py-12">No posts found in this category.</p>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-10 lg:p-16 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold font-display text-white mb-4">
                Ready to modernize your practice?
              </h2>
              <p className="text-primary-100/80 text-lg max-w-xl mx-auto mb-8">
                Join the clinics already using BestoClinic.
              </p>
              <Btn variant="ctaWhite" to="/register">
                Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Btn>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
