import { useEffect } from 'react';

export const SITE_NAME = 'Logis';
export const SITE_URL = 'https://llogis.xyz';
export const DEFAULT_OG_IMAGE = 'https://llogis.xyz/logo_new.png';

function getOrCreateMeta(property?: string, name?: string): HTMLMetaElement {
  let selector: string;
  if (property) {
    selector = `meta[property="${property}"]`;
  } else if (name) {
    selector = `meta[name="${name}"]`;
  } else {
    throw new Error('Either property or name must be provided');
  }
  let el = document.querySelector(selector) as HTMLMetaElement;
  if (!el) {
    el = document.createElement('meta');
    if (property) el.setAttribute('property', property);
    if (name) el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  return el;
}

function getOrCreateLink(rel: string, href?: string): HTMLLinkElement {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    if (href) el.setAttribute('href', href);
    document.head.appendChild(el);
  }
  return el;
}

interface SEOMetaConfig {
  title: string;
  description: string;
  noIndex?: boolean;
  ogImage?: string;
  canonical?: string;
  jsonLd?: Record<string, any>;
}

export function useSEOMeta({
  title,
  description,
  noIndex = false,
  ogImage,
  canonical,
  jsonLd,
}: SEOMetaConfig) {
  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    getOrCreateMeta(undefined, 'description').setAttribute('content', description);

    const ogTitle = title;
    const ogDesc = description;
    const ogImg = ogImage || DEFAULT_OG_IMAGE;
    const ogUrl = canonical || window.location.href;

    getOrCreateMeta('og:title').setAttribute('content', ogTitle);
    getOrCreateMeta('og:description').setAttribute('content', ogDesc);
    getOrCreateMeta('og:image').setAttribute('content', ogImg);
    getOrCreateMeta('og:url').setAttribute('content', ogUrl);
    getOrCreateMeta('og:type').setAttribute('content', 'website');
    getOrCreateMeta('og:site_name').setAttribute('content', SITE_NAME);
    getOrCreateMeta('og:locale').setAttribute('content', 'ko_KR');

    getOrCreateMeta(undefined, 'twitter:card').setAttribute('content', 'summary_large_image');
    getOrCreateMeta(undefined, 'twitter:title').setAttribute('content', ogTitle);
    getOrCreateMeta(undefined, 'twitter:description').setAttribute('content', ogDesc);
    getOrCreateMeta(undefined, 'twitter:image').setAttribute('content', ogImg);

    getOrCreateLink('canonical').setAttribute('href', canonical || window.location.href);

    if (noIndex) {
      getOrCreateMeta(undefined, 'robots').setAttribute('content', 'noindex, nofollow');
    } else {
      const robots = document.querySelector('meta[name="robots"]');
      if (robots) robots.remove();
    }

    const existingJsonLd = document.querySelector('script[type="application/ld+json"]');
    if (existingJsonLd) existingJsonLd.remove();

    if (jsonLd) {
      const script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [title, description, noIndex, ogImage, canonical, jsonLd]);
}
