const fs = require('fs');

function replaceAll(source, from, to) {
  return source.split(from).join(to);
}

function patchFrontend() {
  const path = 'frontend/src/DogeMarketNav.tsx';
  let source = fs.readFileSync(path, 'utf8');

  source = replaceAll(source, "const DOGE_PATH = '/doge-market';", "const DOGE_PATH = '/logis-coin';");
  source = replaceAll(source, '/api/doge-market/order', '/api/logis-coin/order');
  source = replaceAll(source, '/api/doge-market', '/api/logis-coin');
  source = replaceAll(source, '도지 마켓', '로지코인');
  source = replaceAll(source, 'DOGE / RP', 'LOGIS / RP');
  source = replaceAll(source, 'DOGE(토큰)', '로지코인');
  source = replaceAll(source, 'DOGE', 'LOGIS');
  source = replaceAll(source, '도지', '로지코인');

  fs.writeFileSync(path, source, 'utf8');
}

function patchBackend() {
  const path = 'backend/src/index.ts';
  let source = fs.readFileSync(path, 'utf8');

  // Keep the existing doge_market_* DB table names so deployed market history is preserved.
  source = replaceAll(source, "app.get('/api/doge-market'", "app.get('/api/logis-coin'");
  source = replaceAll(source, "app.post('/api/doge-market/order'", "app.post('/api/logis-coin/order'");
  source = replaceAll(source, '도지 마켓 정보를 불러오지 못했습니다.', '로지코인 정보를 불러오지 못했습니다.');
  source = replaceAll(source, 'DOGE 수량이 부족합니다.', '로지코인 수량이 부족합니다.');
  source = replaceAll(source, 'DOGE 매수가 완료됐습니다.', '로지코인 매수가 완료됐습니다.');
  source = replaceAll(source, 'DOGE 매도가 완료됐습니다.', '로지코인 매도가 완료됐습니다.');

  fs.writeFileSync(path, source, 'utf8');
}

patchFrontend();
patchBackend();
console.log('LogisCoin branding patch applied successfully.');
