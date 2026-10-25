/**
 * Self-hosted webfonts (ADDENDUM-030, closing ADDENDUM-024 §9). Latin
 * subsets only: the premiere's copy is Latin, and other scripts keep the
 * Georgia/system fallbacks declared in index.css. The woff2 files are
 * inlined into the single-file build, so the app no longer waits on (or
 * silently loses) fonts from a CDN — offline rendering matches online,
 * which the screenshot likeness gate depends on.
 */
import '@fontsource/cinzel-decorative/latin-400.css';
import '@fontsource/cinzel-decorative/latin-700.css';
import '@fontsource/cinzel-decorative/latin-900.css';
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';
import '@fontsource/jost/latin-600.css';
import '@fontsource/marcellus/latin-400.css';
import '@fontsource/poiret-one/latin-400.css';
