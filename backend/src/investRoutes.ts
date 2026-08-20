import type { Express, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { ensureStockSchema, fetchAllStockQuotes, fetchStockQuote, getSupportedStocks } from './stockMarket';

export function registerInvestRoutes(app: Express, pool: Pool, jwtSecret: string) {
  const auth = (req: any, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header && header.split(' ')[1];
    if (!token) return res.status(401).json({ error: '로그인이 필요해.' });
    jwt.verify(token, jwtSecret, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: '로그인이 만료됐어.' });
      req.user = user;
      next();
    });
  };

  ensureStockSchema(pool).catch((err) => console.error('Stock schema init failed:', err));

  app.get('/api/invest', auth, async (req: any, res: Response) => {
    try {
      const quotes = await fetchAllStockQuotes();
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
      const [userRes, holdingRes, tradeRes] = await Promise.all([
        pool.query('SELECT rating FROM users WHERE id = $1', [req.user.id]),
        pool.query('SELECT symbol, quantity, average_price FROM stock_holdings WHERE user_id = $1 AND quantity > 0 ORDER BY symbol', [req.user.id]),
        pool.query('SELECT symbol, side, quantity, price, total, created_at FROM stock_trades WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [req.user.id]),
      ]);
      if (!userRes.rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없어.' });
      const names = new Map(getSupportedStocks().map((s) => [s.symbol, s.name]));
      const holdings = holdingRes.rows.map((row: any) => {
        const quote = quoteMap.get(row.symbol);
        const price = Number(quote?.price || 0);
        const quantity = Number(row.quantity || 0);
        const averagePrice = Number(row.average_price || 0);
        const value = price * quantity;
        const profit = (price - averagePrice) * quantity;
        return {
          symbol: row.symbol,
          name: names.get(row.symbol) || row.symbol,
          quantity,
          averagePrice,
          price,
          value,
          profit,
          profitPercent: averagePrice > 0 ? ((price - averagePrice) / averagePrice) * 100 : 0,
        };
      });
      const trades = tradeRes.rows.map((row: any) => ({
        ...row,
        name: names.get(row.symbol) || row.symbol,
        quantity: Number(row.quantity),
        price: Number(row.price),
        total: Number(row.total),
      }));
      res.json({ balance: { rating: Number(userRes.rows[0].rating || 0) }, quotes, holdings, trades });
    } catch (err) {
      console.error('Invest market error:', err);
      res.status(502).json({ error: '실제 주식 시세를 불러오지 못했어. KIS API 설정을 확인해줘.' });
    }
  });

  app.post('/api/invest/order', auth, async (req: any, res: Response) => {
    const symbol = String(req.body?.symbol || '');
    const side = req.body?.side === 'sell' ? 'sell' : req.body?.side === 'buy' ? 'buy' : '';
    const quantity = Math.floor(Number(req.body?.quantity || 0));
    if (!getSupportedStocks().some((s) => s.symbol === symbol)) return res.status(400).json({ error: '지원하지 않는 종목이야.' });
    if (!side || quantity < 1 || quantity > 100000) return res.status(400).json({ error: '주문 수량이 올바르지 않아.' });

    let quote;
    try { quote = await fetchStockQuote(symbol); }
    catch (err) {
      console.error('Quote before order failed:', err);
      return res.status(502).json({ error: '현재가를 확인하지 못해서 주문을 체결하지 않았어.' });
    }

    const price = quote.price;
    const total = price * quantity;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query('SELECT rating FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      if (!userRes.rows.length) throw new Error('USER_NOT_FOUND');
      const rating = Number(userRes.rows[0].rating || 0);
      const holdingRes = await client.query('SELECT quantity, average_price FROM stock_holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE', [req.user.id, symbol]);
      const currentQty = Number(holdingRes.rows[0]?.quantity || 0);
      const currentAvg = Number(holdingRes.rows[0]?.average_price || 0);

      if (side === 'buy') {
        if (rating < total) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `RP가 부족해. 필요: ${Math.round(total).toLocaleString()} RP` });
        }
        const nextQty = currentQty + quantity;
        const nextAvg = ((currentAvg * currentQty) + total) / nextQty;
        await client.query('UPDATE users SET rating = rating - $1 WHERE id = $2', [total, req.user.id]);
        await client.query(`INSERT INTO stock_holdings(user_id, symbol, quantity, average_price) VALUES($1,$2,$3,$4)
          ON CONFLICT(user_id,symbol) DO UPDATE SET quantity = EXCLUDED.quantity, average_price = EXCLUDED.average_price`, [req.user.id, symbol, nextQty, nextAvg]);
      } else {
        if (currentQty < quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `보유 수량이 부족해. 현재 ${currentQty}주 보유 중이야.` });
        }
        const nextQty = currentQty - quantity;
        await client.query('UPDATE users SET rating = rating + $1 WHERE id = $2', [total, req.user.id]);
        if (nextQty === 0) await client.query('DELETE FROM stock_holdings WHERE user_id = $1 AND symbol = $2', [req.user.id, symbol]);
        else await client.query('UPDATE stock_holdings SET quantity = $1 WHERE user_id = $2 AND symbol = $3', [nextQty, req.user.id, symbol]);
      }

      await client.query('INSERT INTO stock_trades(user_id, symbol, side, quantity, price, total) VALUES($1,$2,$3,$4,$5,$6)', [req.user.id, symbol, side, quantity, price, total]);
      const balanceRes = await client.query('SELECT rating FROM users WHERE id = $1', [req.user.id]);
      await client.query('COMMIT');
      res.json({
        name: quote.name,
        symbol,
        side,
        quantity,
        price,
        total,
        rating: Number(balanceRes.rows[0].rating || 0),
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Invest order error:', err);
      res.status(500).json({ error: '주문 처리 중 오류가 발생했어.' });
    } finally { client.release(); }
  });
}
