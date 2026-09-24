/**
 * The stadium photo behind the next-match card and the scorebug is each
 * page's largest paint, but as a CSS background the browser only finds it
 * after the stylesheet has parsed. React hoists these into <head>. The media
 * split mirrors the `.next-up` / `.mp-bug` background rules.
 */
export function StadiumPreload() {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/assets/night-stadium-800.webp"
        media="(max-width: 1023px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/assets/night-stadium.webp"
        media="(min-width: 1024px)"
        fetchPriority="high"
      />
    </>
  );
}
