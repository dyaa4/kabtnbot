// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { MessageEditor } from './MessageEditor.js';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/emojis')) {
        // Discord emoji ids are numeric snowflakes — the preview regex relies on that.
        return new Response(JSON.stringify([{ id: '111222333', name: 'pepe', animated: false }]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }),
  );
});

function Harness({ initial = '', maxLength = 500, guildId }: { initial?: string; maxLength?: number; guildId?: string }) {
  const [value, setValue] = useState(initial);
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <I18nProvider>
      <QueryClientProvider client={qc}>
        <MessageEditor
          label="رسالة الترحيب"
          hint="hint"
          value={value}
          onChange={setValue}
          maxLength={maxLength}
          sampleUser="Tester"
          guildId={guildId}
        />
      </QueryClientProvider>
    </I18nProvider>
  );
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText('رسالة الترحيب');
}

describe('MessageEditor', () => {
  it('inserts a placeholder tag at the cursor position', async () => {
    const user = userEvent.setup();
    render(<Harness initial="أهلاً  معنا" />);
    const ta = textarea();
    ta.focus();
    ta.setSelectionRange(6, 6); // between the two spaces
    await user.click(screen.getByRole('button', { name: /اسم العضو|Member name/ }));
    expect(ta.value).toBe('أهلاً {user} معنا');
    // caret lands right after the tag (restored on the next animation frame)
    await waitFor(() => expect(ta.selectionStart).toBe(12));
  });

  it('opens the emoji panel, inserts an emoji at the cursor and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness initial="gg" />);
    await user.click(screen.getByRole('button', { name: /إدراج إيموجي|Insert emoji/ }));
    const panel = await screen.findByRole('dialog');
    const emoji = panel.querySelector('button')!;
    const char = emoji.textContent!;
    const ta = textarea();
    ta.focus();
    ta.setSelectionRange(2, 2);
    await user.click(emoji);
    expect(ta.value).toBe(`gg${char}`);

    // the panel stays open for multi-insert; Escape closes it
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses an insert that would exceed maxLength and shows the counter', async () => {
    const user = userEvent.setup();
    render(<Harness initial="12345678" maxLength={10} />);
    expect(screen.getByText('8/10')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /اسم السيرفر|Server name/ })); // {server} = 8 chars > 2 left
    expect(textarea().value).toBe('12345678'); // unchanged
  });

  it('offers guild custom emojis, inserts the Discord code and previews it as an image', async () => {
    const user = userEvent.setup();
    render(<Harness initial="hi " guildId="g1" />);
    await user.click(screen.getByRole('button', { name: /إدراج إيموجي|Insert emoji/ }));
    const custom = await screen.findByRole('button', { name: ':pepe:' });

    const ta = textarea();
    ta.focus();
    ta.setSelectionRange(3, 3);
    await user.click(custom);
    expect(ta.value).toBe('hi <:pepe:111222333>');

    const preview = screen.getByTestId('message-preview');
    const img = preview.querySelector('img')!;
    expect(img.getAttribute('src')).toContain('cdn.discordapp.com/emojis/111222333.png');
    expect(preview.textContent).not.toContain('<:pepe:111222333>');
  });

  it('renders a live preview with the placeholders resolved', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const ta = textarea();
    await user.type(ta, 'أهلاً {{user}} في {{server}} رقم {{count}}');
    const preview = screen.getByTestId('message-preview');
    expect(preview.textContent).toContain('Tester');
    expect(preview.textContent).toContain('128');
    expect(preview.textContent).not.toContain('{user}');
  });
});
