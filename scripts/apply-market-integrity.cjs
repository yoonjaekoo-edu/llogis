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

  const constantsAnchor = `const DOGE_MAX_PRICE = 100000;`;
  const constantsReplacement = `${constantsAnchor}\nconst DOGE_MAX_ORDER_QUANTITY = 100000;\nconst DOGE_MAX_TRADE_IMPACT = 0.03;\n\nconst getDogeTradeImpact = (quantity: number): number =>\n  Math.min(DOGE_MAX_TRADE_IMPACT, 0.00010 * Math.sqrt(Math.max(0, quantity)));\n\nconst quoteDogeOrder = (spotPrice: number, quantity: number, side: 'buy' | 'sell') => {\n  const impact = getDogeTradeImpact(quantity);\n  const direction = side === 'buy' ? 1 : -1;\n  const marketPrice = Math.max(\n    DOGE_MIN_PRICE,\n    Math.min(DOGE_MAX_PRICE, spotPrice * (1 + direction * impact))\n  );\n  // A market order fills progressively between the pre-trade and post-trade prices.\n  // Using the midpoint as the volume-weighted execution price prevents a 100k-unit\n  // order from receiving the entire fill at the untouched pre-trade quote.\n  const executionPrice = (spotPrice + marketPrice) / 2;\n  const gross = executionPrice * quantity;\n  const fee = gross * DOGE_FEE_RATE;\n  const net = side === 'buy' ? gross + fee : gross - fee;\n  return { impact, marketPrice, executionPrice, gross, fee, net };\n};\n\nconst getMaxDogeBuyQuantity = (rating: number, spotPrice: number): number => {\n  let low = 0;\n  let high = DOGE_MAX_ORDER_QUANTITY;\n  while (low < high) {\n    const mid = Math.ceil((low + high) / 2);\n    const quote = quoteDogeOrder(spotPrice, mid, 'buy');\n    if (quote.net <= rating + 1e-9) low = mid;\n    else high = mid - 1;\n  }\n  return low;\n};`;
  source = replaceOnce(source, constantsAnchor, constantsReplacement, 'market quote helpers');

  const getUserAnchor = `    const user = userResult.rows[0] || { rating: 0, tokens: 0 };\n    const change = market.previousPrice > 0`;
  const getUserReplacement = `    const user = userResult.rows[0] || { rating: 0, tokens: 0 };\n    const userRating = Number(user.rating) || 0;\n    const userDoge = Number(user.tokens) || 0;\n    const maxBuy = getMaxDogeBuyQuantity(userRating, market.price);\n    const maxSell = Math.min(DOGE_MAX_ORDER_QUANTITY, Math.max(0, Math.floor(userDoge)));\n    const change = market.previousPrice > 0`;
  source = replaceOnce(source, getUserAnchor, getUserReplacement, 'market max quantities');

  const balanceAnchor = `      balance: {\n        rating: Number(user.rating) || 0,\n        doge: Number(user.tokens) || 0,\n      },`;
  const balanceReplacement = `      balance: {\n        rating: userRating,\n        doge: userDoge,\n      },\n      maxBuy,\n      maxSell,`;
  source = replaceOnce(source, balanceAnchor, balanceReplacement, 'market response max quantities');

  source = source.replace(
    `  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {\n    return res.status(400).json({ error: '수량은 1~100,000 사이의 정수로 입력해주세요.' });\n  }`,
    `  if (!Number.isInteger(quantity) || quantity < 1 || quantity > DOGE_MAX_ORDER_QUANTITY) {\n    return res.status(400).json({ error: \`수량은 1~${DOGE_MAX_ORDER_QUANTITY.toLocaleString()} 사이의 정수로 입력해주세요.\` });\n  }`
  );

  const quoteAnchor = `    const price = market.price;\n    const gross = price * quantity;\n    const fee = gross * DOGE_FEE_RATE;\n    const net = side === 'buy' ? gross + fee : gross - fee;`;
  const quoteReplacement = `    const spotPrice = market.price;\n    const quote = quoteDogeOrder(spotPrice, quantity, side);\n    const { executionPrice, marketPrice: impactedPrice, impact, gross, fee, net } = quote;`;
  source = replaceOnce(source, quoteAnchor, quoteReplacement, 'market slippage quote');

  const tradeInsertAnchor = `      [userId, side, quantity, price, gross, fee, net]`;
  const tradeInsertReplacement = `      [userId, side, quantity, executionPrice, gross, fee, net]`;
  source = replaceOnce(source, tradeInsertAnchor, tradeInsertReplacement, 'trade execution price storage');

  const oldImpactBlock = `    // Tiny market impact so trades affect the internal market without making one order dominate it.\n    const impactMagnitude = Math.min(0.02, 0.00045 * Math.sqrt(quantity));\n    const impactedPrice = Math.max(\n      DOGE_MIN_PRICE,\n      Math.min(DOGE_MAX_PRICE, price * (1 + (side === 'buy' ? impactMagnitude : -impactMagnitude)))\n    );\n    await client.query(\n      'UPDATE doge_market_state SET previous_price = price, price = $1, updated_at = NOW() WHERE id = 1',\n      [impactedPrice]\n    );`;
  const newImpactBlock = `    // Apply the same quoted market impact used to compute the volume-weighted fill.\n    await client.query(\n      'UPDATE doge_market_state SET previous_price = price, price = $1, updated_at = NOW() WHERE id = 1',\n      [impactedPrice]\n    );`;
  source = replaceOnce(source, oldImpactBlock, newImpactBlock, 'market impact application');

  const responsePriceAnchor = `      price,\n      gross,\n      fee,\n      total: net,\n      marketPrice: impactedPrice,`;
  const responsePriceReplacement = `      price: executionPrice,\n      spotPrice,\n      gross,\n      fee,\n      total: net,\n      marketPrice: impactedPrice,\n      impactPercent: impact * 100,`;
  source = replaceOnce(source, responsePriceAnchor, responsePriceReplacement, 'order response execution price');

  fs.writeFileSync(path, source, 'utf8');
}

