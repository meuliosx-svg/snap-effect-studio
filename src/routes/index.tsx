import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const App = lazy(() => import('@/components/editor/App'));

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'FRAME — Simple video editor' },
    { name: 'description', content: 'Edit videos on any device: timeline, glow text, effects, color correction, layers, audio and export.' },
    { property: 'og:title', content: 'FRAME — Simple video editor' },
    { property: 'og:description', content: 'Timeline editing, glow text, effects, color and audio in one easy app.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <ClientOnly fallback={<div className="boot">FRAME</div>}><Suspense fallback={<div className="boot">FRAME</div>}><App /></Suspense></ClientOnly>,
});
