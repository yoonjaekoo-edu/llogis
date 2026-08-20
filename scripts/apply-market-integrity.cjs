const fs = require('fs');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  }
  return source.replace(before, after);
}

function patchBackend() {
  const path = 'backend/src/index.ts';
  let source = fs.readFileSync(path, 'utf8');

  const constantsAnchor = 'const DOGE_MAX_PRICE = 100000;';
  const constantsReplacement = constantsAnchor + `
const DOGE_MAX_ORDER_QUANTITY = 100000;
const DOGE_MAX_TRADE_IMPACT = 0.03;

const getDogeTradeImpact = (quantity: number): number =>
  Math.min(DOGE_MAX_TRADE_IMPACT, 0.00010 * Math.sqrt(Math.max(0, quantity)));

const quoteDogeOrder = (spotPrice: number, quantity: number, side: 'buy' | 'sell') => {
  const impact = getDogeTradeImpact(quantity);
  const direction = side === 'buy' ? 1 : -1;
  const marketPrice = Math.max(
    DOGE_MIN_PRICE,
    Math.min(DOGE_MAX_PRICE, spotPrice * (1 + direction * impact))
  );
  // Approximate progressive market fills with the midpoint between the
  // pre-trade quote and the post-trade price. Large orders no longer receive
  // the entire fill at the untouched spot price.
  const executionPrice = (spotPrice + marketPrice) / 2;
  const gross = executionPrice * quantity;
  const fee = gross * DOGE_FEE_RATE;
  const net = side === 'buy' ? gross + fee : gross - fee;
  return { impact, marketPrice, executionPrice, gross, fee, net };
};

const getMaxDogeBuyQuantity = (rating: number, spotPrice: number): number => {
  let low = 0;
  let high = DOGE_MAX_ORDER_QUANTITY;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const quote = quoteDogeOrder(spotPrice, mid, 'buy');
    if (quote.net <= rating + 1e-9) low = mid;
    else high = mid - 1;
  }
  return low;
};`;
  source = replaceOnce(source, constantsAnchor, constantsReplacement, 'market quote helpers');

  const getUserAnchor = `    const user = userResult.rows[0] || { rating: 0, tokens: 0 };
    const change = market.previousPrice > 0`;
  const getUserReplacement = `    const user = userResult.rows[0] || { rating: 0, tokens: 0 };
    const userRating = Number(user.rating) || 0;
    const userDoge = Number(user.tokens) || 0;
    const maxBuy = getMaxDogeBuyQuantity(userRating, market.price);
    const maxSell = Math.min(DOGE_MAX_ORDER_QUANTITY, Math.max(0, Math.floor(userDoge)));
    const change = market.previousPrice > 0`;
  source = replaceOnce(source, getUserAnchor, getUserReplacement, 'market max quantities');

  const balanceAnchor = `      balance: {
        rating: Number(user.rating) || 0,
        doge: Number(user.tokens) || 0,
      },`;
  const balanceReplacement = `      balance: {
        rating: userRating,
        doge: userDoge,
      },
      maxBuy,
      maxSell,`;
  source = replaceOnce(source, balanceAnchor, balanceReplacement, 'market response max quantities');

  const validationAnchor = `  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    return res.status(400).json({ error: '수량은 1~100,000 사이의 정수로 입력해주세요.' });
  }`;
  const validationReplacement = `  if (!Number.isInteger(quantity) || quantity < 1 || quantity > DOGE_MAX_ORDER_QUANTITY) {
    return res.status(400).json({ error: '수량은 1~100,000 사이의 정수로 입력해주세요.' });
  }`;
  source = replaceOnce(source, validationAnchor, validationReplacement, 'order quantity validation');

  const quoteAnchor = `    const price = market.price;
    const gross = price * quantity;
    const fee = gross * DOGE_FEE_RATE;
    const net = side === 'buy' ? gross + fee : gross - fee;`;
  const quoteReplacement = `    const spotPrice = market.price;
    const quote = quoteDogeOrder(spotPrice, quantity, side);
    const { executionPrice, marketPrice: impactedPrice, impact, gross, fee, net } = quote;`;
  source = replaceOnce(source, quoteAnchor, quoteReplacement, 'market slippage quote');

  source = replaceOnce(
    source,
    '      [userId, side, quantity, price, gross, fee, net]',
    '      [userId, side, quantity, executionPrice, gross, fee, net]',
    'trade execution price storage'
  );

  const oldImpactBlock = `    // Tiny market impact so trades affect the internal market without making one order dominate it.
    const impactMagnitude = Math.min(0.02, 0.00045 * Math.sqrt(quantity));
    const impactedPrice = Math.max(
      DOGE_MIN_PRICE,
      Math.min(DOGE_MAX_PRICE, price * (1 + (side === 'buy' ? impactMagnitude : -impactMagnitude)))
    );
    await client.query(
      'UPDATE doge_market_state SET previous_price = price, price = $1, updated_at = NOW() WHERE id = 1',
      [impactedPrice]
    );`;
  const newImpactBlock = `    // Apply exactly the market impact used when quoting the progressive fill.
    await client.query(
      'UPDATE doge_market_state SET previous_price = price, price = $1, updated_at = NOW() WHERE id = 1',
      [impactedPrice]
    );`;
  source = replaceOnce(source, oldImpactBlock, newImpactBlock, 'market impact application');

  const responsePriceAnchor = `      price,
      gross,
      fee,
      total: net,
      marketPrice: impactedPrice,`;
  const responsePriceReplacement = `      price: executionPrice,
      spotPrice,
      gross,
      fee,
      total: net,
      marketPrice: impactedPrice,
      impactPercent: impact * 100,`;
  source = replaceOnce(source, responsePriceAnchor, responsePriceReplacement, 'order response execution price');

  fs.writeFileSync(path, source, 'utf8');
}

