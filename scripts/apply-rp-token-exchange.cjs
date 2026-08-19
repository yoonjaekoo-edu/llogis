const fs = require('fs');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  }
  return source.replace(before, after);
}

function patchBackend() {
  const path = 'backend/src/index.ts';
  let source = fs.readFileSync(path, 'utf8');

  const oldProfile = 'SELECT id, username, email, profile_image_url, bio, can_generate_problems, equipped_title, created_at, has_firework_effect, has_developer_chango, custom_title, problems_solved, profile_theme, profile_css FROM users WHERE id = $1';
  const newProfile = 'SELECT id, username, email, profile_image_url, bio, can_generate_problems, equipped_title, created_at, has_firework_effect, has_developer_chango, custom_title, problems_solved, tokens, profile_theme, profile_css FROM users WHERE id = $1';

  if (!source.includes(newProfile)) {
    source = replaceOnce(source, oldProfile, newProfile, 'profile tokens SELECT');
  }

  if (!source.includes("app.post('/api/store/exchange-rp-token'")) {
    const anchor = `  res.json({ items });
});



// Purchase firework effect item`;

    const replacement = `  res.json({ items });
});

// Exchange 20,000 RP for 1 token. The exchange rate is fixed server-side.
app.post('/api/store/exchange-rp-token', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const RP_COST = 20000;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      \`UPDATE users
       SET rating = rating - $1, tokens = tokens + 1
       WHERE id = $2 AND rating >= $1
       RETURNING rating, tokens\`,
      [RP_COST, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'RP가 부족합니다. (필요: 20,000 RP)' });
    }

    await client.query('COMMIT');
    const updated = result.rows[0];
    res.json({
      message: '20,000 RP를 1 토큰으로 교환했습니다.',
      rating: parseFloat(updated.rating) || 0,
      tokens: parseInt(updated.tokens) || 0,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('RP token exchange failed:', err);
    res.status(500).json({ error: 'RP를 토큰으로 교환하는 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

// Purchase firework effect item`;

    source = replaceOnce(source, anchor, replacement, 'RP-token exchange API');
  }

  fs.writeFileSync(path, source, 'utf8');
}

function patchFrontend() {
  const path = 'frontend/src/App.tsx';
  let source = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');

  const shopStart = source.indexOf('const Shop: React.FC');
  const loginStart = source.indexOf('const Login: React.FC', shopStart);
  if (shopStart < 0 || loginStart < 0) {
    throw new Error('Shop component bounds not found');
  }

  const beforeShop = source.slice(0, shopStart);
  let shop = source.slice(shopStart, loginStart);
  const afterShop = source.slice(loginStart);

  if (!shop.includes('const [exchangingRp, setExchangingRp]')) {
    shop = replaceOnce(
      shop,
      `  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();`,
      `  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [exchangingRp, setExchangingRp] = useState(false);
  const navigate = useNavigate();`,
      'Shop exchange state'
    );
  }

  if (!shop.includes('const handleExchangeRpForToken')) {
    const returnAnchor = `  return (
    <main className="container" style={{ padding: '4rem 0', maxWidth: '800px', margin: '0 auto' }}>`;

    const handlerAndReturn = `  const handleExchangeRpForToken = async () => {
    if (!user || exchangingRp) return;
    if ((user.rating || 0) < 20000) {
      setMessage('❌ RP가 부족합니다. (필요: 20,000 RP)');
      return;
    }
    if (!window.confirm('20,000 RP를 1 토큰으로 교환하시겠습니까?')) return;

    setExchangingRp(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/store/exchange-rp-token', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${token}\` }
      });
      const data = await res.json();
      if (res.ok) {
        const updatedUser = {
          ...user,
          rating: Number(data.rating) || 0,
          tokens: Number(data.tokens) || 0,
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        setMessage(\`✅ \${data.message || '20,000 RP를 1 토큰으로 교환했습니다.'}\`);
      } else {
        setMessage(\`❌ \${data.error || '교환에 실패했습니다.'}\`);
      }
    } catch {
      setMessage('❌ 네트워크 오류로 교환에 실패했습니다.');
    } finally {
      setExchangingRp(false);
    }
  };

  return (
    <main className="container" style={{ padding: '4rem 0', maxWidth: '800px', margin: '0 auto' }}>`;

    shop = replaceOnce(shop, returnAnchor, handlerAndReturn, 'Shop exchange handler');
  }

  if (!shop.includes('20,000 RP → 🪙 1 토큰')) {
    const messageAnchor = `      {message && (
        <div style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 700 }}>
          {message}
        </div>
      )}

      {loading ?`;

    const exchangeCard = `      {message && (
        <div style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 700 }}>
          {message}
        </div>
      )}

      <div className="problem-card" style={{ margin: '0 0 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', border: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ margin: '0 0 0.3rem', color: 'var(--color-4)' }}>✨ RP → 토큰 교환</h3>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>20,000 RP를 사용해 1 토큰으로 교환할 수 있습니다.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.5rem' }}>20,000 RP → 🪙 1 토큰</div>
          <button
            onClick={handleExchangeRpForToken}
            disabled={exchangingRp || (user?.rating || 0) < 20000}
            className="btn"
            style={{
              width: 'auto', padding: '0.6rem 1.5rem',
              background: !exchangingRp && (user?.rating || 0) >= 20000 ? 'var(--color-4)' : 'var(--border)',
              color: !exchangingRp && (user?.rating || 0) >= 20000 ? 'white' : 'var(--text-muted)',
              cursor: !exchangingRp && (user?.rating || 0) >= 20000 ? 'pointer' : 'not-allowed',
              opacity: !exchangingRp && (user?.rating || 0) >= 20000 ? 1 : 0.6
            }}
          >
            {exchangingRp ? '교환 중...' : '교환하기'}
          </button>
        </div>
      </div>

      {loading ?`;

    shop = replaceOnce(shop, messageAnchor, exchangeCard, 'Shop exchange card');
  }

  fs.writeFileSync(path, beforeShop + shop + afterShop, 'utf8');
}

patchBackend();
patchFrontend();
console.log('RP-token exchange patch applied successfully.');
