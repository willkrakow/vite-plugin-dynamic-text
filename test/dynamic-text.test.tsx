import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DynamicText, DynamicTextProvider, useDynamicText } from '../src/react';

// Copy comes from test/fixtures/copy.json through the real plugin, with `root: 'text'`
// (see vitest.config.ts).

describe('<DynamicText />', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders existing copy from the copy file', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    expect(screen.getByText('Bramble')).toBeInTheDocument();
  });

  it('renders fallback children when the key is missing', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="nonexistent.key">Fallback Copy</DynamicText>
      </DynamicTextProvider>,
    );
    expect(screen.getByText('Fallback Copy')).toBeInTheDocument();
  });

  it('renders a bracketed placeholder when key and children are absent', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="nonexistent.without_children" />
      </DynamicTextProvider>,
    );
    expect(screen.getByText('[nonexistent.without_children]')).toBeInTheDocument();
  });

  it('reads the copy file outside a provider', () => {
    render(<DynamicText path="hero.title" />);
    expect(screen.getByText('Bramble')).toBeInTheDocument();
  });

  it('auto-initialises a missing key from its children in dev', async () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="auto.init.key">Auto Init Value</DynamicText>
      </DynamicTextProvider>,
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/__dynamic_text/init',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ path: 'auto.init.key', defaultValue: 'Auto Init Value' }),
        }),
      );
    });
  });

  it('does not open the editor on a regular click', async () => {
    const user = userEvent.setup();
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    await user.click(screen.getByText('Bramble'));
    expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument();
  });

  it('opens the editor on Alt+click with confirm and cancel buttons', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble'), { altKey: true });
    expect(screen.getByTestId('dynamic-text-editable')).toBeInTheDocument();
    expect(screen.getByTestId('dynamic-text-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('dynamic-text-cancel')).toBeInTheDocument();
  });

  it('cancels without saving', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble'), { altKey: true });
    fireEvent.click(screen.getByTestId('dynamic-text-cancel'));
    expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument();
    expect(screen.getByText('Bramble')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/__dynamic_text/update', expect.anything());
  });

  it('cancels on Escape', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble'), { altKey: true });
    fireEvent.keyDown(screen.getByTestId('dynamic-text-editable'), { key: 'Escape' });
    expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument();
  });

  it('saves on confirm', async () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble'), { altKey: true });
    screen.getByTestId('dynamic-text-editable').innerText = 'New Title';
    fireEvent.click(screen.getByTestId('dynamic-text-confirm'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/__dynamic_text/update',
        expect.objectContaining({ body: JSON.stringify({ path: 'hero.title', value: 'New Title' }) }),
      );
    });
    expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument();
    expect(screen.getByText('New Title')).toBeInTheDocument();
  });

  it('saves on Enter', async () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble'), { altKey: true });
    const editable = screen.getByTestId('dynamic-text-editable');
    editable.innerText = 'Entered';
    fireEvent.keyDown(editable, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument());
    expect(screen.getByText('Entered')).toHaveAttribute('data-state', 'idle');
    expect(fetch).toHaveBeenCalledWith('/__dynamic_text/update', expect.anything());
  });

  it('closes without a request when the text is unchanged', async () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble'), { altKey: true });
    fireEvent.click(screen.getByTestId('dynamic-text-confirm'));
    await waitFor(() => expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalledWith('/__dynamic_text/update', expect.anything());
  });

  it('shares edits with other components through the provider', async () => {
    function Echo() {
      return <output>{useDynamicText().getText('hero.title')}</output>;
    }
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
        <Echo />
      </DynamicTextProvider>,
    );
    fireEvent.click(screen.getByText('Bramble', { selector: 'span' }), { altKey: true });
    screen.getByTestId('dynamic-text-editable').innerText = 'Shared';
    fireEvent.click(screen.getByTestId('dynamic-text-confirm'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Shared'));
  });

  it('keeps rendering when a path runs through a string value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
        <DynamicText path="hero.title.deeper">Deeper</DynamicText>
      </DynamicTextProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/__dynamic_text/init', expect.anything()));
    expect(screen.getByText('Bramble')).toBeInTheDocument();
    expect(screen.getByText('Deeper')).toBeInTheDocument();
  });

  it('renders plain text without the editor in production', () => {
    vi.stubEnv('DEV', false);
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" as="h1" className="headline" />
      </DynamicTextProvider>,
    );
    const el = screen.getByText('Bramble');
    expect(el.tagName).toBe('H1');
    expect(el).toHaveAttribute('class', 'headline');
    expect(el).not.toHaveAttribute('title');
    expect(el).not.toHaveAttribute('data-state');
    fireEvent.click(el, { altKey: true });
    expect(screen.queryByTestId('dynamic-text-editable')).not.toBeInTheDocument();
    expect(document.getElementById('dynamic-text-styles')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('<DynamicText /> styling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects the default stylesheet once', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" />
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    expect(document.querySelectorAll('#dynamic-text-styles')).toHaveLength(1);
    expect(document.getElementById('dynamic-text-styles')!.textContent).toContain(':where(.dynamic-text)');
  });

  it('skips the stylesheet when unstyled, but keeps the stable classes', () => {
    render(
      <DynamicTextProvider unstyled>
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    expect(document.getElementById('dynamic-text-styles')).toBeNull();
    expect(screen.getByText('Bramble')).toHaveClass('dynamic-text');
  });

  it('exposes stable classes and data-state on every part', () => {
    render(
      <DynamicTextProvider>
        <DynamicText path="hero.title" className="mine" />
      </DynamicTextProvider>,
    );
    const el = screen.getByText('Bramble');
    expect(el).toHaveClass('dynamic-text', 'mine');
    expect(el).toHaveAttribute('data-state', 'idle');
    expect(el).toHaveAttribute('data-path', 'hero.title');

    fireEvent.click(el, { altKey: true });
    const editable = screen.getByTestId('dynamic-text-editable');
    const root = editable.parentElement!;
    expect(root).toHaveClass('dynamic-text', 'dynamic-text-editing', 'mine');
    expect(root).toHaveAttribute('data-state', 'editing');
    expect(editable).toHaveClass('dynamic-text-editable');
    expect(screen.getByTestId('dynamic-text-confirm')).toHaveClass('dynamic-text-confirm');
    expect(screen.getByTestId('dynamic-text-cancel')).toHaveClass('dynamic-text-cancel');
  });

  it('applies classNames and styles from the provider', () => {
    render(
      <DynamicTextProvider
        classNames={{ root: 'r', editing: 'e', editable: 'ed', actions: 'a', confirm: 'c', cancel: 'x' }}
        styles={{ root: { color: 'red' }, editing: { outlineColor: 'blue' }, confirm: { backgroundColor: 'purple' } }}
      >
        <DynamicText path="hero.title" />
      </DynamicTextProvider>,
    );
    const el = screen.getByText('Bramble');
    expect(el).toHaveClass('dynamic-text', 'r');
    expect(el).toHaveStyle({ color: 'rgb(255, 0, 0)' });

    fireEvent.click(el, { altKey: true });
    const root = screen.getByTestId('dynamic-text-editable').parentElement!;
    expect(root).toHaveClass('r', 'e');
    expect(root).toHaveStyle({ color: 'rgb(255, 0, 0)', outlineColor: 'rgb(0, 0, 255)' });
    expect(screen.getByTestId('dynamic-text-editable')).toHaveClass('ed');
    expect(screen.getByTestId('dynamic-text-confirm')).toHaveClass('c');
    expect(screen.getByTestId('dynamic-text-confirm')).toHaveStyle({ backgroundColor: 'rgb(128, 0, 128)' });
    expect(screen.getByTestId('dynamic-text-cancel')).toHaveClass('x');
    expect(screen.getByTestId('dynamic-text-cancel').parentElement).toHaveClass('dynamic-text-actions', 'a');
  });
});
