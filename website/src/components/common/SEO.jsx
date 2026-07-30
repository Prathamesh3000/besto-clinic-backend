import { useEffect } from 'react';

export default function SEO({ title, description, keywords }) {
  useEffect(() => {
    document.title = title ? `${title} | BestoClinic` : 'BestoClinic - Modern Dental Practice Management Software';

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && description) {
      metaDescription.setAttribute('content', description);
    }

    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords && keywords) {
      metaKeywords.setAttribute('content', keywords);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && title) {
      ogTitle.setAttribute('content', title);
    }

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription && description) {
      ogDescription.setAttribute('content', description);
    }
  }, [title, description, keywords]);

  return null;
}
