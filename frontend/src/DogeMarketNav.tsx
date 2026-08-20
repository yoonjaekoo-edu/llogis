import { useEffect } from 'react';

export default function DogeMarketNav() {
  useEffect(() => {
    const install = () => {
      const nav = document.querySelector('header nav ul');
      if (!nav || nav.querySelector('[data-doge-market-nav]')) return;

      const item = document.createElement('li');
      item.setAttribute('data-doge-market-nav', 'true');

      const link = document.createElement('a');
      link.href = '/doge-market.html';
      link.textContent = '도지 마켓';
      link.setAttribute('aria-label', '도지 마켓 열기');

      item.appendChild(link);

      const shopLink = Array.from(nav.querySelectorAll('a')).find(
        (a) => a.getAttribute('href') === '/shop',
      );
      const shopItem = shopLink?.closest('li');

      if (shopItem?.nextSibling) nav.insertBefore(item, shopItem.nextSibling);
      else nav.appendChild(item);
    };

    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
