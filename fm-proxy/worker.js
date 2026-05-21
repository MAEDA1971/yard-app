// FileMaker CORS プロキシ + QR製品情報API（Cloudflare Worker）
//
// 必要なシークレット（wrangler secret put コマンドで設定）:
//   FM_USER  ... qr_reader ユーザー名
//   FM_PASS  ... qr_reader パスワード

const FM_SERVER   = 'https://fms.daieisng.com';
const FM_DATABASE = '品質管理システム';
const FM_LAYOUT   = 'L001.4_製品詳細_mst製品';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age':       '86400',
};

const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // /api/product/{uuid} → FileMaker から製品情報を取得して返す
    const m = url.pathname.match(/^\/api\/product\/([^/]+)$/);
    if (m) {
      return productLookup(m[1], env);
    }

    // それ以外 → FileMaker への生プロキシ（既存動作を維持）
    const fmUrl   = FM_SERVER + url.pathname + url.search;
    const headers = new Headers(request.headers);
    const fmRes   = await fetch(fmUrl, {
      method:  request.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(request.method) ? request.body : undefined,
    });
    const resHeaders = new Headers(fmRes.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
    return new Response(fmRes.body, { status: fmRes.status, headers: resHeaders });
  }
};

// ===== /api/product/{uuid} 処理 =====

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function productLookup(uuid, env) {
  if (!UUID_RE.test(uuid)) {
    return json({ error: 'invalid_uuid', message: 'UUID形式が不正です' }, 400);
  }

  let token;
  try {
    token = await getToken(env);
  } catch {
    return json({ error: 'fm_error', message: 'FileMakerサーバとの通信に失敗しました' }, 503);
  }

  try {
    const db     = encodeURIComponent(FM_DATABASE);
    const layout = encodeURIComponent(FM_LAYOUT);
    const res = await fetch(
      `${FM_SERVER}/fmi/data/v1/databases/${db}/layouts/${layout}/_find`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ query: [{ UUID: uuid.toUpperCase() }] }),
      }
    );
    const j = await res.json();
    if (j.messages?.[0]?.code !== '0') {
      return json({ error: 'not_found', message: '該当製品が見つかりません' }, 404);
    }
    const fd = j.response?.data?.[0]?.fieldData;
    if (!fd) {
      return json({ error: 'not_found', message: '該当製品が見つかりません' }, 404);
    }
    return json({
      uuid,
      物件名称:     fd['物件名称']     || '',
      部位名称:     fd['部位名称']     || '',
      製品番号:     fd['製品番号']     || '',
      型枠番号:     fd['型枠番号']     || '',
      製造ライン名称: fd['製造ライン名称'] || '',
      打設完了日:   fd['打設完了日']   || '',
      打設完了予定日: fd['打設完了予定日'] || '',
      ステータス:   fd['ステータス']   || '',
    });
  } finally {
    const db = encodeURIComponent(FM_DATABASE);
    fetch(`${FM_SERVER}/fmi/data/v1/databases/${db}/sessions/${token}`,
      { method: 'DELETE' }).catch(() => {});
  }
}

async function getToken(env) {
  const db  = encodeURIComponent(FM_DATABASE);
  const res = await fetch(`${FM_SERVER}/fmi/data/v1/databases/${db}/sessions`, {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${env.FM_USER}:${env.FM_PASS}`),
      'Content-Type':  'application/json',
    },
    body: '{}',
  });
  const j = await res.json();
  if (j.messages?.[0]?.code !== '0') throw new Error('FileMaker認証失敗');
  return j.response.token;
}
