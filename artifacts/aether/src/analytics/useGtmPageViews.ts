import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/**
 * Pushes a `page_view` event to GTM's dataLayer on every client-side route
 * change. The GTM snippet in index.html only fires once, on the initial
 * document load, so without this every navigation inside the SPA
 * (/ → /catalogo → /probador) would be invisible to Analytics.
 *
 * The first render is skipped on purpose: GTM's own container load already
 * counts that pageview, and pushing here too would double it.
 */
export function useGtmPageViews() {
  const [location] = useLocation();
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    // The container may not have loaded yet (or may be blocked); the array
    // is safe to seed ourselves — GTM picks up whatever is already queued.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'page_view',
      // wouter's location is the pathname only, so read the query string
      // straight from the URL to keep params like ?producto=<id>.
      page_path: location + window.location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location]);
}
