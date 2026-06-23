// apps/web/next.config.ts
//
// Static export (no Node server at runtime -- ships as plain HTML/CSS/JS,
// see design spec Decision 1) under GitHub Pages' project-page subpath
// (this repo is smadimsetty/bulletproof, not smadimsetty.github.io, so the
// site is served at /bulletproof/, not the domain root -- see design spec
// Decision 6). Both settings must travel together: omitting basePath while
// keeping output: 'export' produces a build whose asset references 404
// once deployed under the subpath.
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/bulletproof',
};

export default nextConfig;