function patchFrontend() {
  const path = 'frontend/src/DogeMarketNav.tsx';
  let source = fs.readFileSync(path, 'utf8');

  const marketTypeAnchor = `  feeRate: number;\n  balance: { rating: number; doge: number };`;
  const marketTypeReplacement = `  feeRate: number;\n  balance: { rating: number; doge: number };\n  maxBuy?: number;\n  maxSell?: number;`;
  source = replaceOnce(source, marketTypeAnchor, marketTypeReplacement, 'market type max quantities');

  const priceMathAnchor = `  const price = Number(market?.price || 0);\n  const gross = price * qty;\n  const fee = gross * FEE_RATE;\n  const total = side === 'buy' ? gross + fee : gross - fee;\n  const maxBuy = price > 0 && market ? Math.max(0, Math.floor(market.balance.rating / (price * (1 + FEE_RATE)))) : 0;\n  const maxSell = Math.max(0, Math.floor(market?.balance.doge || 0));`;
  const priceMathReplacement = `  const price = Number(market?.price || 0);\n  const impact = Math.min(0.03, 0.00010 * Math.sqrt(qty));\n  const impactedPrice = price * (1 + (side === 'buy' ? impact : -impact));\n  const executionPrice = qty > 0 ? (price + impactedPrice) / 2 : price;\n  const gross = executionPrice * qty;\n  const fee = gross * FEE_RATE;\n  const total = side === 'buy' ? gross + fee : gross - fee;\n  const fallbackMaxBuy = price > 0 && market ? Math.max(0, Math.floor(market.balance.rating / (price * (1 + FEE_RATE)))) : 0;\n  const maxBuy = Math.max(0, Math.floor(market?.maxBuy ?? fallbackMaxBuy));\n  const maxSell = Math.max(0, Math.floor(market?.maxSell ?? Math.min(100000, market?.balance.doge || 0)));`;
  source = replaceOnce(source, priceMathAnchor, priceMathReplacement, 'frontend slippage estimate');

  source = source.replace(
    `if (!window.confirm(\`LOGIS ${qty.toLocaleString()}개를 ${action}할까?\\n수수료: ${formatRp(fee)}\`)) return;`,
    `if (!window.confirm(\`LOGIS ${qty.toLocaleString()}개를 ${action}할까?\\n예상 체결가: ${formatRp(executionPrice)}\\n예상 가격 영향: ${(impact * 100).toFixed(2)}%\\n수수료: ${formatRp(fee)}\`)) return;`
  );

  const summaryAnchor = `                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>주문금액</span><b>{formatRp(gross)}</b></div>\n                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>수수료 (2.5%)</span><b>{formatRp(fee)}</b></div>`;
  const summaryReplacement = `                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>예상 체결가</span><b>{formatRp(executionPrice)}</b></div>\n                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>가격 영향</span><b>{qty > 0 ? \`${(impact * 100).toFixed(2)}%\` : '0.00%'}</b></div>\n                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>주문금액</span><b>{formatRp(gross)}</b></div>\n                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>수수료 (2.5%)</span><b>{formatRp(fee)}</b></div>`;
  source = replaceOnce(source, summaryAnchor, summaryReplacement, 'frontend order summary');

  fs.writeFileSync(path, source, 'utf8');
}

patchBackend();
patchFrontend();
console.log('Logis market integrity patch applied successfully.');
