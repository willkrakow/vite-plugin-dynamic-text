import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DynamicText, DynamicTextProvider } from 'vite-plugin-dynamic-text/react';

function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <DynamicText path="hero.title" as="h1" />
      <DynamicText path="hero.tagline" as="p" />
      <DynamicText path="hero.new" as="p">
        This line isn't in copy.json yet, so it's added the first time it renders.
      </DynamicText>
      <p style={{ color: 'GrayText' }}>Hold Alt (Option on macOS) and click any text above to edit it.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DynamicTextProvider>
      <App />
    </DynamicTextProvider>
  </StrictMode>,
);
