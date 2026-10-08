import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('account/login', 'routes/login.tsx'),
  route('account/register', 'routes/register.tsx'),
  route('advertise', 'routes/advertise.tsx'),
  route('admin', 'routes/admin.tsx'),
  route(':lang', 'routes/lang-home.tsx'),
  route(':lang/:slug', 'routes/page.tsx'),
  route(':lang/:slug/edit', 'routes/page-edit.tsx'),
  route(':lang/:slug/history', 'routes/page-history.tsx'),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
