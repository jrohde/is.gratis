import { redirect } from 'react-router';
import { pickLanguage } from '@isgratis/types';
import type { Route } from './+types/home';

/** The bare domain sends visitors to their language. Not cached: it depends on the visitor. */
export function loader({ request }: Route.LoaderArgs) {
  const lang = pickLanguage(request.headers.get('accept-language'));
  return redirect(`/${lang}`, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Accept-Language' },
  });
}

export default function Home() {
  return null;
}
