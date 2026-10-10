/** Temporary layout probe, enabled only by ?layoutDebug=1. Does not affect layout. */
const ELEMENTS = [
  ['Shell', '.shell-main'],
  ['Top host', 'pf-topbar'],
  ['Top bar', '.topbar'],
  ['Main', '#main-content'],
  ['Outlet', '#main-content router-outlet'],
  ['Page host', 'pf-kanban-page'],
  ['Board host', 'pf-kanban-board'],
  ['Board page', '.board-page'],
  ['Toolbar', '.board-toolbar'],
  ['Board scroll', '.board-scroll'],
  ['Column', '.column-header'],
] as const;

export function installCompactLayoutDiagnostics(): () => void {
  const debug = document.createElement('pre');
  debug.setAttribute('aria-label', 'Compact layout measurements');
  debug.style.cssText = [
    'position:fixed',
    'bottom:8px',
    'left:8px',
    'z-index:2147483647',
    'max-width:calc(100vw - 16px)',
    'max-height:44dvh',
    'overflow:auto',
    'box-sizing:border-box',
    'padding:10px',
    'border:1px solid #ac87eb',
    'border-radius:6px',
    'background:rgba(8,7,12,.96)',
    'color:#fff',
    'font:11px/1.45 monospace',
    'white-space:pre',
    'pointer-events:none',
  ].join(';');
  document.body.append(debug);

  const rect = (selector: string) =>
    document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
  const value = (number: number | undefined) =>
    number === undefined ? '—' : number.toFixed(1);
  const difference = (first: DOMRect | undefined, second: DOMRect | undefined) =>
    first && second ? value(second.top - first.bottom) : '—';

  const update = () => {
    const bar = rect('.topbar');
    const host = rect('pf-topbar');
    const main = rect('#main-content');
    const page = rect('.board-page');
    const scroll = rect('.board-scroll');
    const info = [
      'Taiga layout probe v1',
      `density: ${document.documentElement.getAttribute('data-ui-density')}`,
      `viewport: ${window.innerWidth} × ${window.innerHeight} CSS px`,
      `bar → main: ${difference(bar, main)} px`,
      `host → main: ${difference(host, main)} px`,
      `main → page: ${main && page ? value(page.top - main.top) : '—'} px`,
      `page → scroll: ${page && scroll ? value(scroll.top - page.top) : '—'} px`,
      'NAME          TOP   HEIGHT  BOTTOM  DISPLAY/POS',
    ];
    for (const [name, selector] of ELEMENTS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        info.push(`${name.padEnd(12)} — missing`);
        continue;
      }
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      info.push(
        `${name.padEnd(12)} ${value(box.top)}  ${value(box.height)}  ${value(box.bottom)}  ${style.display}/${style.position}`,
      );
    }
    debug.textContent = info.join('\n');
  };

  update();
  const interval = window.setInterval(update, 800);
  window.addEventListener('resize', update);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('resize', update);
    debug.remove();
  };
}