function patchFrontend() {
  const path = 'frontend/src/DogeMarketNav.tsx';
  let source = fs.readFileSync(path, 'utf8');

  const marketTypeAnchor = `  feeRate: number;
  balance: { rating: number; doge: number };`;
  const marketTypeReplacement = `  feeRate: number;
  balance: { rating: number; doge: number };
  maxBuy?: number;
  maxSell?: number;`;
  source = replaceOnce(source, marketTypeAnchor, marketTypeReplacement, 'market type max quantities');

  const priceMathAnchor = `  const price = Number(market?.price || 0);
  const gross = price * qty;
  const fee = gross * FEE_RATE;
  const total = side === 'buy' ? gross + fee : gross - fee;
  const maxBuy = price > 0 && market ? Math.max(0, Math.floor(market.balance.rating / (price * (1 + FEE_RATE)))) : 0;
  const maxSell = Math.max(0, Math.floor(market?.balance.doge || 0));`;
  const priceMathReplacement = `  const price = Number(market?.price || 0);
  const impact = Math.min(0.03, 0.00010 * Math.sqrt(qty));
  const impactedPrice = price * (1 + (side === 'buy' ? impact : -impact));
  const executionPrice = qty > 0 ? (price + impactedPrice) / 2 : price;
  const gross = executionPrice * qty;
  const fee = gross * FEE_RATE;
  const total = side === 'buy' ? gross + fee : gross - fee;
  const fallbackMaxBuy = price > 0 && market ? Math.max(0, Math.floor(market.balance.rating / (price * (1 + FEE_RATE)))) : 0;
  const maxBuy = Math.max(0, Math.floor(market?.maxBuy ?? fallbackMaxBuy));
  const maxSell = Math.max(0, Math.floor(market?.maxSell ?? Math.min(100000, market?.balance.doge || 0)));`;
  source = replaceOnce(source, priceMathAnchor, priceMathReplacement, 'frontend slippage estimate');

  const tick = String.fromCharCode(96);
  const confirmAnchor = 'if (!window.confirm(' + tick + 'LOGIS ${qty.toLocaleString()}개를 ${action}할까?\\n수수료: ${formatRp(fee)}' + tick + ')) return;';
  const confirmReplacement = 'if (!window.confirm(' + tick + 'LOGIS ${qty.toLocaleString()}개를 ${action}할까?\\n예상 체결가: ${formatRp(executionPrice)}\\n예상 가격 영향: ${(impact * 100).toFixed(2)}%\\n수수료: ${formatRp(fee)}' + tick + ')) return;';
  source = replaceOnce(source, confirmAnchor, confirmReplacement, 'order confirmation estimate');

  const summaryAnchor = `                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>주문금액</span><b>{formatRp(gross)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>수수료 (2.5%)</span><b>{formatRp(fee)}</b></div>`;
  const summaryReplacement = `                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>예상 체결가</span><b>{formatRp(executionPrice)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>가격 영향</span><b>{qty > 0 ? (impact * 100).toFixed(2) + '%' : '0.00%'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>주문금액</span><b>{formatRp(gross)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>수수료 (2.5%)</span><b>{formatRp(fee)}</b></div>`;
  source = replaceOnce(source, summaryAnchor, summaryReplacement, 'frontend order summary');

  fs.writeFileSync(path, source, 'utf8');
}

patchBackend();
patchFrontend();
console.log('Logis market integrity patch applied successfully.');
