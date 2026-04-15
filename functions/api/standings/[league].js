const VALID_LEAGUES = new Set(['cl', 'pl', 'cp', 'op']);

export async function onRequestGet({ params }) {
  const { league } = params;

  if (!VALID_LEAGUES.has(league)) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const res = await fetch(
      `https://npb-result.ant-npb.workers.dev/api/${league}`,
      { headers: { 'User-Agent': 'npbinfo-app/1.0' } }
    );

    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: 'データの取得に失敗しました', detail: err.message },
      { status: 502 }
    );
  }
}
